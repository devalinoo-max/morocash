import { z } from 'zod';
import { scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { uploadProductImage, deleteProductImage } from '@/server/integrations/cloudinary';

export const addImageSchema = z.object({
  dataUrl: z.string().min(1),
  isPrincipale: z.boolean().default(false),
});

export async function addImage(
  businessId: string,
  productId: string,
  input: z.infer<typeof addImageSchema>
) {
  const repo = scoped(businessId);
  const existing = await repo.productImages.findByProduct(productId);
  if (existing === null) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }

  const uploaded = await uploadProductImage(input.dataUrl, `morocash/${businessId}/products`);

  const image = await repo.productImages.create(productId, {
    url: uploaded?.url ?? input.dataUrl,
    cloudinaryPublicId: uploaded?.publicId,
    ordre: existing.length,
    isPrincipale: input.isPrincipale || existing.length === 0,
  });

  return image;
}

export async function removeImage(businessId: string, imageId: string) {
  const repo = scoped(businessId);
  const image = await repo.productImages.delete(imageId);
  if (!image) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Image introuvable.');
  }
  if (image.cloudinaryPublicId) {
    await deleteProductImage(image.cloudinaryPublicId);
  }
}

export async function reorderImages(businessId: string, productId: string, orderedIds: string[]) {
  const repo = scoped(businessId);
  const ok = await repo.productImages.reorder(productId, orderedIds);
  if (!ok) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }
}
