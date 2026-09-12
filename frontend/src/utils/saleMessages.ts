import type { Sale } from '../types';
import { formatMoney } from './formatters';

/**
 * Le message WhatsApp envoyé au client.
 *
 * Partagé entre la liste et le détail : un reçu renvoyé depuis la liste et le
 * même reçu renvoyé depuis le détail doivent arriver identiques chez le
 * client, sinon il croit avoir reçu deux commandes différentes.
 */
export function buildReceiptMessage(sale: Sale, shopName: string): string {
  const client = sale.customerName?.trim() || 'Client';
  const boutique = shopName?.trim() || 'notre boutique';
  const lignes = sale.items
    .map((it) => `- ${it.name} (x${it.quantity}) : ${formatMoney(it.total)}`)
    .join('\n');
  const reste = sale.remainingAmount > 0 ? `\nReste à régler : ${formatMoney(sale.remainingAmount)}` : '';

  return `Bonjour ${client}, voici le récapitulatif de votre commande ${sale.reference} chez ${boutique} :\n${lignes}\nTotal : ${formatMoney(sale.totalAmount)}${reste}\nMerci pour votre confiance !`;
}

/** Relance : plus courte, et centrée sur ce qui reste dû. */
export function buildReminderMessage(sale: Sale, shopName: string): string {
  const client = sale.customerName?.trim() || 'Client';
  const boutique = shopName?.trim() || 'notre boutique';
  return `Bonjour ${client}, un petit rappel amical de ${boutique} : il reste ${formatMoney(sale.remainingAmount)} à régler sur votre commande ${sale.reference}. Merci !`;
}

/** Ouvre WhatsApp sur le numéro du client, ou sur le sélecteur de contact. */
export function openWhatsApp(phone: string | undefined, message: string) {
  const numero = (phone ?? '').replace(/[^0-9]/g, '');
  const texte = encodeURIComponent(message);
  window.open(numero ? `https://wa.me/${numero}?text=${texte}` : `https://wa.me/?text=${texte}`, '_blank');
}
