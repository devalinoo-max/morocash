import { affiliateLoginSchema, getAffiliateDashboard, loginAffiliate } from '@/server/modules/affiliation/service';
import { startAffiliateSession } from '@/server/modules/affiliation/session';
import { requestMeta } from '@/server/modules/auth/session';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = affiliateLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }
    const affiliate = await loginAffiliate(parsed.data, requestMeta(request).ip);
    await startAffiliateSession(affiliate.id);
    return ok({ affiliate: await getAffiliateDashboard(affiliate) });
  } catch (error) {
    return fail(error);
  }
}
