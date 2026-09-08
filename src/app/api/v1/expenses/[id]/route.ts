import { guardMutation, auditable } from '@/server/guards';
import { updateExpense, updateExpenseSchema } from '@/server/modules/expenses/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = updateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const expense = await updateExpense(ctx.businessId, id, parsed.data);

    await auditable(ctx, { action: 'EXPENSE_UPDATED', entite: 'Expense', entiteId: id });

    return ok({ expense });
  } catch (error) {
    return fail(error);
  }
}
