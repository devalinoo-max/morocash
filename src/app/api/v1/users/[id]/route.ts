import { z } from 'zod';
import { guardMutation, auditable, requirePermission, EMPLOYEE_PERMISSIONS } from '@/server/guards';
import { setEmployeeActive } from '@/server/modules/users/service';
import { serializeUser } from '@/server/serializers/user';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const patchSchema = z
  .object({
    actif: z.boolean().optional(),
    estCommercial: z.boolean().optional(),
    // Le rôle se change sans recréer la personne : ses ventes passées lui
    // restent attachées.
    role: z.enum(['SELLER', 'ACCOUNTANT']).optional(),
    // Les cases cochées une par une par le propriétaire. Une liste vide est un
    // choix valable (tout décoché), pas une absence de choix.
    permissions: z.array(z.enum(EMPLOYEE_PERMISSIONS)).optional(),
  })
  .refine(
    (v) =>
      v.actif !== undefined ||
      v.estCommercial !== undefined ||
      v.role !== undefined ||
      v.permissions !== undefined
  );

// Désactivation/réactivation, rôle et permissions — pas de suppression réelle
// (spec §0 règle 4). Réservé à qui a le droit « Gérer les employés », que le
// propriétaire possède d'office et peut accorder à un gestionnaire.
export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation();
    requirePermission(ctx, 'GERER_EMPLOYES');

    const body = await request.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const { user, avant } = await setEmployeeActive(ctx.businessId, id, parsed.data);

    // Toucher aux droits de quelqu'un est une action sensible : le journal
    // garde qui, quand et quoi, en distinguant la désactivation du simple
    // changement de rôle ou de cases.
    const action =
      parsed.data.actif !== undefined
        ? parsed.data.actif
          ? 'USER_REACTIVATED'
          : 'USER_DEACTIVATED'
        : parsed.data.role !== undefined || parsed.data.permissions !== undefined
          ? 'USER_PERMISSIONS_CHANGED'
          : 'USER_UPDATED';

    await auditable(ctx, {
      action,
      anciennesValeurs:
        action === 'USER_PERMISSIONS_CHANGED'
          ? { role: avant.role, permissions: avant.permissions }
          : undefined,
      nouvellesValeurs: parsed.data,
      entite: 'User',
      entiteId: id,
    });

    return ok({ user: serializeUser(user) });
  } catch (error) {
    return fail(error);
  }
}
