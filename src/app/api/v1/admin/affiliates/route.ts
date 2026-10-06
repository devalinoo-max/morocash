import { requireAdminSession } from '@/server/guards/admin';
import { getAffiliatesOverview } from '@/server/modules/admin/affiliation';
import { ok, fail } from '@/server/shared/response';

export async function GET() {
  try {
    await requireAdminSession();
    return ok(await getAffiliatesOverview());
  } catch (error) {
    return fail(error);
  }
}
