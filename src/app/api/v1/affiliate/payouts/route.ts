import { affiliatePayoutSchema, getAffiliateDashboard, requestAffiliatePayout } from '@/server/modules/affiliation/service';
import { requireAffiliate } from '@/server/modules/affiliation/session';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/**
 * Demande de retrait de tout le solde, vers l'opérateur et le numéro choisis.
 * Le montant n'est jamais lu dans la requête : le serveur le calcule.
 */
export async function POST(request: Request) {
  try {
    const affiliate = await requireAffiliate();
    const body = await request.json().catch(() => null);
    const parsed = affiliatePayoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Choisis un opérateur et un numéro valide.', parsed.error.flatten());
    }
    const payout = await requestAffiliatePayout(affiliate.id, parsed.data);
    return ok({ payout, affiliate: await getAffiliateDashboard(affiliate) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
