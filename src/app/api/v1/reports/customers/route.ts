import { guardRead, requirePermission } from '@/server/guards';
import { getCustomersReport } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    const ctx = await guardRead();
    requirePermission(ctx, 'VOIR_RAPPORTS');

    const customers = await getCustomersReport(ctx.businessId);
    return ok({ customers });
  } catch (error) {
    return fail(error);
  }
}
