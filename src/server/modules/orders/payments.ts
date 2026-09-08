import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { applyDailyStatsDelta } from '@/server/modules/reports/dailyStats';

export const addOrderPaymentSchema = z.object({
  clientUuid: z.string().uuid(),
  montant: z.number().int().positive(),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
});

export type AddOrderPaymentInput = z.infer<typeof addOrderPaymentSchema>;

export async function addOrderPayment(
  ctx: { businessId: string; userId: string },
  orderId: string,
  input: AddOrderPaymentInput
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const existing = await tx.payment.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, payment: existing };
    }

    const order = await tx.order.findFirst({
      where: { id: orderId, businessId: ctx.businessId },
      include: { payments: true },
    });
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable.');
    }
    if (order.statut === 'ANNULEE') {
      throw new AppError('ORDER_IMMUTABLE', 'Cette commande est annulée et ne peut plus recevoir de paiement.');
    }

    const dejaRecu = order.payments
      .filter((p) => p.statut === 'VALIDE')
      .reduce((acc, p) => acc + p.montant, 0);
    const restant = order.total - dejaRecu;

    if (input.montant > restant) {
      throw new AppError('PAYMENT_EXCEEDS_REMAINING', 'Le montant dépasse le reste à payer.');
    }

    const register = await tx.cashRegister.findFirst({
      where: { businessId: ctx.businessId, statut: 'OUVERTE' },
    });
    if (!register) {
      throw new AppError('CASH_REGISTER_CLOSED', 'Aucune caisse ouverte pour encaisser ce paiement.');
    }

    const payment = await tx.payment.create({
      data: {
        businessId: ctx.businessId,
        orderId: order.id,
        customerId: order.customerId,
        clientUuid: input.clientUuid,
        montant: input.montant,
        methode: input.methode,
        type: 'COMMANDE',
      },
    });

    await tx.cashMovement.create({
      data: {
        businessId: ctx.businessId,
        cashRegisterId: register.id,
        clientUuid: `${input.clientUuid}:cash`,
        type: 'ENTREE',
        origine: 'COMMANDE',
        paymentId: payment.id,
        montant: payment.montant,
        methode: payment.methode,
        userId: ctx.userId,
      },
    });

    const nouveauRecu = dejaRecu + input.montant;
    const statutPaiement = nouveauRecu >= order.total ? 'PAYEE' : 'PARTIELLE';
    await tx.order.update({ where: { id: order.id }, data: { statutPaiement } });

    await applyDailyStatsDelta(tx, ctx.businessId, { recu: input.montant }, order.createdAt);

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'ORDER_PAYMENT_ADDED',
        entite: 'Order',
        entiteId: order.id,
        nouvellesValeurs: { montant: input.montant, statutPaiement },
      },
    });

    return { status: 'CREATED' as const, payment };
  });
}
