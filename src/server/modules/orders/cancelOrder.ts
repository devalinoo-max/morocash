import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { applyDailyStatsDelta } from '@/server/modules/reports/dailyStats';

export const cancelOrderSchema = z.object({
  motif: z.string().trim().min(1, 'Le motif est obligatoire pour annuler une commande.'),
});

/**
 * Annulation (spec §7.2) : jamais de suppression. Crée les StockMovement RETOUR,
 * passe les Payment liés en ANNULE, crée les CashMovement inverses, recalcule
 * DailyStats du jour d'origine, enregistre motif/auteur/horodatage.
 */
export async function cancelOrder(
  ctx: { businessId: string; userId: string },
  orderId: string,
  motif: string
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, businessId: ctx.businessId },
      include: { items: true, payments: true },
    });
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable.');
    }
    if (order.statut === 'ANNULEE') {
      throw new AppError('ORDER_ALREADY_CANCELLED', 'Cette commande est déjà annulée.');
    }

    for (const item of order.items) {
      if (!item.productId) continue;
      const product = await tx.product.findFirst({
        where: { id: item.productId, businessId: ctx.businessId },
      });
      if (!product) continue;

      const stockAvant = product.stock;
      const stockApres = stockAvant + item.qte;
      await tx.product.update({ where: { id: product.id }, data: { stock: stockApres } });
      await tx.stockMovement.create({
        data: {
          businessId: ctx.businessId,
          productId: product.id,
          clientUuid: `cancel:${order.clientUuid}:stock:${product.id}`,
          type: 'RETOUR',
          quantite: item.qte,
          stockAvant,
          stockApres,
          coutUnitaire: item.coutUnitaire,
          orderId: order.id,
          motif: `Annulation commande ${order.numero}`,
          userId: ctx.userId,
        },
      });
    }

    let totalRecuAnnule = 0;
    for (const payment of order.payments) {
      if (payment.statut === 'ANNULE') continue;
      await tx.payment.update({ where: { id: payment.id }, data: { statut: 'ANNULE' } });
      totalRecuAnnule += payment.montant;

      const cashMovement = await tx.cashMovement.findUnique({ where: { paymentId: payment.id } });
      if (cashMovement) {
        await tx.cashMovement.create({
          data: {
            businessId: ctx.businessId,
            cashRegisterId: cashMovement.cashRegisterId,
            clientUuid: `cancel:${cashMovement.clientUuid}`,
            type: 'SORTIE',
            origine: 'COMMANDE',
            referenceId: order.id,
            montant: cashMovement.montant,
            methode: cashMovement.methode,
            motif: `Annulation commande ${order.numero}`,
            userId: ctx.userId,
          },
        });
      }
    }

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        statut: 'ANNULEE',
        motifAnnulation: motif,
        annuleeParId: ctx.userId,
        annuleeLe: new Date(),
      },
    });

    await applyDailyStatsDelta(
      tx,
      ctx.businessId,
      {
        nbCommandes: -1,
        totalVendu: -order.total,
        recu: -totalRecuAnnule,
        coutMarchandises: -order.coutTotal,
      },
      order.createdAt
    );

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'ORDER_CANCELLED',
        entite: 'Order',
        entiteId: order.id,
        motif,
      },
    });

    return updatedOrder;
  });
}
