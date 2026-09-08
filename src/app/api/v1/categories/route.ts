import { guardRead, guardMutation, auditable } from '@/server/guards';
import { createCategory, createCategorySchema, listCategories } from '@/server/modules/categories/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    const url = new URL(request.url);
    const typeParam = url.searchParams.get('type');
    const type = typeParam === 'PRODUIT' || typeParam === 'DEPENSE' ? typeParam : undefined;
    const categories = await listCategories(ctx.businessId, { type });
    return ok({ categories });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = createCategorySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const category = await createCategory(ctx.businessId, parsed.data);

    await auditable(ctx, { action: 'CATEGORY_CREATED', entite: 'Category', entiteId: category.id });

    return ok({ category }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
