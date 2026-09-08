import { runInTenantTransaction } from '@/server/repositories/base';

/**
 * Le cahier des charges (§9) ne précise pas le contenu exact renvoyé par
 * `GET /sync/pull?since=` — seul le principe « delta depuis un horodatage » est
 * donné. Aucun modèle du schéma (§2) ne porte de colonne `updatedAt` : ce pull ne
 * peut donc détecter que des CRÉATIONS depuis `since`, pas les mises à jour en
 * place (stock décrémenté, statut de commande changé, caisse fermée, etc.) —
 * limite structurelle du schéma tel que spécifié, pas un oubli d'implémentation.
 */
export async function pullSince(businessId: string, since: Date) {
  return runInTenantTransaction(businessId, async (tx) => {
    const [products, customers, orders, expenses, stockMovements, cashMovements, payments] = await Promise.all([
      tx.product.findMany({ where: { businessId, createdAt: { gt: since } } }),
      tx.customer.findMany({ where: { businessId, createdAt: { gt: since } } }),
      tx.order.findMany({
        where: { businessId, createdAt: { gt: since } },
        include: { items: true, payments: true },
      }),
      tx.expense.findMany({ where: { businessId, createdAt: { gt: since } } }),
      tx.stockMovement.findMany({ where: { businessId, createdAt: { gt: since } } }),
      tx.cashMovement.findMany({ where: { businessId, createdAt: { gt: since } } }),
      tx.payment.findMany({ where: { businessId, createdAt: { gt: since } } }),
    ]);

    return {
      serverTime: new Date(),
      products,
      customers,
      orders,
      expenses,
      stockMovements,
      cashMovements,
      payments,
    };
  });
}
