import { guardRead, requireRole } from '@/server/guards';
import { getInsights } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const insights = await getInsights(ctx.businessId);
    return ok(insights);
  } catch (error) {
    return fail(error);
  }
}
