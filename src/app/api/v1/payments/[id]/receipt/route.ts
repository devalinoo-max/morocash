import { guardRead } from '@/server/guards';
import { getVersementReceipt } from '@/server/modules/payments/versements';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Données figées du reçu d'un versement : les chiffres du jour du versement. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    return ok(await getVersementReceipt(ctx.businessId, id));
  } catch (error) {
    return fail(error);
  }
}
