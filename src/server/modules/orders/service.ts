import { scoped, runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import type { ReceiptData } from '@/server/modules/receipts/receiptText';

export async function listOrders(businessId: string) {
  const repo = scoped(businessId);
  return repo.orders.findMany({ orderBy: { createdAt: 'desc' } });
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
