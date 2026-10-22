import { z } from 'zod';
import { guardMutation } from '@/server/guards';
import { changeOrderCommercial } from '@/server/modules/commerciaux/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const schema = z.object({ commercialId: z.string().uuid().nullable() });

/**
 * Correction du commercial d'une vente, par le propriétaire seulement. Le
 * changement est journalisé (qui, quand, ancien, nouveau) ; les totaux du
 * tableau de bord, calculés à la lecture, suivent d'eux-mêmes.
 */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER'] });
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }
    const order = await changeOrderCommercial(
      { businessId: ctx.businessId, userId: ctx.userId },
      id,
      parsed.data.commercialId
    );
    return ok({ order: { id: order.id, commercialId: order.commercialId } });
  } catch (error) {
    return fail(error);
  }
}
