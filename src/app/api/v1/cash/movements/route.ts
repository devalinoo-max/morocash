import { guardRead, guardMutation, auditable } from '@/server/guards';
import { createManualMovement, manualMovementSchema, listMovements } from '@/server/modules/cash/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    const url = new URL(request.url);
    const cashRegisterId = url.searchParams.get('cashRegisterId') ?? undefined;
    const movements = await listMovements(ctx.businessId, cashRegisterId);
    return ok({ movements });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = manualMovementSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await createManualMovement(
      { businessId: ctx.businessId, userId: ctx.userId, cashRegisterMode: ctx.business.cashRegisterMode },
      parsed.data
    );

    if (result.status === 'CREATED') {
      await auditable(ctx, {
        action: 'CASH_MOVEMENT_CREATED',
        entite: 'CashMovement',
        entiteId: result.movement.id,
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
