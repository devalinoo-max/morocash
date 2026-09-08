import { requireSession, auditable } from '@/server/guards';
import { revokeMySession } from '@/server/modules/auth/sessions';
import { ok, fail } from '@/server/shared/response';

/** DELETE /auth/sessions/:id — déconnecte un appareil précis (réglages > Mon compte). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireSession();
    const { id } = await params;
    await revokeMySession(ctx.userId, id);
    await auditable(ctx, { action: 'SESSION_REVOKED', entite: 'Session', entiteId: id });
    return ok({ revoked: true });
  } catch (error) {
    return fail(error);
  }
}
