import { guardRead, requireRole } from '@/server/guards';
import { getRangeReport, resolveMonthRange } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') ?? now.getFullYear());
    const month = Number(url.searchParams.get('month') ?? now.getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new AppError('VALIDATION_ERROR', 'Paramètres "year"/"month" invalides.');
    }

    const { from, to } = resolveMonthRange(year, month);
    const totals = await getRangeReport(ctx.businessId, from, to);

    return ok({ year, month, from, to, ...totals });
  } catch (error) {
    return fail(error);
  }
}
