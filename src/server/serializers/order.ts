import type { Order, OrderItem, UserRole } from '@prisma/client';

type OrderWithRelations = Order & { items?: OrderItem[] };

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
    return { ...rest, ...(items ? { items } : {}) };
  }

  return { ...order, ...(items ? { items } : {}) };
}

export function serializeOrderList<T extends OrderWithRelations>(orders: T[], role: UserRole) {
  return orders.map((o) => serializeOrder(o, role));
}
