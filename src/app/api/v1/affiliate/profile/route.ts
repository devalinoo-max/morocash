import { affiliateNameSchema, getAffiliateDashboard, updateAffiliateName } from '@/server/modules/affiliation/service';
import { requireAffiliate } from '@/server/modules/affiliation/session';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/** Prénom de l'affilié : demandé aux comptes créés avant que ce champ existe. */
export async function POST(request: Request) {
  try {
    const affiliate = await requireAffiliate();
    const body = await request.json().catch(() => null);
    const parsed = affiliateNameSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Indique ton prénom ou ton nom.', parsed.error.flatten());
    }
    const updated = await updateAffiliateName(affiliate.id, parsed.data);
    return ok({ affiliate: await getAffiliateDashboard(updated) });
  } catch (error) {
    return fail(error);
  }
}
