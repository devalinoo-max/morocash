import { guardRead } from '@/server/guards';
import { getCurrentRegister } from '@/server/modules/cash/service';
import { serializeCashRegister } from '@/server/serializers/cash';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    const ctx = await guardRead();
    const register = await getCurrentRegister(ctx.businessId);
    return ok({ register: register ? serializeCashRegister(register, ctx.role) : null });
  } catch (error) {
    return fail(error);
  }
}
