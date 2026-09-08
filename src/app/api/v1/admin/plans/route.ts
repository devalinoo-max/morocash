import { requireAdminSession } from '@/server/guards/admin';
import { listPlans } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    await requireAdminSession();
    const plans = await listPlans();
    return ok({ plans });
  } catch (error) {
    return fail(error);
  }
}
