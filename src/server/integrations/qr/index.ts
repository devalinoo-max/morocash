import QRCode from 'qrcode';
import bwipjs from 'bwip-js/node';
import { randomInt } from 'crypto';
import type { CodeFormat } from '@prisma/client';

const BWIP_BCID: Partial<Record<CodeFormat, string>> = {
  EAN13: 'ean13',
  EAN8: 'ean8',
  UPCA: 'upca',
  UPCE: 'upce',
  CODE128: 'code128',
  CODE39: 'code39',
  ITF14: 'itf14',
  DATAMATRIX: 'datamatrix',
};

export async function generateQrPngBuffer(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, { type: 'png', margin: 1, width: 300 });
}

export async function generateBarcodePngBuffer(format: CodeFormat, code: string): Promise<Buffer> {
  if (format === 'QR') return generateQrPngBuffer(code);

  const bcid = BWIP_BCID[format];
  if (!bcid) {
    throw new Error(`Format de code non pris en charge pour la génération: ${format}`);
  }

  return new Promise<Buffer>((resolve, reject) => {
    bwipjs.toBuffer(
      { bcid, text: code, scale: 3, height: 10, includetext: true, textxalign: 'center' },
      (err: string | Error, png: Buffer) => (err ? reject(err instanceof Error ? err : new Error(err)) : resolve(png))
    );
  });
}

/** Code interne unique lisible pour un produit sans code fournisseur. */
export function generateInternalCode(): string {
  const random = randomInt(0, 1_000_000_000).toString().padStart(9, '0');
  return `INT-${random}`;
}
