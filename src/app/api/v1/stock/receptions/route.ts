import { guardRead, guardMutation, requireRole, auditable } from '@/server/guards';
import { createReception, listReceptions, receptionSchema } from '@/server/modules/stock/movements';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Réservé OWNER/ACCOUNTANT en lecture comme en écriture — totalMontant est une
// donnée de coût d'achat (spec §0 règle 7), et la création l'est déjà.
export async function GET() {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);
    const receptions = await listReceptions(ctx.businessId);
    return ok({ receptions });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = receptionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await createReception(ctx.businessId, ctx.userId, parsed.data);

    if (result.status === 'CREATED') {
      await auditable(ctx, {
        action: 'STOCK_RECEPTION_CREATED',
        entite: 'StockReception',
        entiteId: result.reception.id,
      });
    }

    return ok({ status: result.status, reception: result.reception }, { status: result.status === 'CREATED' ? 201 : 200 });
  } catch (error) {
    return fail(error);
  }
}
