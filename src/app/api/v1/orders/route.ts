import { guardMutation, guardRead } from '@/server/guards';
import { createOrder, createOrderSchema } from '@/server/modules/orders/createOrder';
import { listOrders } from '@/server/modules/orders/service';
import { serializeOrderList } from '@/server/serializers/order';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET() {
  try {
    const ctx = await guardRead();
    const orders = await listOrders(ctx.businessId);
    return ok({ orders: serializeOrderList(orders, ctx.role) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await createOrder(
      {
        businessId: ctx.businessId,
        userId: ctx.userId,
        role: ctx.role,
        remiseMaxVendeur: ctx.business.remiseMaxVendeur,
      },
      parsed.data
    );

    return ok(
      { status: result.status, order: result.order },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
