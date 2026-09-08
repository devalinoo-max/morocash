import { guardMutation, auditable } from '@/server/guards';
import { cancelMovement } from '@/server/modules/stock/movements';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const inverse = await cancelMovement(ctx.businessId, ctx.userId, id);

    await auditable(ctx, {
      action: 'STOCK_MOVEMENT_CANCELLED',
      entite: 'StockMovement',
      entiteId: id,
      nouvellesValeurs: { mouvementInverseId: inverse.id },
    });

    return ok({ inverse });
  } catch (error) {
    return fail(error);
  }
}
