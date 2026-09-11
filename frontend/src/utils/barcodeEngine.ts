import QRCode from 'qrcode';
import {
  BrowserMultiFormatReader,
  BarcodeFormat as ZXingBarcodeFormat,
  DecodeHintType,
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
} from '@zxing/library';
import { BarcodeFormat, ProductCode, CodeOrigin } from '../types';

/**
 * Generates an internal store code: MC-{shopCode}-{000001}
 */
export function generateInternalCode(shopCode: string, sequenceNumber: number): string {
  const cleanShopCode = (shopCode || 'MK01X').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5).padEnd(5, 'X');
  const seqStr = String(sequenceNumber).padStart(6, '0');
  return `MC-${cleanShopCode}-${seqStr}`;
}

/**
 * Generate QR Code as DataURL with Error Correction Level M (contains only raw code)
 */
export async function generateProductQRCodeDataUrl(code: string, size = 160): Promise<string> {
  try {
    return await QRCode.toDataURL(code, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: {
        dark: '#0f172a', // Slate 900
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Error generating QR Code DataURL:', err);
    return '';
  }
}

/**
 * Render QR Code onto an existing HTMLCanvasElement
 */
export async function renderQRCodeToCanvas(code: string, canvas: HTMLCanvasElement, size = 160): Promise<void> {
  try {
    await QRCode.toCanvas(canvas, code, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Error rendering QR Code to Canvas:', err);
  }
}

/**
 * Download high-resolution PNG image with QR, product name, price, and code
 */
export async function downloadQRCodeImage(
  productName: string,
  code: string,
  priceFormatted: string,
  shopName: string
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 460;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border & Header
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(shopName || 'MoroCash', 200, 34);

  ctx.fillStyle = '#64748b';
  ctx.font = '12px sans-serif';
  ctx.fillText('Étiquette produit', 200, 52);

  // Generate QR code onto an offscreen canvas
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, code, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  // Draw QR centered
  ctx.drawImage(qrCanvas, 80, 70, 240, 240);

  // Product Name (clamped to 2 lines)
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 17px sans-serif';
  const words = productName.split(' ');
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if ((line1 + ' ' + w).length < 24) {
      line1 = (line1 + ' ' + w).trim();
    } else if ((line2 + ' ' + w).length < 24) {
      line2 = (line2 + ' ' + w).trim();
    }
  }
  ctx.fillText(line1 || productName.slice(0, 24), 200, 340);
  if (line2) {
    ctx.fillText(line2, 200, 362);
  }

  // Price
  ctx.fillStyle = '#4f46e5';
  ctx.font = 'black 22px sans-serif';
  ctx.fillText(priceFormatted, 200, line2 ? 395 : 385);

  // Raw Code text
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(code, 200, line2 ? 425 : 415);

  // Trigger download
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `QR_${productName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}_${code}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Calculate and verify check digit for standard numerical barcodes
 */
export function validateBarcodeChecksum(code: string): {
  format: BarcodeFormat;
  isValidLength: boolean;
  isValidChecksum: boolean | null;
  warningMessage?: string;
} {
  const clean = code.trim();

  // Internal code
  if (clean.startsWith('MC-')) {
    return {
      format: 'INTERNE',
      isValidLength: true,
      isValidChecksum: true,
    };
  }

  const isNumeric = /^\d+$/.test(clean);

  // EAN-8
  if (isNumeric && clean.length === 8) {
    const digits = clean.split('').map(Number);
    const check = digits[7];
    let sum = 0;
    for (let i = 0; i < 7; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    const expected = (10 - (sum % 10)) % 10;
    const isValid = check === expected;
    return {
      format: 'EAN8',
      isValidLength: true,
      isValidChecksum: isValid,
      warningMessage: isValid ? undefined : 'Ce code EAN-8 semble mal recopié (clé de contrôle incorrecte). Tu veux quand même l’enregistrer ?',
    };
  }

  // UPC-A
  if (isNumeric && clean.length === 12) {
    const digits = clean.split('').map(Number);
    const check = digits[11];
    let sum = 0;
    for (let i = 0; i < 11; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    const expected = (10 - (sum % 10)) % 10;
    const isValid = check === expected;
    return {
      format: 'UPCA',
      isValidLength: true,
      isValidChecksum: isValid,
      warningMessage: isValid ? undefined : 'Ce code UPC-A semble mal recopié (clé de contrôle incorrecte). Tu veux quand même l’enregistrer ?',
    };
  }

  // EAN-13
  if (isNumeric && clean.length === 13) {
    const digits = clean.split('').map(Number);
    const check = digits[12];
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += digits[i] * (i % 2 === 0 ? 1 : 3);
    }
    const expected = (10 - (sum % 10)) % 10;
    const isValid = check === expected;
    return {
      format: 'EAN13',
      isValidLength: true,
      isValidChecksum: isValid,
      warningMessage: isValid ? undefined : 'Ce code EAN-13 semble mal recopié (clé de contrôle incorrecte). Tu veux quand même l’enregistrer ?',
    };
  }

  // ITF-14
  if (isNumeric && clean.length === 14) {
    const digits = clean.split('').map(Number);
    const check = digits[13];
    let sum = 0;
    for (let i = 0; i < 13; i++) {
      sum += digits[i] * (i % 2 === 0 ? 3 : 1);
    }
    const expected = (10 - (sum % 10)) % 10;
    const isValid = check === expected;
    return {
      format: 'ITF14',
      isValidLength: true,
      isValidChecksum: isValid,
      warningMessage: isValid ? undefined : 'Ce code ITF-14 semble mal recopié. Tu veux quand même l’enregistrer ?',
    };
  }

  // UPC-E (often 6 to 8 digits)
  if (isNumeric && clean.length === 6) {
    return {
      format: 'UPCE',
      isValidLength: true,
      isValidChecksum: true,
    };
  }

  // Alphanumeric standard formats
  if (/^[A-Za-z0-9\-.$/+% ]+$/.test(clean)) {
    return {
      format: clean.length <= 15 ? 'CODE39' : 'CODE128',
      isValidLength: true,
      isValidChecksum: true,
    };
  }

  // Default to CODE128
  return {
    format: 'CODE128',
    isValidLength: true,
    isValidChecksum: true,
  };
}

/**
 * Play scan success feedback: 50ms vibration + audio beep
 */
export function playScanSuccessBeep(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    }
  } catch {
    // Web audio might be restricted without user interaction
  }

  // Short 50ms vibration as requested
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(50);
    } catch {
      // Ignored
    }
  }
}

/**
 * Convert ZXing or BarcodeDetector format to our BarcodeFormat
 */
export function mapFormatStringToBarcodeFormat(rawFormat: string): BarcodeFormat {
  const f = (rawFormat || '').toUpperCase().replace(/[-_]/g, '');
  if (f.includes('EAN13')) return 'EAN13';
  if (f.includes('EAN8')) return 'EAN8';
  if (f.includes('UPCA')) return 'UPCA';
  if (f.includes('UPCE')) return 'UPCE';
  if (f.includes('CODE128')) return 'CODE128';
  if (f.includes('CODE39')) return 'CODE39';
  if (f.includes('ITF')) return 'ITF14';
  if (f.includes('QR')) return 'QR';
  if (f.includes('DATAMATRIX')) return 'DATAMATRIX';
  return 'CODE128';
}

/**
 * RGBA (4 octets par pixel, ce que rend getImageData) -> luminance (1 octet).
 *
 * RGBLuminanceSource n'accepte de l'ARGB que sous forme d'Int32Array ; un
 * Uint8ClampedArray est pris tel quel, UN OCTET PAR PIXEL. Lui passer les
 * pixels RGBA bruts, comme on le faisait, revenait a lui donner une image
 * quatre fois trop longue et pleine de canaux alpha : le repli ZXing ne
 * decodait jamais rien, meme sur un code parfaitement net.
 */
function toLuminance(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const luminances = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < luminances.length; i++, p += 4) {
    // Moyenne favorisant le vert, comme ZXing le fait pour l'ARGB.
    luminances[i] = (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) / 4;
  }
  return luminances;
}

/**
 * Decode barcode from image element using native BarcodeDetector if available,
 * with MultiFormat ZXing reader fallback.
 */
async function tryDecodeImage(canvas: HTMLCanvasElement): Promise<{ code: string; format: BarcodeFormat } | null> {
  // 1. Try native BarcodeDetector if supported
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const BarcodeDetectorClass = (window as unknown as { BarcodeDetector: any }).BarcodeDetector;
      const detector = new BarcodeDetectorClass({
        formats: [
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'code_128',
          'code_39',
          'itf',
          'qr_code',
          'data_matrix',
        ],
      });
      const detected = await detector.detect(canvas);
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return {
          code: detected[0].rawValue.trim(),
          format: mapFormatStringToBarcodeFormat(detected[0].format),
        };
      }
    } catch {
      // Fall through to ZXing
    }
  }

  // 2. ZXing fallback
  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      ZXingBarcodeFormat.EAN_13,
      ZXingBarcodeFormat.EAN_8,
      ZXingBarcodeFormat.UPC_A,
      ZXingBarcodeFormat.UPC_E,
      ZXingBarcodeFormat.CODE_128,
      ZXingBarcodeFormat.CODE_39,
      ZXingBarcodeFormat.ITF,
      ZXingBarcodeFormat.QR_CODE,
      ZXingBarcodeFormat.DATA_MATRIX,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const luminanceSource = new RGBLuminanceSource(
      toLuminance(imgData.data),
      canvas.width,
      canvas.height
    );
    const binaryBitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    const result = reader.decode(binaryBitmap);

    if (result && result.getText()) {
      return {
        code: result.getText().trim(),
        format: mapFormatStringToBarcodeFormat(result.getBarcodeFormat().toString()),
      };
    }
  } catch {
    // Decoding attempt failed on this pass
  }

  return null;
}

/**
 * Lit UNE image de la camera en direct.
 *
 * Le scan en caisse n'essayait que `BarcodeDetector`, l'API native du
 * navigateur. Elle n'existe ni sur iPhone (Safari ne l'implemente pas), ni sur
 * les navigateurs de bureau, ni dans beaucoup de WebView Android : la camera
 * s'ouvrait, le commercant promenait son etiquette devant, et RIEN ne se
 * passait — sans le moindre message. Ce chemin-ci retombe sur ZXing, deja
 * present dans l'app et utilise pour les photos.
 *
 * Le canvas est fourni par l'appelant et reutilise d'une image a l'autre : en
 * creer un par image sature la memoire d'un telephone d'entree de gamme.
 */
export async function decodeFromVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<{ code: string; format: BarcodeFormat } | null> {
  const largeur = video.videoWidth;
  const hauteur = video.videoHeight;
  if (!largeur || !hauteur) return null;

  // On travaille sur une image reduite : ZXing y est nettement plus rapide, et
  // un QR de 20 mm reste largement lisible a cette resolution.
  const echelle = Math.min(1, 960 / largeur);
  canvas.width = Math.round(largeur * echelle);
  canvas.height = Math.round(hauteur * echelle);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return tryDecodeImage(canvas);
}

/**
 * Image Pre-processing pipeline for static photos:
 * - Pass 1: Full image
 * - Pass 2: Center crop (80% box)
 * - Pass 3: High contrast & grayscale
 * - Pass 4: Zoomed horizontal center strip (where barcodes usually sit)
 */
export async function decodeBarcodeFromPhotoBlob(blob: Blob): Promise<{ code: string; format: BarcodeFormat } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);

    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        // Base canvas for drawing
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(width, 1600);
        canvas.height = Math.round((canvas.width / width) * height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        // --- Pass 1: Original scaled image ---
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let res = await tryDecodeImage(canvas);
        if (res) {
          resolve(res);
          return;
        }

        // --- Pass 2: Grayscale + Enhanced Contrast ---
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          // luminance
          const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          // contrast stretch (factor 1.5)
          const contrast = Math.min(255, Math.max(0, (gray - 128) * 1.5 + 128));
          d[i] = contrast;
          d[i + 1] = contrast;
          d[i + 2] = contrast;
        }
        ctx.putImageData(imgData, 0, 0);
        res = await tryDecodeImage(canvas);
        if (res) {
          resolve(res);
          return;
        }

        // --- Pass 3: Center crop (70% width, 50% height) ---
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.round(canvas.width * 0.7);
        cropCanvas.height = Math.round(canvas.height * 0.5);
        const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
        if (cropCtx) {
          cropCtx.drawImage(
            canvas,
            Math.round(canvas.width * 0.15),
            Math.round(canvas.height * 0.25),
            cropCanvas.width,
            cropCanvas.height,
            0,
            0,
            cropCanvas.width,
            cropCanvas.height
          );
          res = await tryDecodeImage(cropCanvas);
          if (res) {
            resolve(res);
            return;
          }
        }

        // --- Pass 4: Thresholding / Binarization attempt ---
        if (cropCtx) {
          const cropData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
          const cd = cropData.data;
          for (let i = 0; i < cd.length; i += 4) {
            const val = cd[i] < 128 ? 0 : 255;
            cd[i] = val;
            cd[i + 1] = val;
            cd[i + 2] = val;
          }
          cropCtx.putImageData(cropData, 0, 0);
          res = await tryDecodeImage(cropCanvas);
          if (res) {
            resolve(res);
            return;
          }
        }

        resolve(null);
      } catch (err) {
        console.error('Photo barcode decoding error:', err);
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
