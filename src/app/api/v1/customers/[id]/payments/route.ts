import { guardMutation, guardRead } from '@/server/guards';
import {
  collectCustomerDebt,
  listCustomerVersements,
  versementSchema,
} from '@/server/modules/payments/versements';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Tous les versements d'un client, toutes commandes confondues. */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    return ok(await listCustomerVersements(ctx.businessId, id));
  } catch (error) {
    return fail(error);
  }
}

/** « Encaisser » depuis « Qui me doit » : réparti sur les commandes impayées. */
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

    // collectCustomerDebt() journalise DEBT_REPAYMENT dans sa propre transaction.
    const result = await collectCustomerDebt(
      {
        businessId: ctx.businessId,
        userId: ctx.userId,
        cashRegisterMode: ctx.business.cashRegisterMode,
      },
      id,
      parsed.data
    );

    return ok(
      {
        status: result.status,
        versements: result.versements,
        dette: result.dette,
        customer: result.customer,
        // Gardé pour une app pas encore à jour, qui n'attend qu'un paiement.
        payment: result.versements[0] ?? null,
      },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
