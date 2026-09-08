import type { Prisma } from '@prisma/client';

/**
 * DailyStats est mis à jour à chaque écriture (commande, annulation, dépense) et
 * reconstruit intégralement par un cron nocturne (spec §7.5, §11). Cette fonction
 * applique un delta incrémental — jamais un recalcul complet — pour rester rapide
 * à l'intérieur des transactions métier.
 *
 * Formules (spec §7.5) :
 *   aCredit    = totalVendu − recu
 *   margeBrute = totalVendu − coutMarchandises
 *   gagne      = margeBrute − dépenses hors "Achat marchandise"
 */
export interface DailyStatsDelta {
  nbCommandes?: number;
  totalVendu?: number;
  recu?: number;
  coutMarchandises?: number;
  /** Montant total de la dépense — alimente `totalDepenses` (toutes catégories confondues). */
  totalDepenses?: number;
  /**
   * Même montant que `totalDepenses`, SAUF si la dépense appartient à la catégorie
   * système "Achat marchandise" — auquel cas 0. N'affecte que `gagne`, jamais
   * `totalDepenses` lui-même (spec §7.5 : "gagne = margeBrute − dépenses hors
   * 'Achat marchandise'", alors que `totalDepenses` reste la somme de toutes les
   * dépenses affichée telle quelle dans les rapports).
   */
  depensesDeductibles?: number;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function applyDailyStatsDelta(
  tx: Prisma.TransactionClient,
  businessId: string,
  delta: DailyStatsDelta,
  at: Date = new Date()
): Promise<void> {
  const date = startOfDay(at);

  const nbCommandes = delta.nbCommandes ?? 0;
  const totalVendu = delta.totalVendu ?? 0;
  const recu = delta.recu ?? 0;
  const coutMarchandises = delta.coutMarchandises ?? 0;
  const totalDepenses = delta.totalDepenses ?? 0;
  const depensesDeductibles = delta.depensesDeductibles ?? 0;
  const aCredit = totalVendu - recu;
  const margeBrute = totalVendu - coutMarchandises;
  const gagne = margeBrute - depensesDeductibles;

  const existing = await tx.dailyStats.findUnique({
    where: { businessId_date: { businessId, date } },
  });

  if (!existing) {
    await tx.dailyStats.create({
      data: {
        businessId,
        date,
        nbCommandes,
        totalVendu,
        recu,
        aCredit,
        coutMarchandises,
        margeBrute,
        totalDepenses,
        gagne,
        creancesTotales: aCredit,
      },
    });
    return;
  }

  await tx.dailyStats.update({
    where: { businessId_date: { businessId, date } },
    data: {
      nbCommandes: { increment: nbCommandes },
      totalVendu: { increment: totalVendu },
      recu: { increment: recu },
      aCredit: { increment: aCredit },
      coutMarchandises: { increment: coutMarchandises },
      margeBrute: { increment: margeBrute },
      totalDepenses: { increment: totalDepenses },
      gagne: { increment: gagne },
      creancesTotales: { increment: aCredit },
    },
  });
}

/** Commande créée : compte pour 1 commande + le triplet vente/reçu/coût. */
export function upsertDailyStatsForOrder(
  tx: Prisma.TransactionClient,
  businessId: string,
  delta: { totalVendu: number; recu: number; coutMarchandises: number },
  at?: Date
): Promise<void> {
  return applyDailyStatsDelta(tx, businessId, { nbCommandes: 1, ...delta }, at);
}
