/**
 * Image processing utility for Morocash
 * Handles compression, resizing (max 800px), WebP conversion (0.75, target < 100KB),
 * HEIC decoding, and client-side validation.
 */

export interface ProcessedImageResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  name: string;
}

export interface ImageProcessError {
  message: string;
  code: 'TOO_LARGE' | 'INVALID_TYPE' | 'CONVERSION_FAILED';
}

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 Mo
const TARGET_MAX_BYTES = 100 * 1024; // 100 Ko
const MAX_DIMENSION = 800; // 800px max on longest side

/**
 * Validates and processes an uploaded or pasted file
 */
export async function processImageFile(
  file: File | Blob,
  fileName = 'photo.jpg',
  onProgress?: (percent: number) => void
): Promise<ProcessedImageResult> {
  onProgress?.(10);

  // 1. Validation size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw {
      code: 'TOO_LARGE',
      message: 'Cette image est trop grosse. Prends-en une autre.',
    } as ImageProcessError;
  }

  // 2. Validation type
  const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(fileName);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(fileName);

  if (!isImage && !isPdf) {
    throw {
      code: 'INVALID_TYPE',
      message: "Ce fichier n'est pas une image.",
    } as ImageProcessError;
  }

  onProgress?.(25);

  let imageBlob: Blob = file;

  // 3. HEIC Conversion if needed
  const isHeic = file.type.includes('heic') || file.type.includes('heif') || /\.(heic|heif)$/i.test(fileName);
  if (isHeic) {
    try {
      const heic2any = (await import('heic2any')).default;
      const converted = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8,
      });
      imageBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch {
      console.warn('HEIC conversion fallback - using standard decoding');
    }
  }

  onProgress?.(45);

  // 4. PDF First Page conversion fallback
  if (isPdf) {
    // Render PDF placeholder / snapshot on canvas
    return createPdfThumbnail(file, fileName, onProgress);
  }

  // 5. Load Image into HTMLImageElement
  const dataUrl = await blobToDataUrl(imageBlob);
  const img = await loadImage(dataUrl);

  onProgress?.(65);

  // 6. Calculate scaled dimensions (max 800px on largest dimension)
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  // 7. Draw onto canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw {
      code: 'CONVERSION_FAILED',
      message: "L'image n'est pas partie. La photo reste sur ton téléphone, elle s'enverra toute seule après.",
    } as ImageProcessError;
  }

  // High quality smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  onProgress?.(80);

  // 8. Convert to WebP, quality 0.75, target < 100KB
  let quality = 0.75;
  let resultDataUrl = canvas.toDataURL('image/webp', quality);
  let sizeBytes = estimateDataUrlBytes(resultDataUrl);

  // If still above 100KB, optimize quality down to 0.5 or scale down
  if (sizeBytes > TARGET_MAX_BYTES) {
    quality = 0.6;
    resultDataUrl = canvas.toDataURL('image/webp', quality);
    sizeBytes = estimateDataUrlBytes(resultDataUrl);
  }

  if (sizeBytes > TARGET_MAX_BYTES && (width > 600 || height > 600)) {
    // scale to 600px
    const scale = 600 / Math.max(width, height);
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = Math.round(width * scale);
    smallCanvas.height = Math.round(height * scale);
    const smallCtx = smallCanvas.getContext('2d');
    if (smallCtx) {
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
      resultDataUrl = smallCanvas.toDataURL('image/webp', 0.65);
      sizeBytes = estimateDataUrlBytes(resultDataUrl);
      width = smallCanvas.width;
      height = smallCanvas.height;
    }
  }

  onProgress?.(100);

  return {
    dataUrl: resultDataUrl,
    sizeBytes,
    width,
    height,
    name: fileName.replace(/\.[^/.]+$/, '') + '.webp',
  };
}

/**
 * Creates a visual badge thumbnail for PDF documents
 */
async function createPdfThumbnail(
  file: File | Blob,
  fileName: string,
  onProgress?: (percent: number) => void
): Promise<ProcessedImageResult> {
  const canvas = document.createElement('canvas');
  canvas.width = 600;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw {
      code: 'CONVERSION_FAILED',
      message: "L'image n'est pas partie. La photo reste sur ton téléphone, elle s'enverra toute seule après.",
    } as ImageProcessError;
  }

  // Draw elegant clean document card representation
  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, 600, 600);

  // Document border
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 560, 560);

  // Red PDF banner
  ctx.fillStyle = '#EF4444';
  ctx.roundRect(180, 180, 240, 90, 16);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PDF', 300, 242);

  // File title
  ctx.fillStyle = '#1E293B';
  ctx.font = 'bold 24px sans-serif';
  const truncatedName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName;
  ctx.fillText(truncatedName, 300, 340);

  ctx.fillStyle = '#64748B';
  ctx.font = '18px sans-serif';
  ctx.fillText('Document importé', 300, 380);

  onProgress?.(100);

  const dataUrl = canvas.toDataURL('image/webp', 0.8);
  return {
    dataUrl,
    sizeBytes: estimateDataUrlBytes(dataUrl),
    width: 600,
    height: 600,
    name: fileName + '.webp',
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64Length = dataUrl.length - (dataUrl.indexOf(',') + 1);
  return Math.round((base64Length * 3) / 4);
}
