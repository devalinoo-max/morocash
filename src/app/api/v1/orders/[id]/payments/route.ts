import { guardMutation, guardRead } from '@/server/guards';
import {
  collectOrderPayment,
  listOrderVersements,
  versementSchema,
} from '@/server/modules/payments/versements';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Historique des paiements d'une commande, du 1er versement au dernier. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    return ok(await listOrderVersements(ctx.businessId, id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = versementSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Le montant reçu doit être un nombre entier supérieur à 0.',
        parsed.error.flatten()
      );
    }

    // collectOrderPayment() journalise déjà ORDER_PAYMENT_ADDED dans sa propre
    // transaction — pas de second auditable() ici.
    const result = await collectOrderPayment(
      {
        businessId: ctx.businessId,
        userId: ctx.userId,
        cashRegisterMode: ctx.business.cashRegisterMode,
      },
      id,
      parsed.data
    );

    return ok(
      { status: result.status, versement: result.versement, payment: result.payment },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
