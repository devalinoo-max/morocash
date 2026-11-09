import { guardMutation, auditable, requirePermission } from '@/server/guards';
import { resetEmployeeCode, resetEmployeeCodeSchema } from '@/server/modules/users/service';
import { serializeUser } from '@/server/serializers/user';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * « Réinitialiser son code » depuis la fiche d'un employé.
 *
 * Réservé à qui gère les employés. Le nouveau code n'est jamais renvoyé par la
 * réponse : c'est l'appelant qui l'a choisi et qui le dit à la personne de
 * vive voix. Le hash seul est écrit en base.
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation();
    requirePermission(ctx, 'GERER_EMPLOYES');

    const body = await request.json().catch(() => null);
    const parsed = resetEmployeeCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Le mot de passe doit comporter exactement 6 chiffres.',
        parsed.error.flatten()
      );
    }

    const user = await resetEmployeeCode(ctx.businessId, id, parsed.data.pin);

    // Le code lui-même ne va pas au journal — seulement le fait qu'il a changé,
    // par qui et quand.
    await auditable(ctx, { action: 'USER_CODE_RESET', entite: 'User', entiteId: id });

    return ok({ user: serializeUser(user) });
  } catch (error) {
    return fail(error);
  }
}
