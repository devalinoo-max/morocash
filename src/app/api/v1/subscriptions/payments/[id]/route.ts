import { guardRead } from '@/server/guards';
import { getPaymentStatus } from '@/server/modules/subscriptions/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Interrogée par la page de retour après la page de paiement pawaPay. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Paiement introuvable.');
    }

    const payment = await getPaymentStatus(ctx.businessId, id);
    return ok({ payment });
  } catch (error) {
    return fail(error);
  }
}
