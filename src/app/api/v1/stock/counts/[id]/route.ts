import { guardRead, requireRole } from '@/server/guards';
import { getStockCountDetail } from '@/server/modules/stock/counts';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Même réserve que la liste des comptages : le détail porte les coûts
// unitaires et la valeur des écarts, données financières fermées au vendeur
// (spec §0 règle 7).
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const detail = await getStockCountDetail(ctx.businessId, id);
    return ok(detail);
  } catch (error) {
    return fail(error);
  }
}
