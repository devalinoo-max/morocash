import { guardMutation, auditable } from '@/server/guards';
import { openRegister, openRegisterSchema } from '@/server/modules/cash/service';
import { serializeCashRegister } from '@/server/serializers/cash';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = openRegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const register = await openRegister({ businessId: ctx.businessId, userId: ctx.userId }, parsed.data);

    await auditable(ctx, { action: 'CASH_REGISTER_OPENED', entite: 'CashRegister', entiteId: register.id });

    return ok({ register: serializeCashRegister(register, ctx.role) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
