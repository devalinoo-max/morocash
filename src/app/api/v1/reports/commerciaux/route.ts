import { guardRead, requirePermission } from '@/server/guards';
import { getCommerciauxReport } from '@/server/modules/commerciaux/service';
import { ok, fail } from '@/server/shared/response';
import { parsePeriod } from './period';

/** Tableau de bord des commerciaux : totaux calculés ici, jamais dans le navigateur. */
export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requirePermission(ctx, 'VOIR_VENTES_EQUIPE');
    const { from, to } = parsePeriod(new URL(request.url));
    const report = await getCommerciauxReport(ctx.businessId, from, to);
    return ok({ from, to, ...report });
  } catch (error) {
    return fail(error);
  }
}
