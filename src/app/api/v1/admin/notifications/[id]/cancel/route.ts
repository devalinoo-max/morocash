import { requireAdminSession } from '@/server/guards/admin';
import { auditAdminAction } from '@/server/modules/admin/service';
import { cancelScheduledBroadcast } from '@/server/modules/push/service';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();

    await cancelScheduledBroadcast(id);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      action: 'ADMIN_NOTIFICATION_CANCELLED',
      entite: 'PushBroadcast',
      entiteId: id,
    });

    return ok({ cancelled: true });
  } catch (error) {
    return fail(error);
  }
}
