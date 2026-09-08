import { prisma } from '@/server/database/client';
import { runInTenantTransaction } from '@/server/repositories/base';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

const ACHAT_MARCHANDISE_NOM = 'Achat marchandise';

async function rebuildBusinessDay(businessId: string, date: Date): Promise<void> {
  const from = startOfDay(date);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  await runInTenantTransaction(businessId, async (tx) => {
    const orders = await tx.order.findMany({
      where: { businessId, statut: { not: 'ANNULEE' }, createdAt: { gte: from, lt: to } },
      include: { items: true },
    });
    const nbCommandes = orders.length;
    const totalVendu = orders.reduce((acc, o) => acc + o.total, 0);
    const coutMarchandises = orders.reduce(
      (acc, o) => acc + o.items.reduce((a, i) => a + i.coutUnitaire * i.qte, 0),
      0
    );

    // "recu" inclut les remboursements de dette (sans orderId) — spec §7.5 :
    // "Un remboursement de dette augmente recu" malgré la définition littérale
    // "paiements liés à ces commandes".
    const payments = await tx.payment.findMany({
      where: { businessId, statut: 'VALIDE', createdAt: { gte: from, lt: to } },
    });
    const recu = payments.reduce((acc, p) => acc + p.montant, 0);

    const expenses = await tx.expense.findMany({
      where: { businessId, date: { gte: from, lt: to } },
      include: { category: true },
    });
    const totalDepenses = expenses.reduce((acc, e) => acc + e.montant, 0);
    const depensesDeductibles = expenses.reduce(
      (acc, e) => acc + (e.category.nom === ACHAT_MARCHANDISE_NOM && e.category.systeme ? 0 : e.montant),
      0
    );

    const aCredit = totalVendu - recu;
    const margeBrute = totalVendu - coutMarchandises;
    const gagne = margeBrute - depensesDeductibles;

    // creancesTotales suit la même convention que l'application incrémentale
    // (applyDailyStatsDelta, reports/dailyStats.ts) : un delta du jour, pas un
    // solde cumulé multi-jours. Les rapports (reports/queries.ts) recalculent la
    // dette totale réelle en direct plutôt que de sommer ce champ.
    const creancesTotales = aCredit;

    await tx.dailyStats.upsert({
      where: { businessId_date: { businessId, date: from } },
      create: {
        businessId,
        date: from,
        nbCommandes,
        totalVendu,
        recu,
        aCredit,
        coutMarchandises,
        margeBrute,
        totalDepenses,
        gagne,
        creancesTotales,
      },
      update: {
        nbCommandes,
        totalVendu,
        recu,
        aCredit,
        coutMarchandises,
        margeBrute,
        totalDepenses,
        gagne,
        creancesTotales,
      },
    });
  });
}

/**
 * Reconstruction nocturne complète de DailyStats à partir des tables sources
 * (spec §7.5 : "DailyStats ... reconstruit intégralement par un cron nocturne").
 * Absorbe toute dérive laissée par l'application incrémentale (ex. modification
 * d'une dépense après coup — voir expenses/service.ts::updateExpense).
 *
 * Corps de job uniquement ici — le déclenchement cron (`/api/cron/rebuild-stats`,
 * authentifié par CRON_SECRET) est câblé à l'étape 11 (spec §1.9).
 */
export async function rebuildDailyStats(date: Date = new Date()): Promise<{ businessesProcessed: number }> {
  const businesses = await prisma.business.findMany({ select: { id: true } });
  for (const b of businesses) {
    await rebuildBusinessDay(b.id, date);
  }
  return { businessesProcessed: businesses.length };
}
