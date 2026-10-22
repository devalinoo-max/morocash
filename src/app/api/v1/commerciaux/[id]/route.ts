import { guardMutation, auditable } from '@/server/guards';
import { updateCommercial, updateCommercialSchema } from '@/server/modules/commerciaux/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Nom, téléphone, actif / inactif. Jamais de suppression : ses ventes passées restent comptées. */
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER'] });
    const body = await request.json().catch(() => null);
    const parsed = updateCommercialSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }
    const commercial = await updateCommercial(ctx.businessId, id, parsed.data);
    await auditable(ctx, {
      action: 'COMMERCIAL_UPDATED',
      entite: 'Commercial',
      entiteId: id,
      nouvellesValeurs: parsed.data,
    });
    return ok({ commercial });
  } catch (error) {
    return fail(error);
  }
}
