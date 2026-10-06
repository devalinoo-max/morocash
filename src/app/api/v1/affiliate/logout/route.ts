import { endAffiliateSession } from '@/server/modules/affiliation/session';
import { ok, fail } from '@/server/shared/response';

export async function POST() {
  try {
    await endAffiliateSession();
    return ok({ loggedOut: true });
  } catch (error) {
    return fail(error);
  }
}
