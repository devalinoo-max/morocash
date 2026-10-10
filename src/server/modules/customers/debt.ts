import type { Prisma } from '@prisma/client';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { collectCustomerDebt, versementSchema, type VersementInput } from '@/server/modules/payments/versements';

/** Reste à payer de chaque commande non annulée : total − versements valides. */
async function loadRests(tx: Prisma.TransactionClient, where: Prisma.OrderWhereInput) {
  const orders = await tx.order.findMany({
    where: { ...where, statut: { not: 'ANNULEE' } },
    select: {
      customerId: true,
      total: true,
      payments: { where: { statut: 'VALIDE' }, select: { montant: true } },
    },
  });
  return orders.map((o) => {
    const recu = o.payments.reduce((acc, p) => acc + p.montant, 0);
    return { customerId: o.customerId, total: o.total, recu, reste: Math.max(0, o.total - recu) };
  });
}

/**
 * Dette d'un client = somme des restes de ses commandes non annulées — calculée,
 * jamais stockée (spec §7.5 : "Créances justes au franc près").
 */
export async function getCustomerBalance(businessId: string, customerId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
    }

    const rests = await loadRests(tx, { businessId, customerId });
    const totalDu = rests.reduce((acc, r) => acc + r.total, 0);
    const solde = rests.reduce((acc, r) => acc + r.reste, 0);

    return { customer, totalDu, totalRecu: totalDu - solde, solde };
  });
}

/**
 * Dettes de TOUS les clients de la boutique, même formule que
 * getCustomerBalance. La liste des clients les porte directement : un appel
 * par client pour connaître sa dette multipliait les requêtes, et le moindre
 * échec de l'un d'eux affichait « 0 dette » partout.
 */
export async function getCustomerBalances(businessId: string): Promise<Map<string, number>> {
  return runInTenantTransaction(businessId, async (tx) => {
    const balances = new Map<string, number>();
    for (const r of await loadRests(tx, { businessId })) {
      balances.set(r.customerId, (balances.get(r.customerId) ?? 0) + r.reste);
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

export const repayDebtSchema = versementSchema;

export type RepayDebtInput = VersementInput;

/**
 * Remboursement de dette : réparti sur les commandes impayées du client, un
 * versement par commande (voir payments/versements.ts). `payment` reste le
 * premier versement créé, pour les appelants qui n'en attendent qu'un.
 */
export async function repayDebt(
  ctx: Parameters<typeof collectCustomerDebt>[0],
  customerId: string,
  input: RepayDebtInput
) {
  const result = await collectCustomerDebt(ctx, customerId, input);
  return { ...result, payment: result.versements[0] ?? null };
}
