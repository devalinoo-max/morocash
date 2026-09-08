import { guardRead, requireRole } from '@/server/guards';
import { getDailyReport } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const date = dateParam ? new Date(dateParam) : new Date();
    if (Number.isNaN(date.getTime())) {
      throw new AppError('VALIDATION_ERROR', 'Paramètre "date" invalide.');
    }

    const totals = await getDailyReport(ctx.businessId, date);

    return ok({ date, ...totals });
  } catch (error) {
    return fail(error);
  }
}
