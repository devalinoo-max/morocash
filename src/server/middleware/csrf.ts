import { randomBytes, timingSafeEqual } from 'crypto';
import { cookies, headers } from 'next/headers';
import { AppError } from '@/server/shared/errors';

const CSRF_COOKIE = 'morocash_csrf';
const CSRF_HEADER = 'x-csrf-token';
// Même durée que la session (30 jours) : sans ça le jeton disparaissait à la
// fermeture du navigateur alors que la session, elle, restait valide.
const CSRF_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_DAYS ?? '30') * 24 * 60 * 60;

function cookieOptions() {
  return {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: CSRF_MAX_AGE_SECONDS,
    path: '/',
  };
}

/** Émet le jeton CSRF (cookie lisible par le client) à la connexion/inscription. */
export async function issueCsrfToken(): Promise<void> {
  const token = randomBytes(24).toString('hex');
  const store = await cookies();
  store.set(CSRF_COOKIE, token, cookieOptions());
}

/**
 * Pose un jeton s'il n'y en a pas encore. Appelé par les lectures authentifiées
 * (guardRead, session admin, session affilié) : une personne déjà connectée
 * avant que le contrôle CSRF soit actif, ou dont le navigateur a perdu le
 * cookie, en récupère un dès l'ouverture de l'app, avant sa première écriture.
 */
export async function ensureCsrfToken(): Promise<void> {
  try {
    const store = await cookies();
    if (store.get(CSRF_COOKIE)?.value) return;
    store.set(CSRF_COOKIE, randomBytes(24).toString('hex'), cookieOptions());
  } catch {
    // Contexte en lecture seule : le jeton sera posé à la prochaine lecture.
  }
}

/** Double-submit cookie : le header doit correspondre au cookie (spec §5). */
export async function assertCsrf(): Promise<void> {
  const cookieToken = (await cookies()).get(CSRF_COOKIE)?.value;
  const headerToken = (await headers()).get(CSRF_HEADER);

  const a = Buffer.from(cookieToken ?? '');
  const b = Buffer.from(headerToken ?? '');
  if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new AppError('VALIDATION_ERROR', 'Jeton CSRF invalide ou manquant.');
  }
}

export async function clearCsrfToken(): Promise<void> {
  const store = await cookies();
  store.delete(CSRF_COOKIE);
}
