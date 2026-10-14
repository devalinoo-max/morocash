import { z } from 'zod';
import { scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { uploadProductImage, deleteProductImage } from '@/server/integrations/cloudinary';

// Une photo encodée, et rien d'autre : la chaîne part telle quelle chez
// Cloudinary, qui accepte aussi une adresse web ou un chemin de fichier — et,
// sans Cloudinary, elle est enregistrée en base. ~6 Mo encodés au plus.
const IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp|gif|heic|heif|avif);base64,[A-Za-z0-9+/=\s]+$/;
const MAX_IMAGE_DATA_URL_LENGTH = 6_000_000;

export const addImageSchema = z.object({
  dataUrl: z
    .string()
    .min(1)
    .max(MAX_IMAGE_DATA_URL_LENGTH, 'Photo trop lourde.')
    .regex(IMAGE_DATA_URL, 'Format de photo non pris en charge.'),
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
  if (!image) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }

  return image;
}

/**
 * Décode une image stockée en data URL (repli quand CLOUDINARY_* n'est pas
 * configuré) pour la servir en binaire. Une image déjà hébergée sur Cloudinary
 * n'a pas à passer par ici : le frontend reçoit directement son URL https.
 */
export async function getImageBinary(businessId: string, imageId: string) {
  const repo = scoped(businessId);
  const image = await repo.productImages.findById(imageId);
  if (!image) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Image introuvable.');
  }

  const separator = image.url.indexOf(',');
  const header = separator === -1 ? '' : image.url.slice(0, separator);
  if (!header.startsWith('data:') || !header.endsWith(';base64')) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Image introuvable.');
  }

  return {
    contentType: header.slice('data:'.length, header.length - ';base64'.length),
    bytes: Buffer.from(image.url.slice(separator + 1), 'base64'),
  };
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
