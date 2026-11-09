import { scoped, runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import type { ReceiptData } from '@/server/modules/receipts/receiptText';

/**
 * Les commandes de la boutique.
 *
 * `onlyUserId` restreint la liste aux ventes de cette personne : c'est ce qui
 * sépare « Voir ses propres ventes » de « Voir les ventes de tous les
 * employés ». Le filtre est posé ici, dans la requête, et non à l'affichage :
 * un vendeur sans le second droit ne doit pas recevoir les ventes des autres,
 * même s'il ne les affiche pas.
 */
export async function listOrders(businessId: string, onlyUserId?: string) {
  const repo = scoped(businessId);
  // Le nom du vendeur de CHAQUE commande : sans lui, l'app affichait sur tous
  // les reçus le nom de la personne connectée, quel que soit l'auteur de la vente.
  return repo.orders.findMany({
    ...(onlyUserId ? { where: { userId: onlyUserId } } : {}),
    orderBy: { createdAt: 'desc' },
    include: {
      items: true,
      payments: { include: { user: { select: { nom: true } } }, orderBy: { createdAt: 'asc' } },
      user: { select: { nom: true } },
    },
  });
}

export async function getOrder(businessId: string, id: string) {
  const repo = scoped(businessId);
  const order = await repo.orders.findById(id);
  if (!order) {
    throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable.');
  }
  return order;
}

export async function getOrderReceiptData(businessId: string, id: string): Promise<ReceiptData> {
  return runInTenantTransaction(businessId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id, businessId },
      include: { items: true, customer: true },
    });
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable.');
    }
    const business = await tx.business.findUnique({ where: { id: businessId } });
    if (!business) {
      throw new AppError('ORDER_NOT_FOUND', 'Boutique introuvable.');
    }
    return { order, business, customer: order.customer };
  });
}
