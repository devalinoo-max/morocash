import type { Order, OrderItem, UserRole } from '@prisma/client';

type OrderWithRelations = Order & {
  items?: OrderItem[];
  payments?: { montant: number; statut: string }[];
};

/**
 * Payé et reste à payer, calculés ici pour que l'écran n'ait jamais à les
 * déduire : seuls les versements valides comptent, et une commande annulée ne
 * doit plus rien.
 */
function paymentTotals(order: OrderWithRelations) {
  if (!order.payments) return {};
  const paye = order.payments.filter((p) => p.statut === 'VALIDE').reduce((acc, p) => acc + p.montant, 0);
  return { paye, reste: order.statut === 'ANNULEE' ? 0 : Math.max(0, order.total - paye) };
}

/**
 * Filtrage par rôle AVANT la réponse (spec §0 règle 7) : un SELLER ne reçoit
 * jamais coutTotal (Order) ni coutUnitaire (OrderItem) — ces champs de coût
 * étaient renvoyés bruts par /orders et /orders/:id avant ce correctif, en
 * violation directe de la règle (même classe de bug que le test de sécurité #2,
 * jamais re-vérifié pour les commandes).
 */
export function serializeOrder<T extends OrderWithRelations>(order: T, role: UserRole) {
  const items = order.items?.map((item) => {
    if (role === 'SELLER') {
      const { coutUnitaire, ...rest } = item;
      return rest;
    }
    return item;
  });

  if (role === 'SELLER') {
    const { coutTotal, ...rest } = order;
    return { ...rest, ...(items ? { items } : {}), ...paymentTotals(order) };
  }

  return { ...order, ...(items ? { items } : {}), ...paymentTotals(order) };
}

export function serializeOrderList<T extends OrderWithRelations>(orders: T[], role: UserRole) {
  return orders.map((o) => serializeOrder(o, role));
}
