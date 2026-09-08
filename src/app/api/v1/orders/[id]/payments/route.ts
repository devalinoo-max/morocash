import { guardMutation } from '@/server/guards';
import { addOrderPayment, addOrderPaymentSchema } from '@/server/modules/orders/payments';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = addOrderPaymentSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    // addOrderPayment() journalise déjà ORDER_PAYMENT_ADDED dans sa propre
    // transaction (voir orders/payments.ts) — pas de second auditable() ici.
    const result = await addOrderPayment(ctx, id, parsed.data);

    return ok(
      { status: result.status, payment: result.payment },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
