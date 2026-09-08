import { destroyAdminSession } from '@/server/modules/admin/session';
import { ok, fail } from '@/server/shared/response';

export async function POST() {
  try {
    await destroyAdminSession();
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
