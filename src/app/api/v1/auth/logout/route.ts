import { destroySession } from '@/server/modules/auth/session';
import { clearCsrfToken } from '@/server/middleware/csrf';
import { ok, fail } from '@/server/shared/response';

export async function POST() {
  try {
    await destroySession();
    await clearCsrfToken();
    return ok({ loggedOut: true });
  } catch (error) {
    return fail(error);
  }
}
