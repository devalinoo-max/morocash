import { z } from 'zod';
import { guardMutation, auditable } from '@/server/guards';
import { reorderImages } from '@/server/modules/products/images';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const reorderSchema = z.object({ orderedIds: z.array(z.string().cuid()).min(1) });

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    await reorderImages(ctx.businessId, id, parsed.data.orderedIds);

    await auditable(ctx, { action: 'PRODUCT_IMAGES_REORDERED', entite: 'Product', entiteId: id });

    return ok({ reordered: true });
  } catch (error) {
    return fail(error);
  }
}
