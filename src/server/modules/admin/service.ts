import { z } from 'zod';
import type { Plan, Prisma, Subscription } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { PERIOD_MONTHS } from '@/server/shared/subscription';
import { AppError } from '@/server/shared/errors';
import { hashPin } from '@/server/modules/auth/pin';

/**
 * Module admin — volontairement cross-tenant (spec : `AdminUser` est l'exception
 * scopée à la règle §0.1). Appelle `prisma` directement plutôt que `scoped()`,
 * puisque ses requêtes portent par nature sur plusieurs/toutes les boutiques.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type PaidSubscription = Subscription & { plan: Plan };

/**
 * Abonnement payé en cours : celui qui couvre aujourd'hui, sinon le plus
 * récent (échu, ou prépayé pour plus tard). `subs` est trié par dateFin décroissante.
 */
function currentSubscription(subs: PaidSubscription[]): PaidSubscription | null {
  const now = Date.now();
  return subs.find((s) => s.dateDebut.getTime() <= now && s.dateFin.getTime() > now) ?? subs[0] ?? null;
}

/** Revenu mensuel d'une boutique active : montant réellement payé ramené au mois, à défaut le prix public mensuel. */
function monthlyRevenue(sub: PaidSubscription | null, plan: Plan | null): number {
  if (sub) return Math.round(sub.montant / PERIOD_MONTHS[sub.periode]);
  return plan?.prixMensuel ?? 0;
}

const paidSubscriptions = {
  where: { actif: true },
  include: { plan: true },
  orderBy: { dateFin: 'desc' },
} satisfies Prisma.Business$subscriptionsArgs;

export async function getMetrics() {
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * DAY_MS);
  const in7d = new Date(now.getTime() + 7 * DAY_MS);

  const [businessesByStatut, totalUsers, activeBusinesses, newBusinesses, expiringTrials, signups, payments, cancellations] =
    await Promise.all([
      prisma.business.groupBy({ by: ['statut'], _count: { _all: true } }),
      prisma.user.count({ where: { actif: true } }),
      prisma.business.findMany({
        where: { statut: 'ACTIF' },
        include: { plan: true, subscriptions: paidSubscriptions },
      }),
      prisma.business.findMany({
        where: { createdAt: { gte: since30d } },
        select: { id: true, subPayments: { where: { statut: 'REUSSI' }, select: { id: true }, take: 1 } },
      }),
      prisma.business.findMany({
        where: { statut: 'ESSAI', trialEndsAt: { gte: now, lte: in7d } },
        select: { id: true, nom: true, trialEndsAt: true },
        orderBy: { trialEndsAt: 'asc' },
      }),
      prisma.business.findMany({
        select: { id: true, nom: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.subscriptionPayment.findMany({
        where: { statut: { in: ['REUSSI', 'ECHOUE'] } },
        include: { business: { select: { nom: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.business.findMany({
        where: { statut: 'RESILIE', deletedAt: { not: null } },
        select: { id: true, nom: true, deletedAt: true },
        orderBy: { deletedAt: 'desc' },
        take: 10,
      }),
    ]);

  // Boutiques actives par formule (celle de la boutique), avec le MRR qu'elles représentent.
  const parFormule = new Map<string, { formule: string; boutiques: number; mrr: number }>();
  for (const b of activeBusinesses) {
    const sub = currentSubscription(b.subscriptions);
    const plan = sub?.plan ?? b.plan;
    const key = plan?.code ?? 'AUCUNE';
    const entry = parFormule.get(key) ?? { formule: plan ? shortPlanName(plan.nom) : 'Sans formule', boutiques: 0, mrr: 0 };
    entry.boutiques += 1;
    entry.mrr += monthlyRevenue(sub, plan);
    parFormule.set(key, entry);
  }
  const actifsParFormule = [...parFormule.values()].sort((a, b) => b.mrr - a.mrr);

  // Conversion essai → payant : boutiques inscrites ces 30 derniers jours qui ont déjà payé.
  const converties = newBusinesses.filter((b) => b.subPayments.length > 0).length;

  const activiteRecente: {
    type: 'INSCRIPTION' | 'PAIEMENT_REUSSI' | 'PAIEMENT_ECHOUE' | 'ANNULATION';
    date: Date;
    businessId: string;
    businessNom: string;
    montant: number | null;
  }[] = [
    ...signups.map((b) => ({ type: 'INSCRIPTION' as const, date: b.createdAt, businessId: b.id, businessNom: b.nom, montant: null })),
    ...payments.map((p) => ({
      type: p.statut === 'REUSSI' ? ('PAIEMENT_REUSSI' as const) : ('PAIEMENT_ECHOUE' as const),
      date: p.createdAt,
      businessId: p.businessId,
      businessNom: p.business.nom,
      montant: p.montant,
    })),
    ...cancellations.map((b) => ({ type: 'ANNULATION' as const, date: b.deletedAt!, businessId: b.id, businessNom: b.nom, montant: null })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  return {
    businessesParStatut: Object.fromEntries(businessesByStatut.map((b) => [b.statut, b._count._all])),
    totalUsersActifs: totalUsers,
    mrrEstime: actifsParFormule.reduce((acc, f) => acc + f.mrr, 0),
    actifsParFormule,
    conversion30j: {
      inscrites: newBusinesses.length,
      converties,
      taux: newBusinesses.length > 0 ? converties / newBusinesses.length : null,
    },
    essaisExpirant7j: expiringTrials.map((b) => ({
      businessId: b.id,
      nom: b.nom,
      trialEndsAt: b.trialEndsAt!,
      joursRestants: Math.max(0, Math.ceil((b.trialEndsAt!.getTime() - now.getTime()) / DAY_MS)),
    })),
    activiteRecente,
  };
}

/** « Formule Business » → « Business ». */
function shortPlanName(nom: string): string {
  return nom.replace(/^Formule\s+/i, '');
}

export async function listBusinesses(opts: { statut?: string; pays?: string; limit?: number; cursor?: string } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const businesses = await prisma.business.findMany({
    where: {
      ...(opts.statut ? { statut: opts.statut as never } : {}),
      ...(opts.pays ? { pays: opts.pays } : {}),
    },
    include: { plan: true, subscriptions: paidSubscriptions },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  // Offre affichée = ce que la boutique a réellement payé (montant + durée), pas seulement le nom de la formule.
  return businesses.map(({ subscriptions, ...b }) => {
    const sub = currentSubscription(subscriptions);
    return {
      ...b,
      abonnement: sub
        ? { formule: shortPlanName(sub.plan.nom), montant: sub.montant, periode: sub.periode, dateFin: sub.dateFin }
        : null,
    };
  });
}

/** Page « Paiements » : chaque transaction d'abonnement, la plus récente d'abord. */
export async function listSubscriptionPayments(
  opts: { statut?: string; businessId?: string; limit?: number; cursor?: string } = {}
) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const payments = await prisma.subscriptionPayment.findMany({
    where: {
      ...(opts.statut ? { statut: opts.statut as never } : {}),
      ...(opts.businessId ? { businessId: opts.businessId } : {}),
    },
    include: { business: { select: { nom: true } }, subscription: { include: { plan: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  return payments.map((p) => ({
    id: p.id,
    businessId: p.businessId,
    businessNom: p.business.nom,
    montant: p.montant,
    formule: p.subscription ? shortPlanName(p.subscription.plan.nom) : null,
    periode: p.subscription?.periode ?? null,
    methode: p.methode,
    statut: p.statut,
    referenceInterne: p.referenceInterne,
    referencePasserelle: p.referencePasserelle,
    createdAt: p.createdAt,
  }));
}

export async function listAuditLogs(opts: { businessId?: string; limit?: number; cursor?: string } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const logs = await prisma.auditLog.findMany({
    where: opts.businessId ? { businessId: opts.businessId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return logs;
}

/** AuditLog d'une action admin — `adminUserId` peuplé, `userId` absent (spec : "Admin actions must write AuditLog with adminUserId populated"). */
export async function auditAdminAction(entry: {
  adminUserId: string;
  /** Absent pour une action qui vise toutes les boutiques (ex. notification à tous). */
  businessId?: string;
  action: string;
  entite: string;
  entiteId?: string;
  nouvellesValeurs?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      businessId: entry.businessId,
      adminUserId: entry.adminUserId,
      action: entry.action,
      entite: entry.entite,
      entiteId: entry.entiteId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nouvellesValeurs: entry.nouvellesValeurs as any,
    },
  });
}

// Nécessaire pour peupler le sélecteur "changer d'offre" de l'admin — sans
// cette liste, changePlan() n'est utilisable qu'en connaissant un planId à
// l'avance.
export async function listPlans() {
  return prisma.plan.findMany({ where: { actif: true }, orderBy: { prixMensuel: 'asc' } });
}

// Nécessaire pour peupler le sélecteur "réinitialiser le code" de l'admin —
// resetUserCode() exige un userId, cross-tenant donc pas via scoped().
export async function listBusinessUsers(businessId: string) {
  await findBusinessOrThrow(businessId);
  return prisma.user.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
}

async function findBusinessOrThrow(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable.');
  }
  return business;
}

export const extendTrialSchema = z.object({ jours: z.number().int().positive() });

export async function extendTrial(businessId: string, input: z.infer<typeof extendTrialSchema>) {
  const business = await findBusinessOrThrow(businessId);
  const base = business.trialEndsAt && business.trialEndsAt > new Date() ? business.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + input.jours * 24 * 60 * 60 * 1000);
  return prisma.business.update({ where: { id: businessId }, data: { trialEndsAt } });
}

export const changePlanSchema = z.object({ planId: z.string().cuid() });

export async function changePlan(businessId: string, input: z.infer<typeof changePlanSchema>) {
  await findBusinessOrThrow(businessId);
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.actif) {
    throw new AppError('VALIDATION_ERROR', 'Offre introuvable ou inactive.');
  }
  return prisma.business.update({ where: { id: businessId }, data: { planId: plan.id } });
}

export async function suspendBusiness(businessId: string) {
  await findBusinessOrThrow(businessId);
  return prisma.business.update({ where: { id: businessId }, data: { statut: 'SUSPENDU' } });
}

export async function reactivateBusiness(businessId: string) {
  await findBusinessOrThrow(businessId);
  return prisma.business.update({ where: { id: businessId }, data: { statut: 'ACTIF' } });
}

export const resetUserCodeSchema = z.object({
  userId: z.string().cuid(),
  newPin: z.string().regex(/^\d{6}$/, 'Le mot de passe doit comporter exactement 6 chiffres'),
});

/**
 * Réinitialise directement le code PIN d'un utilisateur d'une boutique donnée
 * (critère de sortie étape 12 : "resets a user's PIN purely through the admin
 * API") — distinct du flux OTP en libre-service côté tenant (reset-code/request
 * + confirm, étape 2), qui reste inchangé pour les utilisateurs eux-mêmes.
 */
export async function resetUserCode(businessId: string, input: z.infer<typeof resetUserCodeSchema>) {
  await findBusinessOrThrow(businessId);
  const user = await prisma.user.findFirst({ where: { id: input.userId, businessId } });
  if (!user) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Utilisateur introuvable pour cette boutique.');
  }
  const codeHash = await hashPin(input.newPin);
  return prisma.user.update({ where: { id: user.id }, data: { codeHash } });
}
