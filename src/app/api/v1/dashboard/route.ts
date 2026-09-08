import { guardRead, requireRole } from '@/server/guards';
import { getRangeReport, resolvePeriodRange, type DashboardPeriod } from '@/server/modules/reports/queries';
import { ok, fail } from '@/server/shared/response';

const VALID_PERIODS: DashboardPeriod[] = ['today', 'week', 'month', 'year'];

// DailyStats (nb commandes, marges, dépenses, créances) est une donnée de
// coût/marge — le SELLER en est exclu entièrement, pas seulement filtré par champ
// (spec §0 règle 7 : "Mes chiffres" réservé OWNER/ACCOUNTANT).
export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const url = new URL(request.url);
    const periodParam = url.searchParams.get('period');
    const period: DashboardPeriod = VALID_PERIODS.includes(periodParam as DashboardPeriod)
      ? (periodParam as DashboardPeriod)
      : 'today';

    const { from, to } = resolvePeriodRange(period);
    const totals = await getRangeReport(ctx.businessId, from, to);

    return ok({ period, from, to, ...totals });
  } catch (error) {
    return fail(error);
  }
}
