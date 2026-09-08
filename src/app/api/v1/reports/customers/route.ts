import { guardRead, requireRole } from '@/server/guards';
import { getCustomersReport } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const customers = await getCustomersReport(ctx.businessId);
    return ok({ customers });
  } catch (error) {
    return fail(error);
  }
}
