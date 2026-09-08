import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { applyDailyStatsDelta } from '@/server/modules/reports/dailyStats';

/**
 * Solde débiteur d'un client = Σ(total des commandes non annulées) − Σ(paiements
 * valides liés) — calculé, jamais stocké (spec §7.5 : "Créances justes au franc
 * près").
 */
export async function getCustomerBalance(businessId: string, customerId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
    }

    const orders = await tx.order.findMany({
      where: { businessId, customerId, statut: { not: 'ANNULEE' } },
    });
    const totalDu = orders.reduce((acc, o) => acc + o.total, 0);

    // Tous les paiements du client, y compris les remboursements de dette qui ne
    // sont liés à aucune commande (orderId null) — spec §7.5.
    const payments = await tx.payment.findMany({
      where: { businessId, customerId, statut: 'VALIDE' },
    });
    const totalRecu = payments.reduce((acc, p) => acc + p.montant, 0);

    return { customer, totalDu, totalRecu, solde: totalDu - totalRecu };
  });
}

export async function getCustomerHistory(businessId: string, customerId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
    }
    const orders = await tx.order.findMany({
      where: { businessId, customerId },
      include: { items: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
    return { customer, orders };
  });
}

export const repayDebtSchema = z.object({
  clientUuid: z.string().uuid(),
  montant: z.number().int().positive(),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
});

export type RepayDebtInput = z.infer<typeof repayDebtSchema>;

/**
 * Remboursement de dette : Payment sans orderId (type REMBOURSEMENT_DETTE), avec
 * un CashMovement (origine REMBOURSEMENT) même sans commande associée (spec §7.4).
 * Augmente `recu`, jamais `totalVendu` ni `gagne` (spec §7.5).
 */
export async function repayDebt(
  ctx: { businessId: string; userId: string },
  customerId: string,
  input: RepayDebtInput
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const existing = await tx.payment.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, payment: existing };
    }

    const customer = await tx.customer.findFirst({
      where: { id: customerId, businessId: ctx.businessId },
    });
    if (!customer) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
    }

    const register = await tx.cashRegister.findFirst({
      where: { businessId: ctx.businessId, statut: 'OUVERTE' },
    });
    if (!register) {
      throw new AppError('CASH_REGISTER_CLOSED', 'Aucune caisse ouverte pour encaisser ce remboursement.');
    }

    const payment = await tx.payment.create({
      data: {
        businessId: ctx.businessId,
        customerId: customer.id,
        clientUuid: input.clientUuid,
        montant: input.montant,
        methode: input.methode,
        type: 'REMBOURSEMENT_DETTE',
      },
    });

    await tx.cashMovement.create({
      data: {
        businessId: ctx.businessId,
        cashRegisterId: register.id,
        clientUuid: `${input.clientUuid}:cash`,
        type: 'ENTREE',
        origine: 'REMBOURSEMENT',
        paymentId: payment.id,
        montant: payment.montant,
        methode: payment.methode,
        userId: ctx.userId,
      },
    });

    // recu augmente, totalVendu et coutMarchandises restent inchangés — donc
    // aCredit diminue et margeBrute/gagne ne bougent pas (spec §7.5).
    await applyDailyStatsDelta(tx, ctx.businessId, { recu: input.montant });

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'DEBT_REPAYMENT',
        entite: 'Customer',
        entiteId: customer.id,
        nouvellesValeurs: { montant: input.montant },
      },
    });

    return { status: 'CREATED' as const, payment };
  });
}
