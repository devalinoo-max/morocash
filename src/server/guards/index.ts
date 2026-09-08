import type { Business, UserRole } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { getSessionFromCookies } from '@/server/modules/auth/session';
import { isAdministrativelyLocked, isSubscriptionLapsed } from '@/server/shared/subscription';

export interface AuthedContext {
  userId: string;
  businessId: string;
  role: UserRole;
  business: Business;
}

/** 1. requireSession() — session valide, sinon AUTH_SESSION_EXPIRED (spec §6). */
export async function requireSession(): Promise<{ userId: string; businessId: string; role: UserRole }> {
  const session = await getSessionFromCookies();
  if (!session) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'Session invalide ou expirée.');
  }
  return session;
}

/**
 * 2. requireBusinessWritable() — sinon BUSINESS_READ_ONLY (blocage administratif :
 * SUSPENDU/RESILIE) ou SUBSCRIPTION_EXPIRED (essai ou abonnement arrivé à échéance,
 * récupérable en passant en formule payante — voir isSubscriptionLapsed).
 */
export async function requireBusinessWritable(businessId: string): Promise<Business> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'Boutique introuvable.');
  }
  if (isAdministrativelyLocked(business)) {
    throw new AppError('BUSINESS_READ_ONLY', 'Cette boutique est en lecture seule.');
  }
  if (isSubscriptionLapsed(business)) {
    throw new AppError('SUBSCRIPTION_EXPIRED', 'Abonnement expiré : réactive ton compte pour continuer à enregistrer des ventes.');
  }
  return business;
}

/** 3. requireRole() — rôle autorisé, sinon FORBIDDEN_ROLE. */
export function requireRole(role: UserRole, allowed: UserRole[]): void {
  if (!allowed.includes(role)) {
    throw new AppError('FORBIDDEN_ROLE', 'Rôle non autorisé pour cette action.');
  }
}

/** 4. requireOwnership() — la ressource appartient à la boutique, sinon RESOURCE_NOT_OWNED. */
export function requireOwnership<T extends { businessId: string } | null | undefined>(
  resource: T,
  businessId: string
): asserts resource is NonNullable<T> {
  if (!resource || resource.businessId !== businessId) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Ressource introuvable.');
  }
}

/** 5. checkQuota() — quota du plan, sinon QUOTA_PRODUCTS_REACHED / QUOTA_USERS_REACHED. */
export async function checkQuota(businessId: string, type: 'products' | 'users'): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { plan: true },
  });
  if (!business?.plan) return;

  if (type === 'products') {
    const count = await prisma.product.count({ where: { businessId, actif: true } });
    if (business.plan.maxProduits > 0 && count >= business.plan.maxProduits) {
      throw new AppError('QUOTA_PRODUCTS_REACHED', 'Limite de produits atteinte pour votre offre.');
    }
  }

  if (type === 'users') {
    const count = await prisma.user.count({ where: { businessId, actif: true } });
    if (business.plan.maxUsers > 0 && count >= business.plan.maxUsers) {
      throw new AppError('QUOTA_USERS_REACHED', "Limite d'utilisateurs atteinte pour votre offre.");
    }
  }
}

/**
 * Export Excel réservé aux plans avec `Plan.exportExcel` (spec §1.8 : champ du
 * modèle Plan). Aucun code d'erreur dédié n'existe dans la liste fixe du cahier
 * des charges (§8) pour "export Excel non inclus dans l'offre" — VALIDATION_ERROR
 * est le choix le moins inexact parmi les codes existants, à défaut d'en inventer
 * un nouveau hors spec.
 */
export async function requireExportExcelAllowed(businessId: string): Promise<void> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { plan: true } });
  if (business?.plan && !business.plan.exportExcel) {
    throw new AppError('VALIDATION_ERROR', "L'export Excel n'est pas inclus dans votre offre.");
  }
}

/** 6. auditable() — journalisation si action sensible. */
export async function auditable(
  ctx: { businessId: string; userId: string },
  entry: {
    action: string;
    entite: string;
    entiteId?: string;
    anciennesValeurs?: unknown;
    nouvellesValeurs?: unknown;
    motif?: string;
    ip?: string;
  }
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      businessId: ctx.businessId,
      userId: ctx.userId,
      action: entry.action,
      entite: entry.entite,
      entiteId: entry.entiteId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      anciennesValeurs: entry.anciennesValeurs as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nouvellesValeurs: entry.nouvellesValeurs as any,
      motif: entry.motif,
      ip: entry.ip,
    },
  });
}

/**
 * Pipeline composé pour une route de lecture : seule la session est requise.
 * Le business peut être SUSPENDU/RESILIE — la lecture reste autorisée (spec §6 ne
 * s'applique qu'aux mutations).
 */
export async function guardRead(): Promise<AuthedContext> {
  const session = await requireSession();
  const business = await prisma.business.findUnique({ where: { id: session.businessId } });
  if (!business) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'Boutique introuvable.');
  }
  return { ...session, business };
}

/**
 * Pipeline composé pour une route de mutation : session → business inscriptible → rôle.
 * `requireOwnership` et `checkQuota` restent à appeler explicitement par la route quand
 * une ressource précise ou un quota spécifique est concerné.
 */
export async function guardMutation(opts: { roles?: UserRole[] } = {}): Promise<AuthedContext> {
  const session = await requireSession();
  const business = await requireBusinessWritable(session.businessId);
  if (opts.roles) {
    requireRole(session.role, opts.roles);
  }
  return { ...session, business };
}
