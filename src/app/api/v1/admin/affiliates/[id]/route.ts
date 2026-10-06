import { requireAdminSession } from '@/server/guards/admin';
import { getAffiliateDetail } from '@/server/modules/admin/affiliation';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    await requireAdminSession();
    return ok({ affiliate: await getAffiliateDetail(id) });
  } catch (error) {
    return fail(error);
  }
}
