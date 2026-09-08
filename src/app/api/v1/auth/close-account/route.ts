import { guardMutation, auditable } from '@/server/guards';
import { closeAccount } from '@/server/modules/auth/closeAccount';
import { destroySession } from '@/server/modules/auth/session';
import { clearCsrfToken } from '@/server/middleware/csrf';
import { ok, fail } from '@/server/shared/response';

export async function POST() {
  try {
    const ctx = await guardMutation({ roles: ['OWNER'] });

    await closeAccount(ctx.businessId);
    await auditable(ctx, {
      action: 'BUSINESS_CLOSED',
      entite: 'Business',
      entiteId: ctx.businessId,
    });

    await destroySession();
    await clearCsrfToken();

    return ok({ closed: true });
  } catch (error) {
    return fail(error);
  }
}
