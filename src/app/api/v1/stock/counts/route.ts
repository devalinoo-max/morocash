import { guardRead, guardMutation, requireRole, auditable } from '@/server/guards';
import { createStockCount, listCounts, stockCountSchema } from '@/server/modules/stock/counts';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Comptages réservés OWNER/ACCOUNTANT en lecture comme en écriture — nbEcarts/
// ecartValeur sont des données financières (spec §0 règle 7), et la création
// l'est déjà (guardMutation ci-dessous).
export async function GET() {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);
    const counts = await listCounts(ctx.businessId);
    return ok({ counts });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = stockCountSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await createStockCount(ctx.businessId, ctx.userId, parsed.data);

    if (result.status === 'CREATED') {
      await auditable(ctx, {
        action: 'STOCK_COUNT_CREATED',
        entite: 'StockCount',
        entiteId: result.count.id,
      });
    }

    return ok({ status: result.status, count: result.count }, { status: result.status === 'CREATED' ? 201 : 200 });
  } catch (error) {
    return fail(error);
  }
}
