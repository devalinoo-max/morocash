import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const ADMIN_SESSION_COOKIE = 'morocash_admin_session';
// Session de back-office, pas une session mobile longue durée — 8h.
const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * `AdminUser` (spec §2) n'a pas de table de session dédiée dans le schéma — à la
 * différence de `Session`, liée à `User`. Le cahier des charges ne détaille pas
 * non plus de route de connexion admin (§8 ne liste que des actions déjà
 * authentifiées). Choix assumé ici plutôt que d'ajouter une table hors spec : une
 * session admin stateless (JWT signé via `jose`, dépendance déjà prévue au projet
 * mais jusqu'ici inutilisée), sous un nom de cookie distinct du cookie de session
 * tenant pour qu'aucune des deux ne puisse jamais être confondue avec l'autre.
 */
function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET manquant.');
  return new TextEncoder().encode(secret);
}

export async function issueAdminSessionToken(adminUserId: string): Promise<string> {
  return new SignJWT({ adminUserId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function validateAdminSessionToken(token: string): Promise<{ adminUserId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.adminUserId !== 'string') return null;
    return { adminUserId: payload.adminUserId };
  } catch {
    return null;
  }
}

export async function setAdminSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: '/',
  });
}

export async function getAdminSessionFromCookies(): Promise<{ adminUserId: string } | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateAdminSessionToken(token);
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
}
