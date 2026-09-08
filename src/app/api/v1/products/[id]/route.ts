import { guardMutation, auditable } from '@/server/guards';
import { updateProduct, updateProductSchema, deleteProduct } from '@/server/modules/products/service';
import { serializeProductList } from '@/server/serializers/product';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = updateProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const before = await updateProduct(ctx.businessId, id, parsed.data);

    await auditable(ctx, {
      action: 'PRODUCT_UPDATED',
      entite: 'Product',
      entiteId: id,
      nouvellesValeurs: parsed.data,
    });

    return ok({ product: before ? serializeProductList([before], ctx.role)[0] : null });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    await deleteProduct(ctx.businessId, id);

    await auditable(ctx, { action: 'PRODUCT_DELETED', entite: 'Product', entiteId: id });

    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
