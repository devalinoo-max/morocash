import { getAffiliateProgram } from '@/server/modules/affiliation/service';
import { ok, fail } from '@/server/shared/response';

/** Page publique /affiliation : commissions, seuil de retrait, avantage des inscrits. Lu à chaque requête. */
export async function GET() {
  try {
    return ok(await getAffiliateProgram());
  } catch (error) {
    return fail(error);
  }
}
