import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import {
  layoutForWidth,
  formatMoneyFull,
  MIN_WIDTH_MM,
  MAX_WIDTH_MM,
  PRINT_MARGIN_MM,
  type PrintPageSpec,
  type ReceiptLayout,
} from '../src/utils/receiptPrint';

// Translation helper for payment methods
export function getPaymentMethodLabel(method: string | undefined): string {
  if (!method) return 'Espèces';
  switch (method.toUpperCase()) {
    case 'CASH':
    case 'ESPECES':
    case 'ESPÈCES':
      return 'Espèces';
    case 'WAVE':
      return 'Wave';
    case 'ORANGE_MONEY':
    case 'OM':
      return 'Orange Money';
    case 'MTN':
    case 'MTN_MONEY':
      return 'MTN';
    case 'MOOV':
    case 'MOOV_MONEY':
      return 'Moov';
    case 'VIREMENT':
      return 'Virement';
    default:
      return method;
  }
}

// Un reçu est un document : date complète, jamais « Aujourd'hui ».
function formatDatePdf(dateString: string): string {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} à ${hours}:${minutes}`;
  } catch {
    return dateString;
  }
}

const MM_TO_PT = 72 / 25.4;
const mm = (v: number) => v * MM_TO_PT;

/** Largeur du ticket si le client n'en envoie pas : le 58 mm, le plus répandu. */
const DEFAULT_PAGE: PrintPageSpec = { largeurMm: 58, hauteurMm: null };

/**
 * La page demandée, bornée : le formulaire bloque déjà hors de 30–250 mm, mais
 * le serveur ne fait pas confiance au client — une largeur de 2 mm ferait
 * planter la mise en page, une de 5 m produirait un PDF inimprimable.
 */
export function resolvePage(page: Partial<PrintPageSpec> | undefined): PrintPageSpec {
  const largeur = Number(page?.largeurMm);
  const hauteur = page?.hauteurMm == null ? null : Number(page.hauteurMm);
  return {
    largeurMm: Number.isFinite(largeur)
      ? Math.min(MAX_WIDTH_MM, Math.max(MIN_WIDTH_MM, largeur))
      : DEFAULT_PAGE.largeurMm,
    hauteurMm: hauteur !== null && Number.isFinite(hauteur) && hauteur > 0 ? hauteur : null,
  };
}

// Tout est noir sur blanc : les imprimantes thermiques n'impriment qu'en noir,
// et l'encre couleur coûte cher. Le gris sert seulement aux libellés.
const INK = '#000000';
const MUTED = '#444444';

interface LayoutSpec {
  font: string;
  fontBold: string;
  fontItalic: string;
  size: number;
  logoMm: number;
  marginXmm: number;
  marginYmm: number;
}

const LAYOUTS: Record<ReceiptLayout, LayoutSpec> = {
  // Chasse fixe : sur 48 mm, des colonnes qui tombent juste valent mieux
  // qu'une police proportionnelle qui gagne trois caractères.
  ETROIT: { font: 'Courier', fontBold: 'Courier-Bold', fontItalic: 'Courier-Oblique', size: 9, logoMm: 20, marginXmm: PRINT_MARGIN_MM / 2, marginYmm: 3 },
  MOYEN: { font: 'Courier', fontBold: 'Courier-Bold', fontItalic: 'Courier-Oblique', size: 10, logoMm: 28, marginXmm: PRINT_MARGIN_MM / 2, marginYmm: 4 },
  LARGE: { font: 'Helvetica', fontBold: 'Helvetica-Bold', fontItalic: 'Helvetica-Oblique', size: 10, logoMm: 35, marginXmm: 14, marginYmm: 14 },
};

export interface ReceiptSaleItem {
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface ReceiptSaleData {
  id: string;
  reference: string;
  /** Lien encodé dans le QR code : le client relit son reçu en ligne. */
  verifyUrl?: string;
  items: ReceiptSaleItem[];
  subtotal?: number;
  discount?: number;
  discountMode?: string;
  discountValue?: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
  customerName?: string;
  customerPhone?: string;
  customerTotalDebt?: number;
  createdAt: string;
  sellerName: string;
}

export interface ReceiptPdfSettings {
  shopName?: string;
  city?: string;
  adresse?: string;
  ownerPhone?: string;
  telephone?: string;
  showPhone?: boolean;
  showLogo?: boolean;
  receiptMessage?: string;
  /** Notes libres du bas de reçu (nota bene, conditions…), une par ligne. */
  receiptNotes?: string[];
  /** Logo déjà converti en noir et blanc par l'application (data URL PNG). */
  logoMonochrome?: string;
  receiptSettings?: {
    showLogo?: boolean;
    showShopName?: boolean;
    showPhone?: boolean;
    showAddress?: boolean;
    showSellerName?: boolean;
    showCustomerName?: boolean;
    showQrCode?: boolean;
    showMessage?: boolean;
    showWatermark?: boolean;
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function remiseLabel(sale: ReceiptSaleData): string {
  return sale.discountMode === 'PERCENTAGE' && sale.discountValue ? `Remise (${sale.discountValue} %)` : 'Remise';
}

interface SingleReceiptProps {
  sale: ReceiptSaleData;
  settings: ReceiptPdfSettings;
  qrDataUrl: string;
  isMerchantCopy: boolean;
  page: PrintPageSpec;
  /**
   * Réduction de la mise en page (1 = taille normale) : sur une feuille de
   * hauteur fixe (A5, A4…), un reçu long est resserré pour tenir sur UNE page.
   */
  scale?: number;
}

const SingleReceiptPage: React.FC<SingleReceiptProps> = ({ sale, settings, qrDataUrl, isMerchantCopy, page, scale = 1 }) => {
  const layout = layoutForWidth(page.largeurMm);
  const L = LAYOUTS[layout];
  const k = scale;
  const sp = (v: number) => v * k;
  const s = L.size * k;
  const narrow = layout === 'ETROIT';
  const wide = layout === 'LARGE';

  const cfg = settings.receiptSettings ?? {};
  const show = (flag: boolean | undefined, fallback: boolean) => (flag === undefined ? fallback : flag);

  const shopName = settings.shopName?.trim() || '';
  const address = settings.adresse?.trim() || settings.city?.trim() || '';
  // Le téléphone des Paramètres de la boutique, jamais celui de l'utilisateur.
  const phone = settings.telephone?.trim() || '';
  const clientName = sale.customerName?.trim() || 'Client de passage';
  const subtotal = sale.subtotal || sale.totalAmount + (sale.discount || 0);
  const hasDiscount = (sale.discount || 0) > 0;
  const debtTotal = sale.customerTotalDebt ?? Math.max(0, sale.remainingAmount);

  const showLogo = show(cfg.showLogo, settings.showLogo !== false) && Boolean(settings.logoMonochrome);
  const showShopName = show(cfg.showShopName, true) && Boolean(shopName);
  const showPhone = show(cfg.showPhone, settings.showPhone !== false) && Boolean(phone);
  const showAddress = show(cfg.showAddress, Boolean(settings.adresse)) && Boolean(address);
  const showSeller = show(cfg.showSellerName, true) && Boolean(sale.sellerName);
  const showCustomer = show(cfg.showCustomerName, true);
  const showQr = show(cfg.showQrCode, true) && Boolean(qrDataUrl);
  const notes = (settings.receiptNotes ?? []).map((n) => n.trim()).filter(Boolean);
  const showMessage = show(cfg.showMessage, true) && (Boolean(settings.receiptMessage) || notes.length > 0);
  const showWatermark = show(cfg.showWatermark, true);

  const st = StyleSheet.create({
    page: {
      paddingHorizontal: mm(L.marginXmm),
      paddingVertical: mm(L.marginYmm * k),
      backgroundColor: '#FFFFFF',
      fontFamily: L.font,
      fontSize: s,
      color: INK,
    },
    center: { textAlign: 'center' },
    shop: { fontFamily: L.fontBold, fontSize: wide ? s + 6 : s + 2, textAlign: 'center', textTransform: 'uppercase' },
    sub: { fontSize: s - 1, color: MUTED, textAlign: 'center', marginTop: sp(1) },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: sp(wide ? 3 : 1.5) },
    label: { color: MUTED },
    bold: { fontFamily: L.fontBold },
    // Séparateur : tirets sur ticket (une ligne de texte, rien à encrer de
    // plus), filet fin sur document.
    rule: wide
      ? { borderBottomWidth: 0.75, borderBottomColor: INK, marginVertical: sp(6) }
      : { marginVertical: sp(2) },
    section: { marginBottom: sp(wide ? 8 : 2) },
    itemName: { fontFamily: L.fontBold },
    itemSub: { fontSize: s - 1, color: MUTED },
    total: { fontFamily: L.fontBold, fontSize: wide ? s + 4 : s + 2 },
    stamp: { fontFamily: L.fontBold, textAlign: 'center', marginTop: sp(3) },
    message: { fontFamily: L.fontItalic, fontSize: s - 1, textAlign: 'center', marginTop: sp(4) },
    // Notes libres : même corps que le message, sans italique — ce sont des
    // mentions à lire (conditions, garantie), pas une formule de politesse.
    note: { fontFamily: L.font, fontSize: s - 1, textAlign: 'center', marginTop: sp(2) },
    watermark: { fontSize: s - 2, color: MUTED, textAlign: 'center', marginTop: sp(3) },
    th: { fontFamily: L.fontBold, fontSize: s - 1, paddingVertical: sp(4) },
    td: { paddingVertical: sp(4) },
    tableRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: INK },
  });

  // Un ticket de 48 mm tient ~26 caractères de Courier 9 pt : la ligne de
  // tirets est calculée pour remplir la largeur sans passer à la ligne.
  const dashCount = Math.max(10, Math.floor((mm(page.largeurMm - 2 * L.marginXmm) / (s * 0.6)) - 1));
  const Separator = () =>
    wide ? <View style={st.rule} /> : <Text style={[st.rule, st.label]}>{'-'.repeat(dashCount)}</Text>;

  const pageSize: [number, number] | [number, 'auto'] = page.hauteurMm
    ? [mm(page.largeurMm), mm(page.hauteurMm)]
    : [mm(page.largeurMm), 'auto' as const];

  const Meta = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) =>
    narrow ? (
      // Une colonne : le libellé et la valeur ne tiennent pas côte à côte sur 48 mm
      // dès que le client a un nom composé.
      <Text style={{ marginBottom: 1 }}>
        <Text style={st.label}>{label} </Text>
        <Text style={strong ? st.bold : undefined}>{value}</Text>
      </Text>
    ) : (
      <View style={st.row}>
        <Text style={st.label}>{label}</Text>
        <Text style={strong ? st.bold : undefined}>{value}</Text>
      </View>
    );

  const Amount = ({ label, value, strong, big }: { label: string; value: string; strong?: boolean; big?: boolean }) => (
    <View style={st.row}>
      <Text style={big ? st.total : strong ? st.bold : st.label}>{label}</Text>
      <Text style={big ? st.total : strong ? st.bold : undefined}>{value}</Text>
    </View>
  );

  return (
    // Ticket (hauteur automatique) : jamais coupé. Sans `wrap={false}`, le
    // moteur PDF découpait quand même le bas du reçu (message, QR, mention) en
    // deux petites pages de plus — trois morceaux de papier pour un seul reçu.
    <Page size={pageSize as any} style={st.page} wrap={Boolean(page.hauteurMm)}>
      {/* 1. Boutique */}
      <View style={[st.section, { alignItems: 'center' }]}>
        {showLogo && (
          <Image
            src={settings.logoMonochrome!}
            style={{ width: mm(L.logoMm * k), height: mm(L.logoMm * k), objectFit: 'contain', marginBottom: sp(3) }}
          />
        )}
        {showShopName && <Text style={st.shop}>{shopName}</Text>}
        {showAddress && <Text style={st.sub}>{address}</Text>}
        {showPhone && <Text style={st.sub}>Tél : {phone}</Text>}
        {isMerchantCopy && <Text style={[st.stamp, { fontSize: s - 1 }]}>COPIE COMMERÇANT</Text>}
      </View>
      <Separator />

      {/* 2. Références */}
      <View style={st.section}>
        <Meta label="N° :" value={sale.reference} strong />
        <Meta label="Date :" value={formatDatePdf(sale.createdAt)} />
        {showCustomer && <Meta label="Client :" value={clientName} strong />}
        {showSeller && <Meta label="Vendu par :" value={sale.sellerName} />}
      </View>
      <Separator />

      {/* 3. Articles — tous, sans exception : le repli n'existe qu'à l'écran. */}
      {wide ? (
        <View style={st.section}>
          <View style={[st.tableRow, { borderBottomWidth: 1 }]}>
            <Text style={[st.th, { flex: 1 }]}>Article</Text>
            <Text style={[st.th, { width: '12%', textAlign: 'right' }]}>Qté</Text>
            <Text style={[st.th, { width: '22%', textAlign: 'right' }]}>Prix unitaire</Text>
            <Text style={[st.th, { width: '22%', textAlign: 'right' }]}>Total</Text>
          </View>
          {sale.items.map((it, idx) => (
            <View key={idx} style={st.tableRow} wrap={false}>
              <Text style={[st.td, { flex: 1, paddingRight: 6 }]}>{it.name}</Text>
              <Text style={[st.td, { width: '12%', textAlign: 'right' }]}>{it.quantity}</Text>
              <Text style={[st.td, { width: '22%', textAlign: 'right' }]}>{formatMoneyFull(it.unitPrice)}</Text>
              <Text style={[st.td, st.bold, { width: '22%', textAlign: 'right' }]}>{formatMoneyFull(it.total)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={st.section}>
          {!narrow && (
            <View style={st.row}>
              <Text style={[st.label, st.bold]}>ARTICLE</Text>
              <Text style={[st.label, st.bold]}>TOTAL</Text>
            </View>
          )}
          {sale.items.map((it, idx) =>
            narrow ? (
              <View key={idx} style={{ marginBottom: 2 }} wrap={false}>
                <Text style={[st.itemName, { maxLines: 2, textOverflow: 'ellipsis' } as any]}>{it.name}</Text>
                <View style={st.row}>
                  <Text style={st.itemSub}>
                    {it.quantity} x {formatMoneyFull(it.unitPrice)}
                  </Text>
                  <Text style={st.bold}>{formatMoneyFull(it.total)}</Text>
                </View>
              </View>
            ) : (
              <View key={idx} style={[st.row, { marginBottom: 3 }]} wrap={false}>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={st.itemName}>{it.name}</Text>
                  <Text style={st.itemSub}>
                    {it.quantity} x {formatMoneyFull(it.unitPrice)}
                  </Text>
                </View>
                <Text style={st.bold}>{formatMoneyFull(it.total)}</Text>
              </View>
            )
          )}
        </View>
      )}
      <Separator />

      {/* 4. Montants — la remise s'intercale entre sous-total et total. */}
      <View style={[st.section, wide ? { width: '50%', alignSelf: 'flex-end' } : {}]} wrap={false}>
        {hasDiscount && (
          <>
            <Amount label="Sous-total :" value={formatMoneyFull(subtotal)} />
            <Amount label={`${remiseLabel(sale)} :`} value={`- ${formatMoneyFull(sale.discount)}`} />
          </>
        )}
        <Amount label="TOTAL :" value={formatMoneyFull(sale.totalAmount)} big />
        <Amount label={`Payé (${getPaymentMethodLabel(sale.paymentMethod)}) :`} value={formatMoneyFull(sale.paidAmount)} />
        {sale.remainingAmount > 0 ? (
          <Amount label="Reste à payer :" value={formatMoneyFull(sale.remainingAmount)} strong />
        ) : (
          <Text style={st.stamp}>PAYÉ EN ENTIER</Text>
        )}
        {/* Jamais sur la copie client : il n'a pas à lire le détail de ses autres dettes. */}
        {isMerchantCopy && (
          <Text style={[st.message, { fontFamily: L.fontBold, fontSize: s - 1 }]}>
            {debtTotal > 0
              ? `Après cette commande, ${firstName(clientName)} te doit ${formatMoneyFull(debtTotal)} au total`
              : `Après cette commande, ${firstName(clientName)} ne te doit plus rien`}
          </Text>
        )}
      </View>

      {/* 5. Message, QR, mention */}
      {(showMessage || showQr || showWatermark) && <Separator />}
      {showMessage && settings.receiptMessage && <Text style={st.message}>{settings.receiptMessage}</Text>}
      {showMessage &&
        notes.map((note, index) => (
          <Text key={`${index}-${note}`} style={st.note}>
            {note}
          </Text>
        ))}
      {showQr && (
        <View style={{ alignItems: 'center', marginTop: sp(4) }} wrap={false}>
          <Image src={qrDataUrl} style={{ width: mm((narrow ? 18 : 22) * Math.max(k, 0.8)), height: mm((narrow ? 18 : 22) * Math.max(k, 0.8)) }} />
        </View>
      )}
      {showWatermark && <Text style={st.watermark}>Reçu généré avec MoroCash</Text>}
    </Page>
  );
};

/** Nombre de pages d'un PDF, lu dans son arbre de pages. */
export function countPdfPages(pdf: Buffer): number {
  const counts = [...pdf.toString('latin1').matchAll(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)/g)].map((m) =>
    Number(m[1])
  );
  return counts.length > 0 ? Math.max(...counts) : 0;
}

// Réductions essayées, de la taille normale au plus petit encore lisible.
const FIT_SCALES = [1, 0.9, 0.8, 0.72, 0.64, 0.55];

export async function generateReceiptsPdfBuffer(params: {
  sales: ReceiptSaleData[];
  settings: ReceiptPdfSettings;
  isMerchantCopy?: boolean;
  page?: Partial<PrintPageSpec>;
}): Promise<Buffer> {
  const { sales, settings, isMerchantCopy = false } = params;
  const page = resolvePage(params.page);

  const qrMap: Record<string, string> = {};
  for (const sale of sales) {
    try {
      qrMap[sale.id] = await QRCode.toDataURL(sale.verifyUrl || sale.reference || sale.id, {
        margin: 1,
        width: 120,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' },
      });
    } catch {
      qrMap[sale.id] = '';
    }
  }

  // Feuille de hauteur fixe : un reçu = une page. On resserre la mise en page
  // jusqu'à ce qu'il tienne ; au-delà du plus petit encore lisible (reçu de
  // plusieurs dizaines d'articles), la suite passe sur la page suivante plutôt
  // que d'être rognée.
  const scaleMap: Record<string, number> = {};
  for (const sale of sales) {
    scaleMap[sale.id] = 1;
    if (!page.hauteurMm) continue;
    for (const scale of FIT_SCALES) {
      scaleMap[sale.id] = scale;
      const probe = await renderToBuffer(
        <Document>
          <SingleReceiptPage
            sale={sale}
            settings={settings}
            qrDataUrl={qrMap[sale.id]}
            isMerchantCopy={isMerchantCopy}
            page={page}
            scale={scale}
          />
        </Document>
      );
      if (countPdfPages(probe as Buffer) <= 1) break;
    }
  }

  const Doc = (
    <Document title="Reçus de commande MoroCash" author="MoroCash">
      {sales.map((sale) => (
        <SingleReceiptPage
          key={sale.id}
          sale={sale}
          settings={settings}
          qrDataUrl={qrMap[sale.id]}
          isMerchantCopy={isMerchantCopy}
          page={page}
          scale={scaleMap[sale.id]}
        />
      ))}
    </Document>
  );

  return (await renderToBuffer(Doc)) as Buffer;
}
