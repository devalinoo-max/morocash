import { guardMutation } from '@/server/guards';
import { cancelOrder, cancelOrderSchema } from '@/server/modules/orders/cancelOrder';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = cancelOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const order = await cancelOrder(ctx, id, parsed.data.motif);

    return ok({ order });
  } catch (error) {
    return fail(error);
  }
}
