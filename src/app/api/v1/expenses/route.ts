import { guardRead, guardMutation, requireRole, auditable } from '@/server/guards';
import { createExpense, createExpenseSchema, listExpenses } from '@/server/modules/expenses/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Les dépenses sont des données de coût — le SELLER n'y a jamais accès (spec §0.7).
export async function GET() {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);
    const expenses = await listExpenses(ctx.businessId);
    return ok({ expenses });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = createExpenseSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await createExpense({ businessId: ctx.businessId, userId: ctx.userId }, parsed.data);

    if (result.status === 'CREATED') {
      await auditable(ctx, { action: 'EXPENSE_CREATED', entite: 'Expense', entiteId: result.expense.id });
    }

    return ok(
      { status: result.status, expense: result.expense },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
