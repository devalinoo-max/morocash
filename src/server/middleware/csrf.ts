import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { AppError } from '@/server/shared/errors';

const CSRF_COOKIE = 'morocash_csrf';
const CSRF_HEADER = 'x-csrf-token';

/** Émet le jeton CSRF (cookie lisible par le client) à la connexion/inscription. */
export async function issueCsrfToken(): Promise<void> {
  const token = randomBytes(24).toString('hex');
  const store = await cookies();
  store.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

/** Double-submit cookie : le header doit correspondre au cookie (spec §5). */
export async function assertCsrf(request: Request): Promise<void> {
  const store = await cookies();
  const cookieToken = store.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    throw new AppError('VALIDATION_ERROR', 'Jeton CSRF invalide ou manquant.');
  }
}

export async function clearCsrfToken(): Promise<void> {
  const store = await cookies();
  store.delete(CSRF_COOKIE);
}
