import { guardMutation } from '@/server/guards';
import { closeRegister, closeRegisterSchema } from '@/server/modules/cash/service';
import { serializeCashRegister } from '@/server/serializers/cash';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = closeRegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    // closeRegister() journalise déjà CASH_REGISTER_CLOSED dans sa propre
    // transaction (voir cash/service.ts) — pas de second auditable() ici.
    const result = await closeRegister({ businessId: ctx.businessId, userId: ctx.userId }, parsed.data);

    return ok({
      register: serializeCashRegister(result.register, ctx.role),
      ...(ctx.role === 'SELLER' ? {} : { attenduTotal: result.attenduTotal }),
    });
  } catch (error) {
    return fail(error);
  }
}
