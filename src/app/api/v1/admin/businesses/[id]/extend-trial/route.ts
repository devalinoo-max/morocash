import { requireAdminSession } from '@/server/guards/admin';
import { extendTrial, extendTrialSchema, auditAdminAction } from '@/server/modules/admin/service';
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
    const parsed = extendTrialSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const business = await extendTrial(id, parsed.data);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      businessId: id,
      action: 'ADMIN_TRIAL_EXTENDED',
      entite: 'Business',
      entiteId: id,
      nouvellesValeurs: { jours: parsed.data.jours, trialEndsAt: business.trialEndsAt },
    });

    return ok({ business });
  } catch (error) {
    return fail(error);
  }
}
