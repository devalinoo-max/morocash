import { randomBytes, createHash } from 'crypto';
import { cookies } from 'next/headers';
import type { Affiliate } from '@prisma/client';
import { AppError } from '@/server/shared/errors';
import {
  createAffiliateSession,
  deleteAffiliateSessionByHash,
  extendAffiliateSession,
  findAffiliateSessionByHash,
} from '@/server/repositories/affiliates';

/**
 * Session affilié : cookie et table distincts de la session boutique
 * (morocash_session). Les deux peuvent coexister dans le même navigateur sans
 * qu'aucune ne donne accès à l'autre espace.
 */
const COOKIE = 'morocash_affiliate_session';
const MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Même fenêtre glissante que la session boutique : au plus une écriture par jour.
const RENEW_THRESHOLD_MS = (MAX_AGE_DAYS - 1) * DAY_MS;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  };
}

export async function startAffiliateSession(affiliateId: string): Promise<void> {
  const token = randomBytes(32).toString('hex');
  await createAffiliateSession({
    affiliateId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + MAX_AGE_DAYS * DAY_MS),
  });
  const store = await cookies();
  store.set(COOKIE, token, cookieOptions());
}

/** Affilié connecté, sinon AUTH_SESSION_EXPIRED. */
export async function requireAffiliate(): Promise<Affiliate> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  const session = token ? await findAffiliateSessionByHash(hashToken(token)) : null;
  if (!token || !session || session.expiresAt < new Date() || !session.affiliate.actif) {
    throw new AppError('AUTH_SESSION_EXPIRED', 'Session invalide ou expirée.');
  }

  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    void extendAffiliateSession(session.id, new Date(Date.now() + MAX_AGE_DAYS * DAY_MS)).catch(() => undefined);
    try {
      store.set(COOKIE, token, cookieOptions());
    } catch {
      // contexte en lecture seule : la session reste bonne côté serveur
    }
  }
  return session.affiliate;
}

export async function endAffiliateSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) await deleteAffiliateSessionByHash(hashToken(token));
  store.delete(COOKIE);
}
