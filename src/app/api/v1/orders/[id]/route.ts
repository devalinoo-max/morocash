import { guardRead } from '@/server/guards';
import { getOrder } from '@/server/modules/orders/service';
import { serializeOrder } from '@/server/serializers/order';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    const order = await getOrder(ctx.businessId, id);
    return ok({ order: serializeOrder(order, ctx.role) });
  } catch (error) {
    return fail(error);
  }
}
