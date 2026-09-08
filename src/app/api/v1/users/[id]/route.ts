import { z } from 'zod';
import { guardMutation, auditable } from '@/server/guards';
import { setEmployeeActive } from '@/server/modules/users/service';
import { serializeUser } from '@/server/serializers/user';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z.object({ actif: z.boolean() });

// Désactivation/réactivation uniquement — pas de suppression réelle (spec §0
// règle 4), réservé au propriétaire.
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER'] });

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const user = await setEmployeeActive(ctx.businessId, id, parsed.data.actif);

    await auditable(ctx, {
      action: parsed.data.actif ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
      entite: 'User',
      entiteId: id,
    });

    return ok({ user: serializeUser(user) });
  } catch (error) {
    return fail(error);
  }
}
