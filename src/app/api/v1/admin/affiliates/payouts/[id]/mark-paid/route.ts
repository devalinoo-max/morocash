import { requireAdminSession } from '@/server/guards/admin';
import { markAffiliatePayoutPaid } from '@/server/modules/admin/affiliation';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** L'admin a versé le retrait en mobile money, hors de l'app. */
export async function POST(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();
    const payout = await markAffiliatePayoutPaid(id, admin.adminUserId);
    return ok({ payout });
  } catch (error) {
    return fail(error);
  }
}
