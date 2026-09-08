import { guardRead, guardMutation, auditable } from '@/server/guards';
import { createEmployee, createEmployeeSchema, listEmployees } from '@/server/modules/users/service';
import { serializeUserList, serializeUser } from '@/server/serializers/user';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Lecture ouverte à tout rôle connecté (liste d'équipe non sensible en soi,
// contrairement aux coûts/marges) — seule la création est réservée OWNER.
export async function GET() {
  try {
    const ctx = await guardRead();
    const users = await listEmployees(ctx.businessId);
    return ok({ users: serializeUserList(users) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER'] });

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
