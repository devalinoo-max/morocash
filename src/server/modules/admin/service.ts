import { z } from 'zod';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { hashPin } from '@/server/modules/auth/pin';

/**
 * Module admin — volontairement cross-tenant (spec : `AdminUser` est l'exception
 * scopée à la règle §0.1). Appelle `prisma` directement plutôt que `scoped()`,
 * puisque ses requêtes portent par nature sur plusieurs/toutes les boutiques.
 */

// Le cahier des charges (§8) ne détaille pas le contenu exact de GET /admin/metrics
// — ensemble minimal et raisonnable de compteurs globaux plutôt qu'une
// fabrication étendue non spécifiée.
export async function getMetrics() {
  const [businessesByStatut, totalUsers, activePlans] = await Promise.all([
    prisma.business.groupBy({ by: ['statut'], _count: { _all: true } }),
    prisma.user.count({ where: { actif: true } }),
    prisma.business.findMany({ where: { statut: 'ACTIF' }, include: { plan: true } }),
  ]);

  const mrrEstime = activePlans.reduce((acc, b) => acc + (b.plan?.prixMensuel ?? 0), 0);

  return {
    businessesParStatut: Object.fromEntries(businessesByStatut.map((b) => [b.statut, b._count._all])),
    totalUsersActifs: totalUsers,
    mrrEstime,
  };
}

export async function listBusinesses(opts: { statut?: string; limit?: number; cursor?: string } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const businesses = await prisma.business.findMany({
    where: opts.statut ? { statut: opts.statut as never } : undefined,
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return businesses;
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
  businessId: string;
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
  newPin: z.string().regex(/^\d{6}$/, 'Le code doit comporter exactement 6 chiffres'),
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
