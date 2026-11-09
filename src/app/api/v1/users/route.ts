import { guardRead, guardMutation, auditable, requirePermission } from '@/server/guards';
import { createEmployee, createEmployeeSchema, listEmployees } from '@/server/modules/users/service';
import { serializeUserList, serializeUser } from '@/server/serializers/user';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Lire la liste demande le même droit que la gérer : elle porte les numéros de
// téléphone, les rôles et les droits cochés de chaque collègue. Un vendeur n'a
// pas à savoir qui, dans la boutique, a le droit de voir le prix d'achat.
// Cacher le volet dans l'application ne suffit pas : l'appel direct doit être
// refusé aussi.
export async function GET() {
  try {
    const ctx = await guardRead();
    requirePermission(ctx, 'GERER_EMPLOYES');
    const users = await listEmployees(ctx.businessId);
    return ok({ users: serializeUserList(users) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    // « Gérer les employés » : coché d'office pour le propriétaire, accordable
    // à un gestionnaire. Le rôle seul ne suffit plus à décider.
    const ctx = await guardMutation();
    requirePermission(ctx, 'GERER_EMPLOYES');

    const body = await request.json().catch(() => null);
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const user = await createEmployee(ctx.businessId, parsed.data);
    await auditable(ctx, { action: 'USER_CREATED', entite: 'User', entiteId: user.id });

    return ok({ user: serializeUser(user) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
