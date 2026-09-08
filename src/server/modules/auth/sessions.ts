import { prisma } from '@/server/database/client';

export interface MySessionView {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

/** Liste les sessions actives (non expirées) de l'utilisateur connecté — "Mes appareils connectés". */
export async function listMySessions(userId: string, currentSessionId: string): Promise<MySessionView[]> {
  const sessions = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  return sessions.map((s) => ({
    id: s.id,
    ip: s.ip,
    userAgent: s.userAgent,
    createdAt: s.createdAt,
    isCurrent: s.id === currentSessionId,
  }));
}

/**
 * Révoque une session précise appartenant à l'utilisateur connecté (le filtre
 * userId empêche de révoquer la session de quelqu'un d'autre en devinant un id).
 */
export async function revokeMySession(userId: string, sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId, userId } });
}

/** "Me déconnecter partout" — révoque toutes les sessions sauf celle en cours. */
export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
  const result = await prisma.session.deleteMany({
    where: { userId, id: { not: currentSessionId } },
  });
  return result.count;
}
