import type { PaymentMethod, Prisma, SubPeriod } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { PERIOD_MONTHS } from '@/server/shared/subscription';

/**
 * Programme d'affiliation. Hors de `scoped()` et hors RLS : un affilié n'a pas
 * de boutique, et ses chiffres portent par nature sur plusieurs boutiques (celles
 * inscrites via son lien). Chaque lecture filtre donc explicitement sur affiliateId.
 */

const SETTINGS_ID = 'default';
const DEFAULT_SEUIL_RETRAIT = 5000;
const DEFAULT_JOURS_OFFERTS = 15;
const DEFAULT_REDUCTION = 10;

/** Avantage des inscrits avec un code : jours d'essai offerts et réduction (%) sur le premier paiement. */
export async function getAffiliatePerks(): Promise<{ joursEssaiOfferts: number; reductionPremierPaiement: number }> {
  const settings = await prisma.affiliateSettings.findUnique({ where: { id: SETTINGS_ID } });
  return {
    joursEssaiOfferts: settings?.joursEssaiOfferts ?? DEFAULT_JOURS_OFFERTS,
    reductionPremierPaiement: settings?.reductionPremierPaiement ?? DEFAULT_REDUCTION,
  };
}

// ─── Comptes et sessions ───

export function findAffiliateByCode(code: string) {
  return prisma.affiliate.findUnique({ where: { code: code.toUpperCase() } });
}

export function findAffiliateByPhone(telephone: string) {
  return prisma.affiliate.findUnique({ where: { telephone } });
}

export function findAffiliateById(id: string) {
  return prisma.affiliate.findUnique({ where: { id } });
}

export function createAffiliate(data: { code: string; nom: string; telephone: string; pays: string; codeHash: string }) {
  return prisma.affiliate.create({ data });
}

export function setAffiliateName(id: string, nom: string) {
  return prisma.affiliate.update({ where: { id }, data: { nom } });
}

export function createAffiliateSession(data: { affiliateId: string; tokenHash: string; expiresAt: Date }) {
  return prisma.affiliateSession.create({ data });
}

export function findAffiliateSessionByHash(tokenHash: string) {
  return prisma.affiliateSession.findUnique({ where: { tokenHash }, include: { affiliate: true } });
}

export function extendAffiliateSession(id: string, expiresAt: Date) {
  return prisma.affiliateSession.update({ where: { id }, data: { expiresAt } });
}

export function deleteAffiliateSessionByHash(tokenHash: string) {
  return prisma.affiliateSession.deleteMany({ where: { tokenHash } });
}

// ─── Réglages ───

export async function getAffiliateSettings() {
  const [settings, plans] = await Promise.all([
    prisma.affiliateSettings.findUnique({ where: { id: SETTINGS_ID } }),
    prisma.plan.findMany({
      where: { actif: true },
      select: { id: true, code: true, nom: true, commissionAffilie: true },
      orderBy: { prixMensuel: 'asc' },
    }),
  ]);
  return {
    seuilRetrait: settings?.seuilRetrait ?? DEFAULT_SEUIL_RETRAIT,
    joursEssaiOfferts: settings?.joursEssaiOfferts ?? DEFAULT_JOURS_OFFERTS,
    reductionPremierPaiement: settings?.reductionPremierPaiement ?? DEFAULT_REDUCTION,
    plans,
  };
}

/** Enregistre les taux par formule et le seuil ; renvoie l'avant/après pour le journal d'audit. */
export async function saveAffiliateSettings(input: {
  commissions: Record<string, number>;
  seuilRetrait: number;
  joursEssaiOfferts: number;
  reductionPremierPaiement: number;
}) {
  return prisma.$transaction(async (tx) => {
    const [settings, plans] = await Promise.all([
      tx.affiliateSettings.findUnique({ where: { id: SETTINGS_ID } }),
      tx.plan.findMany({ where: { actif: true }, select: { id: true, code: true, commissionAffilie: true } }),
    ]);
    const avant = {
      seuilRetrait: settings?.seuilRetrait ?? DEFAULT_SEUIL_RETRAIT,
      joursEssaiOfferts: settings?.joursEssaiOfferts ?? DEFAULT_JOURS_OFFERTS,
      reductionPremierPaiement: settings?.reductionPremierPaiement ?? DEFAULT_REDUCTION,
      commissions: Object.fromEntries(plans.map((p) => [p.code, p.commissionAffilie])),
    };

    for (const plan of plans) {
      const taux = input.commissions[plan.code];
      if (taux !== undefined && taux !== plan.commissionAffilie) {
        await tx.plan.update({ where: { id: plan.id }, data: { commissionAffilie: taux } });
      }
    }
    await tx.affiliateSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {
        seuilRetrait: input.seuilRetrait,
        joursEssaiOfferts: input.joursEssaiOfferts,
        reductionPremierPaiement: input.reductionPremierPaiement,
      },
      create: {
        id: SETTINGS_ID,
        seuilRetrait: input.seuilRetrait,
        joursEssaiOfferts: input.joursEssaiOfferts,
        reductionPremierPaiement: input.reductionPremierPaiement,
      },
    });

    const apres = {
      seuilRetrait: input.seuilRetrait,
      joursEssaiOfferts: input.joursEssaiOfferts,
      reductionPremierPaiement: input.reductionPremierPaiement,
      commissions: Object.fromEntries(plans.map((p) => [p.code, input.commissions[p.code] ?? p.commissionAffilie])),
    };
    return { avant, apres };
  });
}

// ─── Commissions ───

/**
 * Crédite l'affilié d'une boutique pour un paiement d'abonnement réussi. Appelé
 * dans la transaction d'activatePaidSubscription : la commission existe si et
 * seulement si le paiement est passé REUSSI. Le montant est calculé ici, avec le
 * taux de la formule au moment du paiement, puis figé sur la commission.
 *
 * Rien n'est crédité si l'affilié est désactivé, si le taux est nul, ou si le
 * propriétaire de la boutique a le même numéro WhatsApp que l'affilié (pas de
 * commission sur sa propre boutique).
 */
export async function creditAffiliateCommission(
  tx: Prisma.TransactionClient,
  input: {
    affiliateId: string;
    businessId: string;
    subscriptionPaymentId: string;
    planId: string;
    periode: SubPeriod;
    renouvellement: boolean;
  }
): Promise<void> {
  const affiliate = await tx.affiliate.findUnique({ where: { id: input.affiliateId } });
  if (!affiliate || !affiliate.actif) return;

  const ownBusiness = await tx.user.findFirst({
    where: { businessId: input.businessId, role: 'OWNER', telephone: affiliate.telephone },
    select: { id: true },
  });
  if (ownBusiness) return;

  const plan = await tx.plan.findUniqueOrThrow({ where: { id: input.planId } });
  const tauxMensuel = plan.commissionAffilie;
  if (tauxMensuel <= 0) return;

  const mois = PERIOD_MONTHS[input.periode];
  const commission = await tx.affiliateCommission.create({
    data: {
      affiliateId: affiliate.id,
      businessId: input.businessId,
      subscriptionPaymentId: input.subscriptionPaymentId,
      planCode: plan.code,
      mois,
      tauxMensuel,
      montant: tauxMensuel * mois,
      renouvellement: input.renouvellement,
    },
  });

  await tx.auditLog.create({
    data: {
      businessId: input.businessId,
      action: 'AFFILIATE_COMMISSION_CREDITED',
      entite: 'AffiliateCommission',
      entiteId: commission.id,
      nouvellesValeurs: {
        affiliateId: affiliate.id,
        affiliateCode: affiliate.code,
        subscriptionPaymentId: input.subscriptionPaymentId,
        planCode: plan.code,
        mois,
        tauxMensuel,
        montant: commission.montant,
      },
    },
  });
}

/**
 * Solde à recevoir : commissions pas encore versées, c'est-à-dire sans retrait
 * ou rattachées à un retrait demandé mais pas encore payé.
 */
const inBalance = (affiliateId: string): Prisma.AffiliateCommissionWhereInput => ({
  affiliateId,
  OR: [{ payoutId: null }, { payout: { statut: 'DEMANDE' } }],
});

async function balanceOf(client: Prisma.TransactionClient, affiliateId: string): Promise<number> {
  const agg = await client.affiliateCommission.aggregate({ where: inBalance(affiliateId), _sum: { montant: true } });
  return agg._sum.montant ?? 0;
}

/** Abonné = boutique rattachée qui a payé au moins une fois. */
const payingBusinesses: Prisma.BusinessWhereInput = { subPayments: { some: { statut: 'REUSSI' } } };

export type AccountStatus = 'ESSAI' | 'ABONNE' | 'INACTIF';

/**
 * Statut d'un compte amené par l'affilié : abonnement payé en cours, essai en
 * cours, sinon inactif (essai terminé sans paiement, abonnement échu,
 * boutique suspendue ou résiliée).
 */
function accountStatus(
  b: { statut: string; trialEndsAt: Date | null; subscriptionEndsAt: Date | null },
  now: Date
): AccountStatus {
  if (b.statut === 'ACTIF' && b.subscriptionEndsAt && b.subscriptionEndsAt > now) return 'ABONNE';
  if (b.statut === 'ESSAI' && (!b.trialEndsAt || b.trialEndsAt > now)) return 'ESSAI';
  return 'INACTIF';
}

/**
 * Comptes rattachés à un affilié, avec leur statut, leurs paiements réussis et
 * la commission qu'ils ont rapportée. Ne lit jamais le téléphone ni l'e-mail
 * des boutiques : l'affilié n'y a pas droit.
 */
async function affiliateAccounts(affiliateId: string) {
  const now = new Date();
  const [businesses, perBusiness] = await Promise.all([
    prisma.business.findMany({
      where: { affiliateId },
      select: {
        id: true,
        nom: true,
        statut: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        createdAt: true,
        plan: { select: { code: true } },
        _count: { select: { subPayments: { where: { statut: 'REUSSI' } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.affiliateCommission.groupBy({
      by: ['businessId'],
      where: { affiliateId },
      _sum: { montant: true },
    }),
  ]);
  const commissionBy = new Map(perBusiness.map((c) => [c.businessId, c._sum.montant ?? 0]));

  return businesses.map((b) => ({
    id: b.id,
    nom: b.nom,
    createdAt: b.createdAt,
    statut: accountStatus(b, now),
    planCode: b.plan?.code ?? null,
    paiements: b._count.subPayments,
    commission: commissionBy.get(b.id) ?? 0,
  }));
}

// ─── Espace affilié ───

export async function getAffiliateDashboardData(affiliateId: string) {
  const [settings, plans, solde, accounts, commissions, payouts] = await Promise.all([
    prisma.affiliateSettings.findUnique({ where: { id: SETTINGS_ID } }),
    prisma.plan.findMany({
      where: { actif: true },
      select: { code: true, commissionAffilie: true },
      orderBy: { prixMensuel: 'asc' },
    }),
    balanceOf(prisma, affiliateId),
    affiliateAccounts(affiliateId),
    prisma.affiliateCommission.findMany({
      where: { affiliateId },
      include: { business: { select: { nom: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.affiliatePayout.findMany({ where: { affiliateId }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  return {
    seuilRetrait: settings?.seuilRetrait ?? DEFAULT_SEUIL_RETRAIT,
    taux: plans.map((p) => ({ planCode: p.code, montant: p.commissionAffilie })),
    joursEssaiOfferts: settings?.joursEssaiOfferts ?? DEFAULT_JOURS_OFFERTS,
    solde,
    accounts,
    commissions,
    payouts,
  };
}

export type PayoutRequestResult =
  | { status: 'OK'; payoutId: string; montant: number }
  | { status: 'BELOW_THRESHOLD'; solde: number; seuilRetrait: number }
  | { status: 'ALREADY_PENDING' };

/**
 * Demande de retrait : regroupe dans un retrait DEMANDE toutes les commissions
 * du solde. Une seule demande en cours à la fois. Le montant vient de la base,
 * jamais du navigateur.
 */
export function createPayoutRequest(
  affiliateId: string,
  destination: { operateur: PaymentMethod; numeroReception: string }
): Promise<PayoutRequestResult> {
  return prisma.$transaction(async (tx) => {
    // Verrou sur la ligne de l'affilié : deux demandes simultanées ne créent
    // jamais deux retraits.
    await tx.$queryRaw`SELECT id FROM "Affiliate" WHERE id = ${affiliateId} FOR UPDATE`;

    const pending = await tx.affiliatePayout.findFirst({ where: { affiliateId, statut: 'DEMANDE' } });
    if (pending) return { status: 'ALREADY_PENDING' as const };

    const settings = await tx.affiliateSettings.findUnique({ where: { id: SETTINGS_ID } });
    const seuilRetrait = settings?.seuilRetrait ?? DEFAULT_SEUIL_RETRAIT;
    const unpaid = await tx.affiliateCommission.findMany({
      where: { affiliateId, payoutId: null },
      select: { id: true, montant: true },
    });
    const montant = unpaid.reduce((sum, c) => sum + c.montant, 0);
    if (montant <= 0 || montant < seuilRetrait) {
      return { status: 'BELOW_THRESHOLD' as const, solde: montant, seuilRetrait };
    }

    const payout = await tx.affiliatePayout.create({ data: { affiliateId, montant, ...destination } });
    await tx.affiliateCommission.updateMany({
      where: { id: { in: unpaid.map((c) => c.id) } },
      data: { payoutId: payout.id },
    });
    await tx.auditLog.create({
      data: {
        action: 'AFFILIATE_PAYOUT_REQUESTED',
        entite: 'AffiliatePayout',
        entiteId: payout.id,
        nouvellesValeurs: { affiliateId, montant, commissions: unpaid.length, ...destination },
      },
    });
    return { status: 'OK' as const, payoutId: payout.id, montant };
  });
}

// ─── Back-office ───

export async function listAffiliatesForAdmin() {
  const affiliates = await prisma.affiliate.findMany({
    include: {
      _count: { select: { businesses: true } },
      payouts: { where: { statut: 'DEMANDE' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  const ids = affiliates.map((a) => a.id);
  const [payingCounts, balances] = await Promise.all([
    prisma.business.groupBy({
      by: ['affiliateId'],
      where: { affiliateId: { in: ids }, ...payingBusinesses },
      _count: { _all: true },
    }),
    prisma.affiliateCommission.groupBy({
      by: ['affiliateId'],
      where: { affiliateId: { in: ids }, OR: [{ payoutId: null }, { payout: { statut: 'DEMANDE' } }] },
      _sum: { montant: true },
    }),
  ]);
  const payingBy = new Map(payingCounts.map((p) => [p.affiliateId, p._count._all]));
  const balanceBy = new Map(balances.map((b) => [b.affiliateId, b._sum.montant ?? 0]));

  return affiliates.map((a) => {
    const pending = a.payouts[0];
    return {
      id: a.id,
      code: a.code,
      nom: a.nom,
      telephone: a.telephone,
      pays: a.pays,
      createdAt: a.createdAt,
      inscrits: a._count.businesses,
      payants: payingBy.get(a.id) ?? 0,
      solde: balanceBy.get(a.id) ?? 0,
      retraitDemande: pending
        ? {
            id: pending.id,
            montant: pending.montant,
            operateur: pending.operateur,
            numeroReception: pending.numeroReception,
            createdAt: pending.createdAt,
          }
        : null,
    };
  });
}

/** Détail d'un affilié pour l'admin : chiffres et comptes amenés. */
export async function getAffiliateDetailForAdmin(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) return null;
  const [solde, accounts] = await Promise.all([balanceOf(prisma, affiliateId), affiliateAccounts(affiliateId)]);
  return {
    id: affiliate.id,
    code: affiliate.code,
    nom: affiliate.nom,
    telephone: affiliate.telephone,
    pays: affiliate.pays,
    createdAt: affiliate.createdAt,
    inscrits: accounts.length,
    payants: accounts.filter((a) => a.paiements > 0).length,
    solde,
    comptes: accounts,
  };
}
/**
 * L'admin a versé le retrait en mobile money hors de l'app. Idempotent : seul
 * le passage DEMANDE → PAYE écrit au journal d'audit.
 */
export function markPayoutPaid(payoutId: string, adminUserId: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.affiliatePayout.updateMany({
      where: { id: payoutId, statut: 'DEMANDE' },
      data: { statut: 'PAYE', payeLe: new Date(), adminUserId },
    });
    const payout = await tx.affiliatePayout.findUnique({ where: { id: payoutId } });
    if (!payout) return null;
    if (updated.count === 0) return payout;

    await tx.auditLog.create({
      data: {
        adminUserId,
        action: 'AFFILIATE_PAYOUT_PAID',
        entite: 'AffiliatePayout',
        entiteId: payout.id,
        nouvellesValeurs: { affiliateId: payout.affiliateId, montant: payout.montant },
      },
    });
    return payout;
  });
}

export type AffiliateChangeResult =
  | { status: 'OK'; affiliate: { id: string; code: string; nom: string | null } | null }
  | { status: 'BUSINESS_NOT_FOUND' }
  | { status: 'OWN_BUSINESS' };

/**
 * Correction du code affilié d'une boutique par l'admin. Ne touche pas aux
 * commissions déjà créditées : seuls les paiements futurs suivent le nouveau
 * rattachement. Chaque changement effectif écrit AFFILIATE_CODE_CHANGED.
 */
export function changeBusinessAffiliate(
  businessId: string,
  affiliate: { id: string; code: string; nom: string | null; telephone: string } | null,
  adminUserId: string
): Promise<AffiliateChangeResult> {
  return prisma.$transaction(async (tx) => {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      include: { affiliate: { select: { id: true, code: true } } },
    });
    if (!business) return { status: 'BUSINESS_NOT_FOUND' as const };

    if (affiliate) {
      const own = await tx.user.findFirst({
        where: { businessId, role: 'OWNER', telephone: affiliate.telephone },
        select: { id: true },
      });
      if (own) return { status: 'OWN_BUSINESS' as const };
    }

    const result = affiliate ? { id: affiliate.id, code: affiliate.code, nom: affiliate.nom } : null;
    if ((business.affiliateId ?? null) === (affiliate?.id ?? null)) return { status: 'OK' as const, affiliate: result };

    await tx.business.update({ where: { id: businessId }, data: { affiliateId: affiliate?.id ?? null } });
    await tx.auditLog.create({
      data: {
        businessId,
        adminUserId,
        action: 'AFFILIATE_CODE_CHANGED',
        entite: 'Business',
        entiteId: businessId,
        anciennesValeurs: { affiliateId: business.affiliateId, code: business.affiliate?.code ?? null },
        nouvellesValeurs: { affiliateId: affiliate?.id ?? null, code: affiliate?.code ?? null },
      },
    });
    return { status: 'OK' as const, affiliate: result };
  });
}
