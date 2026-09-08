import { guardMutation } from '@/server/guards';
import { pushSyncOperations, syncPushSchema } from '@/server/modules/sync/push';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    // guardMutation() rejette toute la requête (BUSINESS_READ_ONLY) si la
    // boutique est SUSPENDU/RESILIE — le client garde sa file locale puisqu'il ne
    // reçoit aucune confirmation SYNCED (spec §9 : "sans que le client perde sa
    // file").
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = syncPushSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const results = await pushSyncOperations(
      { businessId: ctx.businessId, userId: ctx.userId, role: ctx.role, cashRegisterMode: ctx.business.cashRegisterMode },
      parsed.data.operations
    );

    return ok({ results });
  } catch (error) {
    return fail(error);
  }
}
