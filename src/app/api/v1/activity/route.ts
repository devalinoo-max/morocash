import { guardRead } from '@/server/guards';
import { getActivity, type ActivityType } from '@/server/modules/payments/versements';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

const TYPES: ActivityType[] = ['all', 'orders', 'payments'];

/**
 * Liste du jour ou de la période : versements reçus, total vendu, compteurs.
 * `from` et `to` sont des instants complets envoyés par l'appareil : « le
 * jour » est celui du commerçant, pas celui du fuseau du serveur.
 */
export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    const url = new URL(request.url);
    const from = new Date(url.searchParams.get('from') ?? '');
    const to = new Date(url.searchParams.get('to') ?? '');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new AppError('VALIDATION_ERROR', 'Période invalide.');
    }
    const typeParam = url.searchParams.get('type') as ActivityType | null;
    const type = typeParam && TYPES.includes(typeParam) ? typeParam : 'all';

    return ok(await getActivity(ctx.businessId, from, to, type));
  } catch (error) {
    return fail(error);
  }
}
