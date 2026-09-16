import { guardRead } from '@/server/guards';
import { getSubscriptionOverview } from '@/server/modules/subscriptions/service';
import { ok, fail } from '@/server/shared/response';

/** Page « Mon abonnement » : formule en cours, dates et historique des paiements. */
export async function GET() {
  try {
    const ctx = await guardRead();
    const subscription = await getSubscriptionOverview(ctx.businessId);
    return ok({ subscription });
  } catch (error) {
    return fail(error);
  }
}
