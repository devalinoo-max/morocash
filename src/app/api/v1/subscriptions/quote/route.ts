import { guardRead, requireRole } from '@/server/guards';
import { getRenewalQuote } from '@/server/modules/subscriptions/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/**
 * Devis de prolongation : prix et nouvelle date de fin de chaque durée, avant
 * paiement. Ouvert même abonnement expiré (guardRead), comme le paiement.
 */
export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER']);

    const planCode = new URL(request.url).searchParams.get('planCode');
    if (planCode !== 'SOLO' && planCode !== 'BUSINESS') {
      throw new AppError('VALIDATION_ERROR', 'Paramètre "planCode" invalide.');
    }

    const quote = await getRenewalQuote(ctx.business, planCode);
    return ok({ quote });
  } catch (error) {
    return fail(error);
  }
}
