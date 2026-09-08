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

  const res = await fetch('/api/v1/receipts/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Erreur serveur PDF : ${res.statusText}`);
  }

  return await res.blob();
}

export async function printReceiptsPdf(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopy: boolean = false,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<void> {
  try {
    const blob = await fetchReceiptsPdfBlob(sales, settings, isMerchantCopy);
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    if (onDelivered) {
      onDelivered('IMPRESSION');
    }
  } catch (err) {
    console.error('Erreur impression PDF:', err);
    // Fallback window.print
    window.print();
    if (onDelivered) {
      onDelivered('IMPRESSION');
    }
  }
}

export async function downloadReceiptsPdf(
  sales: Sale[],
  settings: ShopSettings,
  isMerchantCopy: boolean = false,
  onDelivered?: (canal: ReceiptDeliveryChannel) => void
): Promise<void> {
  const blob = await fetchReceiptsPdfBlob(sales, settings, isMerchantCopy);
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download =
    sales.length === 1
      ? `recu-${sales[0].reference}.pdf`
      : `recus-groupes-${sales.length}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  if (onDelivered) {
    onDelivered('TELECHARGEMENT');
  }
}
