import { requireAdminSession } from '@/server/guards/admin';
import { suspendBusiness, auditAdminAction } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();

    const business = await suspendBusiness(id);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      businessId: id,
      action: 'ADMIN_BUSINESS_SUSPENDED',
      entite: 'Business',
      entiteId: id,
    });

    return ok({ business });
  } catch (error) {
    return fail(error);
  }
}
