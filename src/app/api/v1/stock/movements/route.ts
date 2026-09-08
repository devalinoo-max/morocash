import { guardRead } from '@/server/guards';
import { listMovements } from '@/server/modules/stock/movements';
import { serializeStockMovementList } from '@/server/serializers/stockMovement';
import { ok, fail } from '@/server/shared/response';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    const url = new URL(request.url);
    const productId = url.searchParams.get('productId') ?? undefined;
    const movements = await listMovements(ctx.businessId, { productId });
    return ok({ movements: serializeStockMovementList(movements, ctx.role) });
  } catch (error) {
    return fail(error);
  }
}
