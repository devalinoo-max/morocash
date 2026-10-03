import { prisma } from '@/server/database/client';

/**
 * Abonnements Web Push et historique des envois. Hors de `scoped()` : ces
 * tables ne sont pas sous RLS (voir scripts/apply-rls.ts), l'envoi depuis
 * l'admin est cross-tenant, et les écritures côté boutique filtrent
 * explicitement sur l'utilisateur connecté.
 */

export interface PushKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Un endpoint ne sert qu'un compte : s'y réabonner depuis un autre compte réattribue la ligne. */
export function upsertPushSubscription(input: PushKeys & { businessId: string; userId: string; userAgent?: string }) {
  const data = {
    businessId: input.businessId,
    userId: input.userId,
    p256dh: input.p256dh,
    auth: input.auth,
    userAgent: input.userAgent,
    lastUsedAt: new Date(),
  };
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: data,
    create: { endpoint: input.endpoint, ...data },
  });
}

/** Désabonnement depuis l'app : ne touche que les appareils de l'utilisateur connecté. */
export function deletePushSubscriptionForUser(endpoint: string, userId: string) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
}

/** Appareils à notifier : tous, ou ceux d'une boutique. Comptes désactivés exclus. */
export function listPushTargets(businessId?: string) {
  return prisma.pushSubscription.findMany({
    where: { user: { actif: true }, ...(businessId ? { businessId } : {}) },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
}

/** Appareils dont le navigateur a révoqué l'abonnement (réponse 404/410 du service push). */
export function deletePushSubscriptions(ids: string[]) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
}

export function markPushSubscriptionsUsed(ids: string[]) {
  if (ids.length === 0) return Promise.resolve({ count: 0 });
  return prisma.pushSubscription.updateMany({ where: { id: { in: ids } }, data: { lastUsedAt: new Date() } });
}

export async function countPushAudience() {
  const [appareils, boutiques] = await Promise.all([
    prisma.pushSubscription.count({ where: { user: { actif: true } } }),
    prisma.pushSubscription.groupBy({ by: ['businessId'], where: { user: { actif: true } } }),
  ]);
  return { appareils, boutiques: boutiques.length };
}

export function createPushBroadcast(input: {
  adminUserId: string;
  titre: string;
  message: string;
  lien?: string;
  cible: string;
  businessId?: string;
  appareils?: number;
  envoyes?: number;
  echecs?: number;
  statut: 'ENVOYE' | 'PROGRAMME';
  programmeLe?: Date;
  envoyeLe?: Date;
}) {
  return prisma.pushBroadcast.create({ data: input });
}

/** Seule une notification encore programmée peut être annulée. */
export function cancelPushBroadcast(id: string) {
  return prisma.pushBroadcast.updateMany({ where: { id, statut: 'PROGRAMME' }, data: { statut: 'ANNULE' } });
}

export function listDuePushBroadcasts(now: Date) {
  return prisma.pushBroadcast.findMany({
    where: { statut: 'PROGRAMME', programmeLe: { lte: now } },
    orderBy: { programmeLe: 'asc' },
    take: 20,
  });
}

/** Réserve l'envoi : faux si un autre passage du cron l'a déjà pris (ou si l'admin l'a annulé). */
export async function claimPushBroadcast(id: string): Promise<boolean> {
  const { count } = await prisma.pushBroadcast.updateMany({
    where: { id, statut: 'PROGRAMME' },
    data: { statut: 'EN_COURS' },
  });
  return count === 1;
}

export function finishPushBroadcast(id: string, counts: { appareils: number; envoyes: number; echecs: number }) {
  return prisma.pushBroadcast.update({ where: { id }, data: { ...counts, statut: 'ENVOYE', envoyeLe: new Date() } });
}

export function releasePushBroadcast(id: string) {
  return prisma.pushBroadcast.updateMany({ where: { id, statut: 'EN_COURS' }, data: { statut: 'PROGRAMME' } });
}

export async function listPushBroadcasts(limit = 50) {
  const broadcasts = await prisma.pushBroadcast.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  const businessIds = [...new Set(broadcasts.map((b) => b.businessId).filter((id): id is string => !!id))];
  const businesses = businessIds.length
    ? await prisma.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, nom: true } })
    : [];
  const noms = new Map(businesses.map((b) => [b.id, b.nom]));
  return broadcasts.map((b) => ({ ...b, businessNom: b.businessId ? (noms.get(b.businessId) ?? null) : null }));
}

export function findBusinessName(businessId: string) {
  return prisma.business.findUnique({ where: { id: businessId }, select: { id: true, nom: true } });
}
