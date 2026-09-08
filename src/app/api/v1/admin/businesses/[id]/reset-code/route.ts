import { requireAdminSession } from '@/server/guards/admin';
import { resetUserCode, resetUserCodeSchema, auditAdminAction } from '@/server/modules/admin/service';
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
    const parsed = resetUserCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const user = await resetUserCode(id, parsed.data);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      businessId: id,
      action: 'ADMIN_USER_CODE_RESET',
      entite: 'User',
      entiteId: user.id,
    });

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
