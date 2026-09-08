import { guardRead, requireRole } from '@/server/guards';
import { getHistory } from '@/server/modules/cash/service';
import { serializeCashRegister } from '@/server/serializers/cash';
import { ok, fail } from '@/server/shared/response';

// L'historique expose les écarts de clôtures passées — donnée réservée
// OWNER/ACCOUNTANT (spec §0 règle 7), pas seulement filtrée au niveau des champs.
export async function GET() {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);
    const registers = await getHistory(ctx.businessId);
    return ok({ registers: registers.map((r) => serializeCashRegister(r, ctx.role)) });
  } catch (error) {
    return fail(error);
  }
}
