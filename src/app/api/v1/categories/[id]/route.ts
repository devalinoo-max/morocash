import { guardMutation, auditable } from '@/server/guards';
import {
  deleteCategory,
  renameCategory,
  renameCategorySchema,
} from '@/server/modules/categories/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Renommer une catégorie : les produits suivent, rien n'est cassé. */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });
    const { id } = await context.params;

    const body = await request.json().catch(() => null);
    const parsed = renameCategorySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const category = await renameCategory(ctx.businessId, id, parsed.data.nom);

    await auditable(ctx, { action: 'CATEGORY_RENAMED', entite: 'Category', entiteId: id });

    return ok({ category });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Supprimer une catégorie. Refusé si elle est encore utilisée (le motif chiffré
 * revient dans l'erreur CATEGORY_IN_USE) ou si c'est une catégorie système.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });
    const { id } = await context.params;

    const result = await deleteCategory(ctx.businessId, id);

    await auditable(ctx, { action: 'CATEGORY_DELETED', entite: 'Category', entiteId: id });

    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
