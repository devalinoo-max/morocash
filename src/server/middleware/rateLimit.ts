import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';

// 5 échecs → blocage 5 minutes, compteur par téléphone ET par IP (spec §5).
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export async function assertNotRateLimited(key: string): Promise<void> {
  const existing = await prisma.rateLimit.findUnique({ where: { cle: key } });
  if (existing && existing.resetAt > new Date() && existing.compteur >= MAX_ATTEMPTS) {
    throw new AppError('AUTH_TOO_MANY_ATTEMPTS', 'Trop de tentatives, réessayez plus tard.');
  }
}

export async function recordFailedAttempt(key: string): Promise<void> {
  const now = new Date();
  const existing = await prisma.rateLimit.findUnique({ where: { cle: key } });

  if (!existing || existing.resetAt <= now) {
    await prisma.rateLimit.upsert({
      where: { cle: key },
      update: { compteur: 1, resetAt: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) },
      create: { cle: key, compteur: 1, resetAt: new Date(now.getTime() + LOCK_MINUTES * 60 * 1000) },
    });
    return;
  }

  await prisma.rateLimit.update({
    where: { cle: key },
    data: { compteur: { increment: 1 } },
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
