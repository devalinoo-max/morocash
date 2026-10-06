import { requireAdminSession } from '@/server/guards/admin';
import { auditAdminAction } from '@/server/modules/admin/service';
import {
  affiliateSettingsSchema,
  getAffiliationSettings,
  updateAffiliationSettings,
} from '@/server/modules/admin/affiliation';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET() {
  try {
    await requireAdminSession();
    return ok({ settings: await getAffiliationSettings() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminSession();
    const body = await request.json().catch(() => null);
    const parsed = affiliateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Montants invalides : entiers en FCFA, positifs.', parsed.error.flatten());
    }

    const { avant, apres } = await updateAffiliationSettings(parsed.data);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      action: 'AFFILIATE_RATES_CHANGED',
      entite: 'AffiliateSettings',
      entiteId: 'default',
      nouvellesValeurs: { avant, apres },
    });
    return ok({ settings: await getAffiliationSettings() });
  } catch (error) {
    return fail(error);
  }
}
