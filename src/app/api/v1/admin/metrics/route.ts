import { requireAdminSession } from '@/server/guards/admin';
import { getMetrics } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    await requireAdminSession();
    const metrics = await getMetrics();
    return ok(metrics);
  } catch (error) {
    return fail(error);
  }
}
