import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';

// 5 échecs → blocage 5 minutes, compteur par téléphone ET par IP (spec §5).
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export async function assertNotRateLimited(key: string, maxAttempts = MAX_ATTEMPTS): Promise<void> {
  const existing = await prisma.rateLimit.findUnique({ where: { cle: key } });
  if (existing && existing.resetAt > new Date() && existing.compteur >= maxAttempts) {
    throw new AppError('AUTH_TOO_MANY_ATTEMPTS', 'Trop de tentatives, réessayez plus tard.');
  }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);

  // Fenêtre encore ouverte : incrément atomique en une seule requête. Lire
  // puis écrire laissait des échecs simultanés se compter pour un seul.
  const bumped = await prisma.rateLimit.updateMany({
    where: { cle: key, resetAt: { gt: now } },
    data: { compteur: { increment: 1 } },
  });
  if (bumped.count > 0) return;

  // Pas de fenêtre en cours (première tentative, ou fenêtre expirée).
  await prisma.rateLimit.upsert({
    where: { cle: key },
    update: { compteur: 1, resetAt },
    create: { cle: key, compteur: 1, resetAt },
  });
}

export async function clearRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { cle: key } });
}

export function phoneKey(telephone: string): string {
  return `login:${telephone}`;
}

export function ipKey(ip: string): string {
  return `ip:${ip}`;
}
