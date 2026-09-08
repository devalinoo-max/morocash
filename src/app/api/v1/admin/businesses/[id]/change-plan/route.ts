import { requireAdminSession } from '@/server/guards/admin';
import { changePlan, changePlanSchema, auditAdminAction } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();

    const body = await request.json().catch(() => null);
    const parsed = changePlanSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const business = await changePlan(id, parsed.data);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      businessId: id,
      action: 'ADMIN_PLAN_CHANGED',
      entite: 'Business',
      entiteId: id,
      nouvellesValeurs: { planId: parsed.data.planId },
    });

    return ok({ business });
  } catch (error) {
    return fail(error);
  }
}
