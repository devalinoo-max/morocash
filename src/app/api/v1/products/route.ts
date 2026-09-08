import { guardRead, guardMutation, auditable } from '@/server/guards';
import { createProduct, createProductSchema, listProducts } from '@/server/modules/products/service';
import { serializeProductList } from '@/server/serializers/product';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET() {
  try {
    const ctx = await guardRead();
    const products = await listProducts(ctx.businessId);
    return ok({ products: serializeProductList(products, ctx.role) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const product = await createProduct(ctx.businessId, parsed.data);

    await auditable(ctx, {
      action: 'PRODUCT_CREATED',
      entite: 'Product',
      entiteId: product.id,
      nouvellesValeurs: parsed.data,
    });

    return ok({ product: serializeProductList([product], ctx.role)[0] }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
