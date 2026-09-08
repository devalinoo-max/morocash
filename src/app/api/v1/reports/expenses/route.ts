import { guardRead, requireRole } from '@/server/guards';
import { getExpensesReport, resolveMonthRange } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const url = new URL(request.url);
    const now = new Date();
    const fromParam = url.searchParams.get('from');
    const toParam = url.searchParams.get('to');
    const defaultRange = resolveMonthRange(now.getFullYear(), now.getMonth() + 1);
    const from = fromParam ? new Date(fromParam) : defaultRange.from;
    const to = toParam ? new Date(toParam) : defaultRange.to;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new AppError('VALIDATION_ERROR', 'Paramètres "from"/"to" invalides.');
    }

    const report = await getExpensesReport(ctx.businessId, from, to);
    return ok({ from, to, ...report });
  } catch (error) {
    return fail(error);
  }
}
