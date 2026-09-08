import { requireAdminSession } from '@/server/guards/admin';
import { listBusinessUsers } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    await requireAdminSession();
    const users = await listBusinessUsers(id);
    return ok({ users });
  } catch (error) {
    return fail(error);
  }
}
