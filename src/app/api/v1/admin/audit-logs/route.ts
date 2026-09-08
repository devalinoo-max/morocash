import { requireAdminSession } from '@/server/guards/admin';
import { listAuditLogs } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const businessId = url.searchParams.get('businessId') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const logs = await listAuditLogs({
      businessId,
      cursor,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return ok({ logs });
  } catch (error) {
    return fail(error);
  }
}
