import { randomBytes, createHash } from 'crypto';
import { cookies } from 'next/headers';
import type { UserRole } from '@prisma/client';
import { prisma } from '@/server/database/client';

const SESSION_COOKIE = 'morocash_session';
const SESSION_MAX_AGE_DAYS = Number(process.env.SESSION_MAX_AGE_DAYS ?? '30');

export interface SessionInfo {
  sessionId: string;
  userId: string;
  businessId: string;
  role: UserRole;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ─── Logique pure (testable sans contexte de requête Next.js) ───

/** Crée une session en base et retourne le jeton en clair — ne pose aucun cookie. */
export async function issueSessionToken(
  userId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId, tokenHash, ip: meta.ip, userAgent: meta.userAgent, expiresAt },
  });

  return token;
}

/**
 * Fenêtre de prolongation glissante : une session est repoussée à 30 jours
 * pleins dès qu'il lui en reste moins de 29. Un commerçant qui ouvre MoroCash
 * tous les jours ne ressaisit donc jamais son code.
 *
 * Le seuil (et non une prolongation à chaque appel) évite d'écrire en base à
 * chaque requête : au plus une écriture par jour et par appareil.
 */
const SESSION_RENEW_THRESHOLD_MS = (SESSION_MAX_AGE_DAYS - 1) * 24 * 60 * 60 * 1000;

/** Valide un jeton de session et retourne son contexte — ne lit aucun cookie. */
export async function validateSessionToken(token: string): Promise<SessionInfo | null> {
  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.actif) {
    return null;
  }

  if (session.expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    // Volontairement sans await : prolonger la session ne doit jamais retarder
    // la requête en cours, et si l'écriture échoue la session reste valide.
    void prisma.session
      .update({ where: { id: session.id }, data: { expiresAt } })
      .catch(() => undefined);
  }

  return {
    sessionId: session.id,
    userId: session.user.id,
    businessId: session.user.businessId,
    role: session.user.role,
  };
}

export async function destroySessionToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

// ─── Intégration cookies (uniquement depuis les route handlers) ───

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
    path: '/',
  });
}

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<void> {
  const token = await issueSessionToken(userId, meta);
  await setSessionCookie(token);
}

export async function getSessionFromCookies(): Promise<SessionInfo | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await validateSessionToken(token);
  if (!session) return null;

  // Le cookie est repoussé en même temps que la session en base (voir
  // SESSION_RENEW_THRESHOLD_MS) : sans ça, le navigateur oublierait le jeton
  // au bout de 30 jours alors que le serveur le considère encore valide.
  // Certains contextes de rendu interdisent d'écrire un cookie ; l'échec est
  // sans conséquence, la session reste bonne côté serveur.
  try {
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_DAYS * 24 * 60 * 60,
      path: '/',
    });
  } catch {
    // Lecture seule (rendu statique) : rien à faire.
  }

  return session;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await destroySessionToken(token);
  }
  store.delete(SESSION_COOKIE);
}

/** Rotation du jeton à chaque connexion (spec §5). */
export async function rotateSession(
  userId: string,
  meta: { ip?: string; userAgent?: string }
): Promise<void> {
  await destroySession();
  await createSession(userId, meta);
}

export function requestMeta(request: Request): { ip?: string; userAgent?: string } {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return {
    ip: forwardedFor?.split(',')[0]?.trim() ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  };
}
