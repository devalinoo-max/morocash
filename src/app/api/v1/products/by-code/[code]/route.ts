import { guardRead } from '@/server/guards';
import { findProductByCode } from '@/server/modules/products/codes';
import { serializeProductList } from '@/server/serializers/product';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ code: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { code } = await params;
    const ctx = await guardRead();
    const product = await findProductByCode(ctx.businessId, decodeURIComponent(code));
    return ok({ product: product ? serializeProductList([product], ctx.role)[0] : null });
  } catch (error) {
    return fail(error);
  }
}
