import { getAffiliateDashboard } from '@/server/modules/affiliation/service';
import { requireAffiliate } from '@/server/modules/affiliation/session';
import { ok, fail } from '@/server/shared/response';

/** Espace affilié : lien, compteurs, solde et activité récente. */
export async function GET() {
  try {
    const affiliate = await requireAffiliate();
    return ok({ affiliate: await getAffiliateDashboard(affiliate) });
  } catch (error) {
    return fail(error);
  }
}
