import { requireAdminSession } from '@/server/guards/admin';
import { reactivateBusiness, auditAdminAction } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';
import { assertCsrf } from '@/server/middleware/csrf';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();
    await assertCsrf();

    const business = await reactivateBusiness(id);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      businessId: id,
      action: 'ADMIN_BUSINESS_REACTIVATED',
      entite: 'Business',
      entiteId: id,
    });

    return ok({ business });
  } catch (error) {
    return fail(error);
  }
}
