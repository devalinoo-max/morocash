import { v2 as cloudinary } from 'cloudinary';

let configured = false;

/**
 * Identifiants Cloudinary : CLOUDINARY_URL (cloudinary://clé:secret@cloud, le
 * format donné tel quel par la console) en priorité, sinon les trois variables
 * séparées. La console affiche le secret masqué (« ********** ») : le recopier
 * dans CLOUDINARY_API_SECRET donne un « api_secret mismatch », pas l'URL.
 */
function readCredentials(): { cloudName?: string; apiKey?: string; apiSecret?: string } {
  const url = process.env.CLOUDINARY_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'cloudinary:' && parsed.username && parsed.password && parsed.hostname) {
        return {
          cloudName: parsed.hostname,
          apiKey: decodeURIComponent(parsed.username),
          apiSecret: decodeURIComponent(parsed.password),
        };
      }
    } catch {
      // URL invalide : on retombe sur les variables séparées
    }
  }
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

function ensureConfigured(): boolean {
  const { cloudName, apiKey, apiSecret } = readCredentials();

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
