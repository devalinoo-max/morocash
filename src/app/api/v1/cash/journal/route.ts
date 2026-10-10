import { guardRead, hasPermission } from '@/server/guards';
import { getCashJournal } from '@/server/modules/cash/journal';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/**
 * Journal de la caisse sur une période : cartes, cumuls et soldes calculés par
 * le serveur. `from` et `to` sont des instants complets envoyés par l'appareil,
 * pour que « aujourd'hui » soit le jour du commerçant.
 *
 * Sans le droit de voir les dépenses, un employé ne reçoit ni les sorties ni
 * le solde qui permettrait de les déduire.
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

    return ok(
      await getCashJournal(
        { businessId: ctx.businessId, canSeeExits: hasPermission(ctx, 'VOIR_DEPENSES') },
        from,
        to
      )
    );
  } catch (error) {
    return fail(error);
  }
}
