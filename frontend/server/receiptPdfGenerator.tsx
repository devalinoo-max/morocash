import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import QRCode from 'qrcode';

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

// Format money in FCFA
function formatMoneyPdf(amount: number): string {
  const rounded = Math.round(amount || 0);
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

// Format date
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

/**
 * Largeur du recu, en millimetres.
 *
 * Le papier utilise en boutique fait 105 mm de large au maximum : un recu plus
 * large sort rogne a l'impression, un recu plus etroit gaspille du papier. Ces
 * deux constantes sont le SEUL endroit a changer pour passer sur un autre
 * rouleau (58 mm, 80 mm...) — la mise en page suit.
 */
const RECEIPT_WIDTH_MM = 105;
const RECEIPT_WIDTH_PT = (RECEIPT_WIDTH_MM * 72) / 25.4; // 297.64 pt

const styles = StyleSheet.create({
  page: {
    width: RECEIPT_WIDTH_PT,
    paddingTop: 14,
    paddingBottom: 20,
    // Marge laterale : sur 105 mm, une imprimante thermique ne peut pas
    // toujours encrer les tout derniers millimetres du bord.
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#1E293B',
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    borderBottomStyle: 'dashed',
    paddingBottom: 8,
  },
  shopTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  shopSub: {
    fontSize: 8,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 1,
  },
  metaContainer: {
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    borderBottomStyle: 'dashed',
    paddingBottom: 6,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  label: {
    fontSize: 8,
    color: '#64748B',
  },
  value: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#1E293B',
  },
  valueBold: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
  },
  clientHighlight: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 3,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  itemLeft: {
    flex: 1,
    paddingRight: 6,
  },
  itemName: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#1E293B',
  },
  itemSub: {
    fontSize: 7.5,
    color: '#64748B',
    marginTop: 1,
  },
  itemTotal: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
  },
  totalsContainer: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
    borderTopStyle: 'dashed',
    paddingTop: 6,
  },
  totalBigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 4,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 4,
  },
  totalBigLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#0F172A',
  },
  totalBigVal: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#4F46E5',
  },
  remainingBox: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 4,
    padding: 5,
    marginTop: 4,
    marginBottom: 4,
  },
  remainingText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#E11D48',
    textAlign: 'center',
  },
  merchantDebtText: {
    fontSize: 7.5,
    color: '#9F1239',
    textAlign: 'center',
    marginTop: 2,
    fontFamily: 'Helvetica-Oblique',
  },
  paidFullText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#047857',
    textAlign: 'center',
    marginTop: 3,
  },
  customMessage: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Oblique',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    borderTopStyle: 'dashed',
  },
  qrContainer: {
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  qrImage: {
    width: 60,
    height: 60,
  },
  qrCaption: {
    fontSize: 7,
    color: '#64748B',
    fontFamily: 'Courier',
    marginTop: 2,
  },
  footerBrand: {
    fontSize: 7,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
});

export interface ReceiptSaleItem {
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface ReceiptSaleData {
  id: string;
  reference: string;
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

interface SingleReceiptProps {
  sale: ReceiptSaleData;
  settings: any;
  qrDataUrl: string;
  isMerchantCopy?: boolean;
}

const SingleReceiptPage: React.FC<SingleReceiptProps> = ({
  sale,
  settings,
  qrDataUrl,
  isMerchantCopy = false,
}) => {
  const shopName = settings.shopName || 'MoroCash Store';
  const city = settings.city || 'Abidjan';
  const phone = settings.ownerPhone;
  const showPhone = settings.showPhone !== false && phone;
  const subtotal = sale.subtotal || sale.totalAmount + (sale.discount || 0);
  const hasDiscount = (sale.discount || 0) > 0;
  const clientName = sale.customerName || 'Client de passage';
  const debtTotal = sale.customerTotalDebt !== undefined ? sale.customerTotalDebt : sale.remainingAmount;

  return (
    <Page size={[RECEIPT_WIDTH_PT, 'auto']} style={styles.page}>
      {/* 1. Shop Banner */}
      <View style={styles.headerContainer}>
        <Text style={styles.shopTitle}>{shopName}</Text>
        <Text style={styles.shopSub}>{city}</Text>
        {showPhone && <Text style={styles.shopSub}>Contact : {phone}</Text>}
      </View>

      {/* 2. Metadata */}
      <View style={styles.metaContainer}>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Réf :</Text>
          <Text style={styles.valueBold}>{sale.reference}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Client :</Text>
          <Text style={styles.clientHighlight}>{clientName}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Date :</Text>
          <Text style={styles.value}>{formatDatePdf(sale.createdAt)}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.label}>Vendu par :</Text>
          <Text style={styles.value}>{sale.sellerName || 'Vendeur'}</Text>
        </View>
      </View>

      {/* 3. Items Header & List */}
      <View style={styles.itemsHeader}>
        <Text style={[styles.label, { fontFamily: 'Helvetica-Bold' }]}>ARTICLE</Text>
        <Text style={[styles.label, { fontFamily: 'Helvetica-Bold' }]}>TOTAL</Text>
      </View>

      {sale.items.map((it, idx) => (
        <View key={idx} style={styles.itemRow}>
          <View style={styles.itemLeft}>
            <Text style={styles.itemName}>{it.name}</Text>
            <Text style={styles.itemSub}>
              {it.quantity} x {formatMoneyPdf(it.unitPrice)}
            </Text>
          </View>
          <Text style={styles.itemTotal}>{formatMoneyPdf(it.total)}</Text>
        </View>
      ))}

      {/* 4. Financial Totals */}
      <View style={styles.totalsContainer}>
        {hasDiscount && (
          <>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>Sous-total :</Text>
              <Text style={styles.value}>{formatMoneyPdf(subtotal)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.label}>
                Remise{sale.discountMode === 'PERCENTAGE' && sale.discountValue ? ` (${sale.discountValue} %)` : ''} :
              </Text>
              <Text style={styles.value}>− {formatMoneyPdf(sale.discount || 0)}</Text>
            </View>
          </>
        )}

        <View style={styles.totalBigRow}>
          <Text style={styles.totalBigLabel}>TOTAL :</Text>
          <Text style={styles.totalBigVal}>{formatMoneyPdf(sale.totalAmount)}</Text>
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Payé ({getPaymentMethodLabel(sale.paymentMethod)}) :</Text>
          <Text style={styles.valueBold}>{formatMoneyPdf(sale.paidAmount)}</Text>
        </View>

        {sale.remainingAmount > 0 ? (
          <View style={styles.remainingBox}>
            <Text style={styles.remainingText}>
              Reste à payer : {formatMoneyPdf(sale.remainingAmount)}
            </Text>
            {isMerchantCopy && (
              <Text style={styles.merchantDebtText}>
                Après cette commande, {clientName} te devra {formatMoneyPdf(debtTotal)} au total
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.paidFullText}>✓ Statut : Soldé intégralement</Text>
        )}
      </View>

      {/* 5. Custom message */}
      {settings.receiptMessage ? (
        <Text style={styles.customMessage}>{settings.receiptMessage}</Text>
      ) : null}

      {/* 6. Discreet QR code */}
      {qrDataUrl && (
        <View style={styles.qrContainer}>
          <Image src={qrDataUrl} style={styles.qrImage} />
          <Text style={styles.qrCaption}>{sale.reference}</Text>
        </View>
      )}

      {/* 7. Discreet MoroCash branding */}
      <Text style={styles.footerBrand}>Reçu généré avec MoroCash</Text>
    </Page>
  );
};

export async function generateReceiptsPdfBuffer(params: {
  sales: ReceiptSaleData[];
  settings: any;
  isMerchantCopy?: boolean;
}): Promise<Buffer> {
  const { sales, settings, isMerchantCopy = false } = params;

  // Generate QR codes for all sales
  const qrMap: Record<string, string> = {};
  for (const sale of sales) {
    try {
      qrMap[sale.id] = await QRCode.toDataURL(sale.reference || sale.id, {
        margin: 1,
        width: 120,
        errorCorrectionLevel: 'M',
      });
    } catch {
      qrMap[sale.id] = '';
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
        />
      ))}
    </Document>
  );

  return (await renderToBuffer(Doc)) as Buffer;
}
