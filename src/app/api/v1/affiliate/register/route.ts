import { affiliateRegisterSchema, getAffiliateDashboard, registerAffiliate } from '@/server/modules/affiliation/service';
import { startAffiliateSession } from '@/server/modules/affiliation/session';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/** Création d'un compte affilié : ouvre directement la session. */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = affiliateRegisterSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }
    const affiliate = await registerAffiliate(parsed.data);
    await startAffiliateSession(affiliate.id);
    return ok({ affiliate: await getAffiliateDashboard(affiliate) }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
