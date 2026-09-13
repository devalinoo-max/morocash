import { z } from 'zod';
import type { CashRegisterMode } from '@prisma/client';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { applyDailyStatsDelta } from '@/server/modules/reports/dailyStats';
import { ensureOpenRegisterForPayment } from '@/server/modules/cash/service';

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

/**
 * Soldes de TOUS les clients de la boutique, même formule que
 * getCustomerBalance, en deux agrégats. La liste des clients les porte
 * directement : un appel par client pour connaître sa dette multipliait les
 * requêtes, et le moindre échec de l'un d'eux affichait « 0 dette » partout.
 */
export async function getCustomerBalances(businessId: string): Promise<Map<string, number>> {
  return runInTenantTransaction(businessId, async (tx) => {
    const [dues, received] = await Promise.all([
      tx.order.groupBy({
        by: ['customerId'],
        where: { businessId, statut: { not: 'ANNULEE' } },
        _sum: { total: true },
      }),
      tx.payment.groupBy({
        by: ['customerId'],
        where: { businessId, statut: 'VALIDE' },
        _sum: { montant: true },
      }),
    ]);

    const balances = new Map<string, number>();
    for (const d of dues) {
      balances.set(d.customerId, d._sum.total ?? 0);
    }
    for (const r of received) {
      if (!r.customerId) continue;
      balances.set(r.customerId, (balances.get(r.customerId) ?? 0) - (r._sum.montant ?? 0));
    }
    return balances;
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
  ctx: { businessId: string; userId: string; cashRegisterMode: CashRegisterMode },
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

    // Même règle que pour un encaissement à la vente (createOrder étape 6) :
    // en mode LIBRE une caisse virtuelle s'ouvre toute seule, seul le mode
    // STRICT exige une caisse ouverte. Sinon un commerçant qui n'ouvre jamais
    // sa caisse pouvait vendre à crédit mais jamais encaisser la dette.
    const register = await ensureOpenRegisterForPayment(tx, ctx);

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
        // Un remboursement ne vient d'aucune commande en particulier : il vient
        // d'un client. C'est donc lui que designe la reference.
        referenceId: customerId,
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
