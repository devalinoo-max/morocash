import { Sale, ShopSettings, ReceiptDeliveryChannel } from '../types';
import { formatMoney, formatDate, formatPaymentMethod } from './formatters';

export function generateReceiptWhatsAppText(sale: Sale, settings: ShopSettings): string {
  const shopName = (settings.shopName || 'MOROCASH').toUpperCase();
  const city = settings.city || 'Abidjan';
  const clientName = sale.customerName?.trim() || 'Client de passage';

  let text = `🧾 *REÇU DE PAIEMENT — ${shopName}*\n`;
  text += `📍 ${city}\n`;
  if (settings.showPhone && settings.ownerPhone) {
    text += `📞 Contact : ${settings.ownerPhone}\n`;
  }
  text += `────────────────────\n`;
  text += `📄 Réf : ${sale.reference}\n`;
  text += `👤 Client : ${clientName}\n`;
  text += `📅 Date : ${formatDate(sale.createdAt)}\n`;
  text += `👔 Vendu par : ${sale.sellerName || 'Vendeur'}\n`;
  text += `────────────────────\n`;
  text += `*ARTICLES :*\n`;
  sale.items.forEach((it) => {
    text += `• ${it.name} (x${it.quantity}) : ${formatMoney(it.total)}\n`;
  });
  text += `────────────────────\n`;

  const subtotal = sale.subtotal || sale.totalAmount + (sale.discount || 0);
  if (sale.discount > 0) {
    text += `Sous-total : ${formatMoney(subtotal)}\n`;
    text += `Remise : −${formatMoney(sale.discount)}\n`;
  }
  text += `*TOTAL : ${formatMoney(sale.totalAmount)}*\n`;
  text += `Montant payé : ${formatMoney(sale.paidAmount)} (${formatPaymentMethod(sale.paymentMethod)})\n`;

  if (sale.remainingAmount > 0) {
    text += `⚠️ *Reste à payer : ${formatMoney(sale.remainingAmount)}*\n`;
  } else {
    text += `✅ *Statut : PAYÉ INTÉGRALEMENT*\n`;
  }

  if (settings.receiptMessage) {
    text += `────────────────────\n`;
    text += `_${settings.receiptMessage}_\n`;
  }
  text += `✨ _Reçu généré avec MoroCash_`;
  return text;
}

export function shareReceiptOnWhatsApp(
  sale: Sale,
  settings: ShopSettings,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): void {
  const rawText = generateReceiptWhatsAppText(sale, settings);
  const encoded = encodeURIComponent(rawText);
  const targetPhone = sale.customerPhone?.replace(/\D/g, '');
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
  const text = generateReceiptWhatsAppText(sale, settings);
  return navigator.clipboard.writeText(text).then(() => {
    if (onDelivered) {
      onDelivered('COPIE_TEXTE');
    }
  });
}

export async function fetchReceiptsPdfBlob(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopy: boolean = false
): Promise<Blob> {
  const payload = {
    sales: sales.map((s) => ({
      id: s.id,
      reference: s.reference,
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
      createdAt: s.createdAt,
      sellerName: s.sellerName,
    })),
    settings: {
      shopName: settings.shopName,
      city: settings.city,
      ownerPhone: settings.ownerPhone,
      showPhone: settings.showPhone,
      showLogo: settings.showLogo,
      receiptMessage: settings.receiptMessage,
    },
    isMerchantCopy,
  };

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error(
      'Pas de connexion : le reçu PDF est fabriqué sur le serveur. Envoie-le par WhatsApp ou copie le texte en attendant le réseau.'
    );
  }

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

function receiptFileName(sales: Sale[]): string {
  return sales.length === 1
    ? `recu-${sales[0].reference}.pdf`
    : `recus-groupes-${sales.length}.pdf`;
}

function triggerBlobDownload(blobUrl: string, fileName: string): void {
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
 * aucun fichier n'arrivait). Une minute laisse le temps au navigateur d'ouvrir
 * l'onglet ou d'écrire le fichier avant que la mémoire ne soit rendue.
 */
function releaseBlobUrlLater(blobUrl: string): void {
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export async function printReceiptsPdf(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopy: boolean = false,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<'opened' | 'downloaded'> {
  const blob = await fetchReceiptsPdfBlob(sales, settings, isMerchantCopy);
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
  isMerchantCopy: boolean = false,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<void> {
  const blob = await fetchReceiptsPdfBlob(sales, settings, isMerchantCopy);
  const blobUrl = URL.createObjectURL(blob);
  triggerBlobDownload(blobUrl, receiptFileName(sales));
  releaseBlobUrlLater(blobUrl);

  if (onDelivered) {
    onDelivered('TELECHARGEMENT');
  }
}
