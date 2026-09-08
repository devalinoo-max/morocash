import { guardMutation, auditable } from '@/server/guards';
import { createAdjustment, adjustmentSchema } from '@/server/modules/stock/movements';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT', 'SELLER'] });

    const body = await request.json().catch(() => null);
    const parsed = adjustmentSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await createAdjustment(ctx.businessId, ctx.userId, parsed.data);

    if (result.status === 'CREATED') {
      await auditable(ctx, {
        action: `STOCK_${result.movement.type}`,
        entite: 'StockMovement',
        entiteId: result.movement.id,
        motif: parsed.data.motif,
      });
    }

    return ok(
      { status: result.status, movement: result.movement },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
