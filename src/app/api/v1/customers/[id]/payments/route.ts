import { guardMutation } from '@/server/guards';
import { repayDebt, repayDebtSchema } from '@/server/modules/customers/debt';
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
    const parsed = repayDebtSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await repayDebt(ctx, id, parsed.data);

    return ok(
      { status: result.status, payment: result.payment },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
