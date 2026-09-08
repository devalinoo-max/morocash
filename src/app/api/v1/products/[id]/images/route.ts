import { guardMutation, auditable } from '@/server/guards';
import { addImage, addImageSchema, removeImage } from '@/server/modules/products/images';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = addImageSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const image = await addImage(ctx.businessId, id, parsed.data);

    await auditable(ctx, { action: 'PRODUCT_IMAGE_ADDED', entite: 'Product', entiteId: id });

    return ok({ image }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const url = new URL(request.url);
    const imageId = url.searchParams.get('imageId');
    if (!imageId) {
      throw new AppError('VALIDATION_ERROR', "Le paramètre imageId est requis.");
    }

    await removeImage(ctx.businessId, imageId);

    await auditable(ctx, { action: 'PRODUCT_IMAGE_REMOVED', entite: 'Product', entiteId: id });

    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
