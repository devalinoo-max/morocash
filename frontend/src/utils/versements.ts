import type { Sale, ShopSettings, Versement } from '../types';
import { formatPaymentMethod } from './formatters';
import { formatMoneyFull } from './receiptPrint';
import { receiptPhone } from './receiptHelpers';

/**
 * Mots et mises en forme des versements, partagés par tous les écrans qui en
 * montrent un : liste du jour, fiche client, détail de commande, reçu.
 * Aucun calcul d'argent ici : les montants viennent tels quels du serveur.
 */

/** « 1er versement », « 2e versement »… */
export function versementLabel(numero: number | null | undefined): string {
  if (!numero) return 'Versement';
  return `${numero}${numero === 1 ? 'er' : 'e'} versement`;
}

/** CMD-20260320-0042 → « #0042 ». */
export function shortOrderNumber(reference: string | null | undefined): string {
  if (!reference) return '';
  const dernier = reference.split('-').pop() ?? reference;
  return `#${dernier}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** « 20 mars », avec l'année seulement si ce n'est pas la nôtre. */
export function dayMonth(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return '';
  const memeAnnee = d.getFullYear() === new Date().getFullYear();
  return d
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(memeAnnee ? {} : { year: 'numeric' }) })
    .replace('.', '');
}

/** « aujourd'hui », « hier », ou « 8 oct ». */
export function relativeDay(dateInput: string | Date, now: Date = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (sameDay(d, now)) return 'aujourd’hui';
  const hier = new Date(now);
  hier.setDate(hier.getDate() - 1);
  if (sameDay(d, hier)) return 'hier';
  return dayMonth(d);
}

/** « Commande #0042 du 20 mars ». */
export function orderLabel(v: Pick<Versement, 'orderReference' | 'orderDate'>): string {
  if (!v.orderReference) return 'Sans commande';
  const date = dayMonth(v.orderDate);
  return `Commande ${shortOrderNumber(v.orderReference)}${date ? ` du ${date}` : ''}`;
}

/**
 * Les versements d'une commande déjà chargée, du 1er au dernier. Les chiffres
 * (rang, reste après, numéro de reçu) sont ceux que le serveur a figés sur
 * chaque paiement : cette fonction ne fait que les présenter, ce qui permet
 * d'ouvrir un reçu déjà synchronisé sans réseau.
 */
export function versementsOfSale(sale: Sale): Versement[] {
  return (sale.payments ?? [])
    .map((p, index) => ({
      id: p.id,
      clientUuid: p.clientUuid ?? p.id,
      numero: p.numero ?? null,
      atOrder: p.clientUuid ? p.clientUuid === `${sale.clientUuid}:payment` : index === 0 && p.createdAt === sale.createdAt,
      orderId: sale.id,
      orderReference: sale.reference,
      orderDate: sale.createdAt,
      orderTotal: sale.totalAmount,
      orderClientUuid: sale.clientUuid,
      customerId: sale.customerId ?? null,
      customerName: sale.customerName ?? null,
      customerPhone: sale.customerPhone ?? null,
      amount: p.amount,
      method: p.method,
      createdAt: p.createdAt,
      remainingAfter: p.remainingAfter ?? null,
      paidSoFar:
        p.remainingAfter !== null && p.remainingAfter !== undefined
          ? sale.totalAmount - p.remainingAfter
          : null,
      receiptNumber: p.receiptNumber ?? null,
      isCancelled: p.isCancelled,
      cancelReason: p.cancelReason,
      collectedBy: p.collectedBy ?? null,
    }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Tous les versements d'un client, toutes commandes confondues, du plus récent au plus ancien. */
export function versementsOfCustomer(sales: Sale[], customerId: string): Versement[] {
  return sales
    .filter((s) => s.customerId === customerId)
    .flatMap(versementsOfSale)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Le reçu commun s'appuie sur une commande pour son en-tête. En mode
 * versement il n'en lit que l'identifiant : cette enveloppe suffit, même
 * quand la commande d'origine n'est pas chargée sur l'appareil.
 */
export function receiptShellFor(v: Versement): Sale {
  return {
    id: `versement-${v.id}`,
    clientUuid: v.orderClientUuid ?? '',
    reference: v.receiptNumber ?? '',
    items: [],
    subtotal: 0,
    discount: 0,
    totalAmount: v.orderTotal ?? 0,
    paidAmount: v.paidSoFar ?? 0,
    remainingAmount: v.remainingAfter ?? 0,
    paymentStatus: 'PARTIAL',
    paymentMethod: v.method,
    customerId: v.customerId ?? undefined,
    customerName: v.customerName ?? undefined,
    customerPhone: v.customerPhone ?? undefined,
    createdAt: v.createdAt,
    sellerName: v.collectedBy ?? '',
    syncStatus: v.isPending ? 'PENDING_SYNC' : 'SYNCED',
  };
}

function dateHeure(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${heure}`;
}

/** Date et heure DU VERSEMENT, en toutes lettres : « 10 octobre 2026 à 14:05 ». */
export const versementDateTime = dateHeure;

/** Texte du reçu de versement pour WhatsApp. Montants complets, jamais abrégés. */
export function versementWhatsAppText(v: Versement, settings: ShopSettings): string {
  const shopName = (settings.shopName || '').trim().toUpperCase();
  const phone = receiptPhone(settings);
  const line = '────────────────────';

  let text = `🧾 *${shopName ? `REÇU DE PAIEMENT — ${shopName}` : 'REÇU DE PAIEMENT'}*\n`;
  if (settings.showPhone && phone) text += `📞 Contact : ${phone}\n`;
  text += `${line}\n`;
  text += `📄 N° : ${v.isPending || !v.receiptNumber ? 'En attente d’envoi' : v.receiptNumber}\n`;
  text += `👤 Client : ${v.customerName?.trim() || 'Client'}\n`;
  text += `📅 Date : ${dateHeure(v.createdAt)}\n`;
  if (v.orderReference) text += `🛒 ${orderLabel(v)} — ${versementLabel(v.numero)}\n`;
  text += `${line}\n`;
  text += `*Payé ce jour : ${formatMoneyFull(v.amount)}* (${formatPaymentMethod(v.method)})\n`;
  if (v.orderTotal !== null) text += `Montant de la commande : ${formatMoneyFull(v.orderTotal)}\n`;
  if (v.paidSoFar !== null) text += `Déjà payé : ${formatMoneyFull(v.paidSoFar)}\n`;
  if (v.remainingAfter !== null) {
    text +=
      v.remainingAfter > 0
        ? `⚠️ *Reste à payer : ${formatMoneyFull(v.remainingAfter)}*\n`
        : '✅ *COMMANDE SOLDÉE*\n';
  }
  text += '✨ _Reçu généré avec MoroCash_';
  return text;
}
