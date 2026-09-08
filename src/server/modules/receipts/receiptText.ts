import type { Order, OrderItem, Business, Customer } from '@prisma/client';

export interface ReceiptData {
  order: Order & { items: OrderItem[] };
  business: Business;
  customer: Customer;
}

/** Reçu texte brut — lisible tel quel, imprimable sur imprimante thermique 58/80mm. */
export function generateTextReceipt({ order, business, customer }: ReceiptData): string {
  const lines: string[] = [];
  lines.push(business.nom);
  if (business.ville) lines.push(business.ville);
  lines.push('--------------------------------');
  lines.push(`Commande : ${order.numero}`);
  lines.push(`Date     : ${order.createdAt.toLocaleString('fr-FR')}`);
  lines.push(`Client   : ${customer.nom}`);
  lines.push('--------------------------------');

  for (const item of order.items) {
    lines.push(`${item.libelle}`);
    lines.push(`  ${item.qte} x ${item.prixUnitaire} = ${item.totalLigne} FCFA`);
  }

  lines.push('--------------------------------');
  lines.push(`Sous-total       : ${order.sousTotal} FCFA`);
  if (order.remiseMontant > 0) {
    lines.push(`Remise           : -${order.remiseMontant} FCFA`);
  }
  lines.push(`TOTAL            : ${order.total} FCFA`);
  lines.push(`Statut paiement  : ${order.statutPaiement}`);
  lines.push('--------------------------------');
  lines.push('Merci de votre confiance !');

  return lines.join('\n');
}
