import { guardRead } from '@/server/guards';
import { pullSince } from '@/server/modules/sync/pull';
import { serializeProductList } from '@/server/serializers/product';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';
import type { UserRole } from '@prisma/client';

// Filtrage par rôle avant la réponse (spec §10) : un SELLER ne reçoit jamais de
// coût (prixAchat/cmp/coutUnitaire) ni de dépense, y compris dans le delta de
// synchronisation.
function filterForRole<
  T extends {
    products: Parameters<typeof serializeProductList>[0];
    expenses: unknown[];
    stockMovements: { coutUnitaire: number }[];
    orders: { coutTotal: number; items: { coutUnitaire: number }[] }[];
  },
>(data: T, role: UserRole) {
  if (role !== 'SELLER') return data;

  return {
    ...data,
    products: serializeProductList(data.products, role),
    expenses: [],
    stockMovements: data.stockMovements.map(({ coutUnitaire: _coutUnitaire, ...rest }) => rest),
    orders: data.orders.map(({ coutTotal: _coutTotal, items, ...rest }) => ({
      ...rest,
      items: items.map(({ coutUnitaire: _itemCout, ...itemRest }) => itemRest),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();

    const url = new URL(request.url);
    const sinceParam = url.searchParams.get('since');
    if (!sinceParam) {
      throw new AppError('VALIDATION_ERROR', 'Paramètre "since" requis.');
    }
    const since = new Date(sinceParam);
    if (Number.isNaN(since.getTime())) {
      throw new AppError('VALIDATION_ERROR', 'Paramètre "since" invalide.');
    }

    const data = await pullSince(ctx.businessId, since);
    return ok(filterForRole(data, ctx.role));
  } catch (error) {
    return fail(error);
  }
}
