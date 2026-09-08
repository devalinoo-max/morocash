import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function ensureConfigured(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return false;
  }
  if (!configured) {
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    configured = true;
  }
  return true;
}

export interface UploadedImage {
  url: string;
  publicId: string;
}

/**
 * Upload une image en base64 ou URL vers Cloudinary.
 * Si CLOUDINARY_* n'est pas configuré (identifiants réels non encore fournis),
 * on journalise et on renvoie null plutôt que de fabriquer une fausse URL.
 */
export async function uploadProductImage(
  dataUrlOrPath: string,
  folder: string
): Promise<UploadedImage | null> {
  if (!ensureConfigured()) {
    console.warn('[CLOUDINARY:DEV] Identifiants non configurés (.env) — upload ignoré.');
    return null;
  }

  const result = await cloudinary.uploader.upload(dataUrlOrPath, { folder });
  return { url: result.secure_url, publicId: result.public_id };
}

export async function deleteProductImage(publicId: string): Promise<void> {
  if (!ensureConfigured()) {
    console.warn(`[CLOUDINARY:DEV] Identifiants non configurés — suppression ignorée pour ${publicId}.`);
    return;
  }
  await cloudinary.uploader.destroy(publicId);
}
