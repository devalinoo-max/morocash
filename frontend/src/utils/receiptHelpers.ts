import { Sale, ShopSettings, ReceiptDeliveryChannel } from '../types';
import { formatDate, formatPaymentMethod } from './formatters';
import { formatMoneyFull, pageForPrefs, readPrintPrefs, type PrintPageSpec } from './receiptPrint';

/**
 * Jeton remplacé par le nom réel de la boutique dans le message de fin de reçu.
 * Un message saisi « À bientôt chez Étoile d'Afrique » restait figé sur ce nom
 * — y compris pour une autre boutique ouverte ensuite sur le même appareil.
 */
export const SHOP_NAME_TOKEN = '{boutique}';

/** Message de fin de reçu, nom de la boutique injecté au moment de l'affichage. */
export function resolveReceiptMessage(settings: Pick<ShopSettings, 'receiptMessage' | 'shopName'>): string {
  const message = settings.receiptMessage?.trim() || '';
  if (!message) return '';
  const shopName = settings.shopName?.trim() || '';
  // Nom vide : on resserre seulement les espaces doublés et l'espace laissée
  // devant un point ou une virgule. L'espace française avant « ! ? : » reste.
  return message
    .split(SHOP_NAME_TOKEN)
    .join(shopName)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim();
}

/**
 * Forme enregistrée du message : le nom actuel de la boutique, s'il y est
 * écrit en toutes lettres, redevient le jeton — il suivra un changement de nom.
 */
export function toStoredReceiptMessage(message: string, shopName: string): string {
  const name = shopName.trim();
  const text = message.trim();
  if (!name || !text) return text;
  return text.split(name).join(SHOP_NAME_TOKEN);
}

/** Message tel qu'on l'édite dans les Paramètres : avec le vrai nom. */
export function editableReceiptMessage(settings: Pick<ShopSettings, 'receiptMessage' | 'shopName'>): string {
  const name = settings.shopName?.trim();
  const message = settings.receiptMessage || '';
  return name ? message.split(SHOP_NAME_TOKEN).join(name) : message;
}

/**
 * Téléphone du reçu : celui des Paramètres de la boutique, et lui seul. Le
 * repli sur le téléphone de la personne connectée affichait le numéro d'un
 * vendeur comme contact de la boutique.
 */
export function receiptPhone(settings: Pick<ShopSettings, 'telephone'>): string {
  return settings.telephone?.trim() || '';
}

/**
 * Lien de vérification du reçu, encodé dans son QR code : le client le scanne
 * et relit son reçu en ligne. Il porte la boutique (sans elle, la base refuse
 * toute lecture) et le clientUuid de la commande — aléatoire, donc impossible
 * à deviner à partir d'un numéro de reçu voisin.
 */
export function receiptVerifyUrl(
  sale: Pick<Sale, 'clientUuid'>,
  settings: Pick<ShopSettings, 'businessId'>
): string {
  if (!sale.clientUuid || !settings.businessId || typeof window === 'undefined') return '';
  return `${window.location.origin}/api/v1/receipts/verify/${encodeURIComponent(settings.businessId)}/${encodeURIComponent(sale.clientUuid)}`;
}

/**
 * Texte du reçu. `plain` retire le gras et les émojis de WhatsApp : c'est la
 * version « Copier », qui doit se coller proprement n'importe où (SMS, note,
 * e-mail). Les montants restent complets : un reçu ne s'abrège pas.
 */
export function generateReceiptWhatsAppText(
  sale: Sale,
  settings: ShopSettings,
  options: { plain?: boolean } = {}
): string {
  const plain = options.plain === true;
  const b = (t: string) => (plain ? t : `*${t}*`);
  const i = (t: string) => (plain ? t : `_${t}_`);
  const e = (emoji: string) => (plain ? '' : `${emoji} `);

  const shopName = (settings.shopName || '').toUpperCase();
  const place = settings.adresse || settings.city;
  const phone = receiptPhone(settings);
  const clientName = sale.customerName?.trim() || 'Client de passage';
  const line = plain ? '--------------------' : '────────────────────';

  let text = `${e('🧾')}${b(shopName ? `REÇU — ${shopName}` : 'REÇU')}\n`;
  if (place) text += `${e('📍')}${place}\n`;
  if (settings.showPhone && phone) {
    text += `${e('📞')}Contact : ${phone}\n`;
  }
  text += `${line}\n`;
  text += `${e('📄')}N° : ${sale.reference}\n`;
  text += `${e('👤')}Client : ${clientName}\n`;
  text += `${e('📅')}Date : ${formatDate(sale.createdAt)}\n`;
  if (sale.sellerName) text += `${e('👔')}Vendu par : ${sale.sellerName}\n`;
  text += `${line}\n`;
  text += `${b('ARTICLES :')}\n`;
  sale.items.forEach((it) => {
    text += `${plain ? '-' : '•'} ${it.name} (x${it.quantity}) : ${formatMoneyFull(it.total)}\n`;
  });
  text += `${line}\n`;

  const subtotal = sale.subtotal || sale.totalAmount + (sale.discount || 0);
  if (sale.discount > 0) {
    const pct = sale.discountMode === 'PERCENTAGE' && sale.discountValue ? ` (${sale.discountValue} %)` : '';
    text += `Sous-total : ${formatMoneyFull(subtotal)}\n`;
    text += `Remise${pct} : − ${formatMoneyFull(sale.discount)}\n`;
  }
  text += `${b(`TOTAL : ${formatMoneyFull(sale.totalAmount)}`)}\n`;
  text += `Payé : ${formatMoneyFull(sale.paidAmount)} (${formatPaymentMethod(sale.paymentMethod)})\n`;

  if (sale.remainingAmount > 0) {
    text += `${e('⚠️')}${b(`Reste à payer : ${formatMoneyFull(sale.remainingAmount)}`)}\n`;
  } else {
    text += `${e('✅')}${b('PAYÉ EN ENTIER')}\n`;
  }

  const message = resolveReceiptMessage(settings);
  if (message) {
    text += `${line}\n`;
    text += `${i(message)}\n`;
  }
  const verifyUrl = receiptVerifyUrl(sale, settings);
  if (verifyUrl) text += `${e('🔎')}Vérifier ce reçu : ${verifyUrl}\n`;
  text += `${e('✨')}${i('Reçu généré avec MoroCash')}`;
  return text;
}

/**
 * Numéro prêt pour wa.me : chiffres seuls, indicatif compris.
 * « 07 08 12 34 56 » + « +225 » → « 2250708123456 ». Un numéro déjà saisi
 * avec son indicatif (+225…, 00225…) est gardé tel quel.
 */
export function toWhatsAppNumber(phone: string, defaultDialCode = '225'): string {
  const raw = phone.trim();
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  const code = defaultDialCode.replace(/\D/g, '');
  if (code && digits.startsWith(code) && digits.length > 10) return digits;
  return `${code}${digits}`;
}

/** « 0708123456 » → « 07 08 12 34 56 ». Laisse intact ce qui n'a pas ce format. */
export function formatPhoneDisplay(phone: string | undefined | null): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits.replace(/(\d{2})(?=\d)/g, '$1 ');
  return (phone ?? '').trim();
}

export function shareReceiptOnWhatsApp(
  sale: Sale,
  settings: ShopSettings,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void,
  toPhone?: string
): void {
  const rawText = generateReceiptWhatsAppText(sale, settings);
  const encoded = encodeURIComponent(rawText);
  const targetPhone = toWhatsAppNumber(toPhone ?? sale.customerPhone ?? '');
  const url = targetPhone
    ? `https://wa.me/${targetPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  window.open(url, '_blank');
  if (onDelivered) {
    onDelivered('WHATSAPP');
  }
}

export function copyReceiptToClipboard(
  sale: Sale,
  settings: ShopSettings,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<void> {
  const text = generateReceiptWhatsAppText(sale, settings, { plain: true });
  return navigator.clipboard.writeText(text).then(() => {
    if (onDelivered) {
      onDelivered('COPIE_TEXTE');
    }
  });
}

/**
 * Logo en noir et blanc, réduit, en PNG.
 *
 * La conversion se fait ici et non sur le serveur : le logo est déjà une image
 * du navigateur (data URL), le canvas sait le passer en niveaux de gris, et le
 * serveur n'a ainsi besoin d'aucune bibliothèque d'image. Le PDF, lui, reste
 * fabriqué côté serveur.
 */
async function monochromeLogo(src: string | undefined): Promise<string | undefined> {
  if (!src || typeof document === 'undefined') return undefined;
  try {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('logo illisible'));
      img.src = src;
    });
    const size = 300;
    const ratio = Math.min(1, size / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    // Fond blanc d'abord : un logo transparent deviendrait sinon noir.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let p = 0; p < px.length; p += 4) {
      const gray = Math.round(0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]);
      px[p] = px[p + 1] = px[p + 2] = gray;
    }
    ctx.putImageData(data, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // Un logo qu'on ne sait pas lire ne doit pas empêcher d'imprimer le reçu.
    return undefined;
  }
}

export interface ReceiptPdfOptions {
  isMerchantCopy?: boolean;
  /** Taille de page ; à défaut, le format par défaut de la boutique. */
  page?: PrintPageSpec;
  /** Dette totale du client, par commande — n'apparaît que sur la copie commerçant. */
  customerDebts?: Record<string, number>;
}

export async function fetchReceiptsPdfBlob(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopyOrOptions: boolean | ReceiptPdfOptions = false
): Promise<Blob> {
  const options: ReceiptPdfOptions =
    typeof isMerchantCopyOrOptions === 'boolean' ? { isMerchantCopy: isMerchantCopyOrOptions } : isMerchantCopyOrOptions;
  const isMerchantCopy = options.isMerchantCopy === true;
  const page = options.page ?? pageForPrefs(readPrintPrefs(settings.receiptSettings));

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'Pas de connexion : le reçu PDF est fabriqué sur le serveur. Envoie-le par WhatsApp ou copie le texte en attendant le réseau.'
    );
  }

  const wantsLogo = (settings.receiptSettings?.showLogo ?? settings.showLogo) !== false;
  const logoMonochrome = wantsLogo ? await monochromeLogo(settings.logoTransparentUrl || settings.logoUrl) : undefined;

  const payload = {
    sales: sales.map((s) => ({
      id: s.id,
      reference: s.reference,
      verifyUrl: receiptVerifyUrl(s, settings),
      items: s.items.map((it) => ({
        name: it.name,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
        total: it.total,
      })),
      subtotal: s.subtotal,
      discount: s.discount,
      discountMode: s.discountMode,
      discountValue: s.discountValue,
      totalAmount: s.totalAmount,
      paidAmount: s.paidAmount,
      remainingAmount: s.remainingAmount,
      paymentMethod: s.paymentMethod,
      customerName: s.customerName,
      customerPhone: s.customerPhone,
      // Envoyée seulement pour la copie commerçant : la copie client n'a pas à
      // transporter le détail des autres dettes, même sans l'afficher.
      customerTotalDebt: isMerchantCopy ? options.customerDebts?.[s.id] : undefined,
      createdAt: s.createdAt,
      sellerName: s.sellerName,
    })),
    settings: {
      shopName: settings.shopName,
      city: settings.city,
      adresse: settings.adresse,
      telephone: receiptPhone(settings),
      showPhone: settings.showPhone,
      showLogo: settings.showLogo,
      receiptMessage: resolveReceiptMessage(settings),
      receiptSettings: settings.receiptSettings,
      logoMonochrome,
    },
    isMerchantCopy,
    page,
  };

  let res: Response;
  try {
    res = await fetch('/api/v1/receipts/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // fetch ne rejette que sur une panne réseau/DNS/CORS — jamais sur un 4xx/5xx.
    throw new Error('Serveur injoignable : vérifie ta connexion, puis réessaie.');
  }

  if (!res.ok) {
    // `statusText` est vide en HTTP/2 (donc sur Vercel) : le message affiché au
    // commerçant était "Erreur serveur PDF :" suivi de rien du tout. On lit le
    // corps, que les deux implémentations du endpoint renvoient en JSON
    // ({ error, details }), et on garde le code HTTP qui, lui, dit toujours
    // quelque chose : 404 = endpoint absent sur cet hébergement, 500 = échec de
    // génération côté serveur.
    throw new Error(`${await describeErrorResponse(res)} (HTTP ${res.status})`);
  }

  const blob = await res.blob();

  // Un hébergement mal routé répond 200 + index.html au lieu du PDF : sans ce
  // garde-fou on ouvre ou on télécharge un "PDF" qui est en fait la page
  // d'accueil, et le commerçant ne comprend pas pourquoi son reçu est illisible.
  if (blob.type && !blob.type.includes('pdf') && !blob.type.includes('octet-stream')) {
    throw new Error(
      `Le serveur a répondu ${blob.type} au lieu d'un PDF — l'adresse /api/v1/receipts/pdf n'est pas branchée sur cet hébergement.`
    );
  }

  return blob;
}

async function describeErrorResponse(res: Response): Promise<string> {
  if (res.status === 404) {
    return 'Le service de reçus PDF est introuvable sur ce serveur';
  }
  try {
    const raw = await res.text();
    try {
      const data = JSON.parse(raw) as { error?: string; details?: string };
      const parts = [data.error, data.details].filter(Boolean);
      if (parts.length > 0) return parts.join(' — ');
    } catch {
      // Réponse non JSON : page d'erreur HTML d'un proxy, par exemple.
    }
    if (raw.trim() && !raw.trimStart().startsWith('<')) {
      return raw.trim().slice(0, 200);
    }
  } catch {
    // Corps illisible : on se rabat sur le seul code HTTP.
  }
  return 'Erreur du serveur PDF';
}

/**
 * Message à afficher au commerçant quand une action reçu échoue. On garde la
 * cause réelle (endpoint absent, serveur en erreur, hors ligne...) : un
 * "Erreur lors du téléchargement" sans plus de détail ne permet ni au
 * commerçant de contourner, ni à nous de diagnostiquer à distance.
 */
export function receiptErrorMessage(prefix: string, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  return detail ? `${prefix} : ${detail}` : prefix;
}

export function receiptFileName(sales: Pick<Sale, 'reference'>[]): string {
  return sales.length === 1
    ? `recu-${sales[0].reference}.pdf`
    : `recus-groupes-${sales.length}.pdf`;
}

export function triggerBlobDownload(blobUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  // rel="noopener" : sur les navigateurs qui ignorent `download` pour un blob
  // (Safari iOS), le lien se comporte comme une navigation — autant qu'elle
  // n'expose pas window.opener.
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Libère l'URL blob, mais pas tout de suite : révoquée dans la foulée du clic,
 * elle annule le téléchargement encore en cours d'amorçage sur Firefox et sur
 * plusieurs navigateurs Android (le bouton "Télécharger" semblait fonctionner,
 * aucun fichier n'arrivait). Dix minutes laissent aussi le temps au commerçant
 * d'appuyer sur « Télécharger » quand l'onglet a été bloqué.
 */
function releaseBlobUrlLater(blobUrl: string): void {
  setTimeout(() => URL.revokeObjectURL(blobUrl), 600_000);
}

/**
 * Onglet ouvert AVANT l'appel réseau, dans le geste même du commerçant.
 *
 * Un window.open() lancé après un `await` n'est plus considéré comme déclenché
 * par le clic : la plupart des navigateurs le bloquent en silence. On ouvre
 * donc l'onglet tout de suite, vide, et on y charge le PDF quand il arrive.
 */
export function reserveTabForPdf(): Window | null {
  try {
    const tab = window.open('', '_blank');
    if (tab) {
      tab.document.title = 'Reçu en préparation…';
      tab.document.body.style.fontFamily = 'system-ui, sans-serif';
      tab.document.body.textContent = 'Préparation du reçu…';
    }
    return tab;
  } catch {
    return null;
  }
}

export interface OpenedPdf {
  /** false : l'onglet a été bloqué, il faut proposer « Télécharger ». */
  opened: boolean;
  download: () => void;
}

export async function openReceiptPdf(
  sales: Sale[],
  settings: ShopSettings,
  options: ReceiptPdfOptions,
  reservedTab: Window | null
): Promise<OpenedPdf> {
  let blob: Blob;
  try {
    blob = await fetchReceiptsPdfBlob(sales, settings, options);
  } catch (err) {
    reservedTab?.close();
    throw err;
  }
  const blobUrl = URL.createObjectURL(blob);
  releaseBlobUrlLater(blobUrl);
  const download = () => triggerBlobDownload(blobUrl, receiptFileName(sales));

  if (reservedTab && !reservedTab.closed) {
    reservedTab.location.href = blobUrl;
    return { opened: true, download };
  }
  return { opened: false, download };
}

export async function printReceiptsPdf(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopy: boolean = false,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<'opened' | 'downloaded'> {
  const blob = await fetchReceiptsPdfBlob(sales, settings, { isMerchantCopy });
  const blobUrl = URL.createObjectURL(blob);

  // window.open() intervient après un `await` réseau : la plupart des
  // navigateurs ne le considèrent alors plus comme déclenché directement par
  // le clic utilisateur et le bloquent silencieusement (pas d'exception, pas
  // de nouvel onglet — le bouton "Imprimer" semblait ne rien faire). On
  // détecte ce blocage via la valeur de retour et on bascule sur un
  // téléchargement direct, comme le fait déjà LabelPrintModal.
  const newTab = window.open(blobUrl, '_blank');
  let result: 'opened' | 'downloaded';
  if (newTab) {
    result = 'opened';
  } else {
    triggerBlobDownload(blobUrl, receiptFileName(sales));
    result = 'downloaded';
  }
  releaseBlobUrlLater(blobUrl);

  if (onDelivered) {
    onDelivered('IMPRESSION');
  }
  return result;
}

export async function downloadReceiptsPdf(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopyOrOptions: boolean | ReceiptPdfOptions = false,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<void> {
  const blob = await fetchReceiptsPdfBlob(sales, settings, isMerchantCopyOrOptions);
  const blobUrl = URL.createObjectURL(blob);
  triggerBlobDownload(blobUrl, receiptFileName(sales));
  releaseBlobUrlLater(blobUrl);

  if (onDelivered) {
    onDelivered('TELECHARGEMENT');
  }
}
