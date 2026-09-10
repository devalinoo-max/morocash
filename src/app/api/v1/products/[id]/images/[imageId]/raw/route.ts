import { guardRead } from '@/server/guards';
import { getImageBinary } from '@/server/modules/products/images';
import { fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string; imageId: string }>;
}

/**
 * Sert le binaire d'une photo produit stockée en base (cas où CLOUDINARY_*
 * n'est pas configuré : l'image est conservée en data URL). Permet au frontend
 * d'afficher <img src="/api/v1/products/:id/images/:imageId/raw"> sans
 * transporter le base64 dans chaque réponse JSON de la liste produits.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { imageId } = await params;
    const ctx = await guardRead();

    const binary = await getImageBinary(ctx.businessId, imageId);

    return new Response(binary.bytes as BodyInit, {
      headers: {
        'Content-Type': binary.contentType,
        'Content-Length': String(binary.bytes.byteLength),
        // Le contenu d'une image ne change jamais : une nouvelle photo = une
        // nouvelle ligne ProductImage, donc une nouvelle URL.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
