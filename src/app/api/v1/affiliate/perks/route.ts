import { getAffiliatePerks } from '@/server/repositories/affiliates';
import { BASE_TRIAL_DAYS } from '@/server/shared/subscription';
import { ok, fail } from '@/server/shared/response';

/** Avantage d'une inscription avec un code d'affiliation, affiché sous le champ du code. */
export async function GET() {
  try {
    const perks = await getAffiliatePerks();
    return ok({
      joursOfferts: perks.joursEssaiOfferts,
      joursEssaiTotal: BASE_TRIAL_DAYS + perks.joursEssaiOfferts,
      reductionPremierPaiement: perks.reductionPremierPaiement,
    });
  } catch (error) {
    return fail(error);
  }
}
