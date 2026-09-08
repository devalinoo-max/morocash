import { requireSession, auditable } from '@/server/guards';
import { getSessionFromCookies } from '@/server/modules/auth/session';
import { listMySessions, revokeOtherSessions } from '@/server/modules/auth/sessions';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/** GET /auth/sessions — "Mes appareils connectés" (réglages > Mon compte). */
export async function GET() {
  try {
    const { userId } = await requireSession();
    const current = await getSessionFromCookies();
    if (!current) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'Session invalide ou expirée.');
    }
    const sessions = await listMySessions(userId, current.sessionId);
    return ok({ sessions });
  } catch (error) {
    return fail(error);
  }
}

/** DELETE /auth/sessions — "Me déconnecter partout" : coupe toutes les sessions sauf la session actuelle. */
export async function DELETE() {
  try {
    const ctx = await requireSession();
    const current = await getSessionFromCookies();
    if (!current) {
      throw new AppError('AUTH_SESSION_EXPIRED', 'Session invalide ou expirée.');
    }
    const revoked = await revokeOtherSessions(ctx.userId, current.sessionId);
    await auditable(ctx, { action: 'SESSIONS_REVOKED_OTHERS', entite: 'Session', entiteId: ctx.userId });
    return ok({ revoked });
  } catch (error) {
    return fail(error);
  }
}
