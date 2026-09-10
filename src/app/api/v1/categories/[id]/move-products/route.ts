import { z } from 'zod';
import { guardMutation, auditable } from '@/server/guards';
import { moveCategoryProducts } from '@/server/modules/categories/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// `null` en destination est volontaire : « Sans catégorie » est une
// destination légitime, un produit sans catégorie se vend normalement.
const moveSchema = z.object({
  toCategoryId: z.string().cuid().nullable(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });
    const { id } = await context.params;

    const body = await request.json().catch(() => null);
    const parsed = moveSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await moveCategoryProducts(ctx.businessId, id, parsed.data.toCategoryId);

    await auditable(ctx, { action: 'CATEGORY_PRODUCTS_MOVED', entite: 'Category', entiteId: id });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
