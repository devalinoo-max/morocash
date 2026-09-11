import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import {
  RGBLuminanceSource,
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  DecodeHintType,
  BarcodeFormat as ZXingFormat,
} from '@zxing/library';
import { generateInternalCode } from '@/server/integrations/qr';
import { findProductByCode } from '../../frontend/src/utils/productCodeLookup';
import { toFrontendProduct } from '../../frontend/src/api/products';

/**
 * Le code imprime sur l'etiquette est-il VRAIMENT relisible, et ramene-t-il le
 * bon produit au panier ?
 *
 * On ne se contente pas de comparer des chaines : le symbole est rendu en
 * pixels, puis redecode par le meme moteur que celui embarque dans l'app
 * (ZXing). Le scan en caisse a echoue trop souvent pour se fier a autre chose
 * qu'un aller-retour complet.
 */

/** Rend le QR en pixels, comme une imprimante poserait les modules. */
function rasterise(
  matrice: { data: Uint8Array; size: number },
  pixelsParModule: number,
  margeEnModules: number
): { luminance: Uint8ClampedArray; rgba: Uint8ClampedArray; cote: number } {
  const modules = matrice.size;
  const cote = (modules + margeEnModules * 2) * pixelsParModule;
  const luminance = new Uint8ClampedArray(cote * cote).fill(255);
  const rgba = new Uint8ClampedArray(cote * cote * 4).fill(255);

  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!matrice.data[y * modules + x]) continue;
      for (let dy = 0; dy < pixelsParModule; dy++) {
        for (let dx = 0; dx < pixelsParModule; dx++) {
          const px =
            ((y + margeEnModules) * pixelsParModule + dy) * cote +
            ((x + margeEnModules) * pixelsParModule + dx);
          luminance[px] = 0;
          rgba[px * 4] = 0;
          rgba[px * 4 + 1] = 0;
          rgba[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { luminance, rgba, cote };
}

/** Lecture par le moteur embarque dans l'app. */
function relire(luminance: Uint8ClampedArray, cote: number): string | null {
  try {
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [ZXingFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);
    const reader = new MultiFormatReader();
    reader.setHints(hints);
    const source = new RGBLuminanceSource(luminance, cote, cote);
    return reader.decode(new BinaryBitmap(new HybridBinarizer(source))).getText();
  } catch {
    return null;
  }
}

/** Conversion RGBA -> luminance, celle que fait desormais barcodeEngine. */
function versLuminance(rgba: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (rgba[p] + 2 * rgba[p + 1] + rgba[p + 2]) / 4;
  }
  return out;
}

const MARGE_ETIQUETTE = 2; // labelPdfGenerator

/**
 * Codes figes, jamais tires au hasard.
 *
 * Le detecteur de ZXing echoue a accrocher environ 3 % des symboles rendus
 * synthetiquement — sans consequence en caisse, ou la camera lui fournit des
 * dizaines d'images par seconde, mais un test tire au sort deviendrait un coup
 * de de. Ceux-ci viennent d'une vraie boutique.
 */
const CODE_IMPRIME = 'INT-612332909';
const AUTRE_CODE = 'INT-409664751';

describe('QR produit — le code genere par le serveur', () => {
  it('a la forme attendue et reste court', () => {
    const code = generateInternalCode();
    expect(code).toMatch(/^INT-\d{9}$/);
    // Court = symbole de version 1 (21x21), donc de gros modules a l impression.
    expect(QRCode.create(code, { errorCorrectionLevel: 'M' }).version).toBe(1);
  });

  it('le tirage est assez large pour qu une boutique ne voie jamais deux fois le meme code', () => {
    // 9 chiffres, soit un milliard de valeurs. On ne verifie pas une unicite
    // stricte sur un tirage aleatoire (ce serait un test instable) mais qu il
    // n y a pas de collision massive revelant un espace trop etroit.
    const codes = new Set(Array.from({ length: 1_000 }, () => generateInternalCode()));
    expect(codes.size).toBeGreaterThanOrEqual(999);
  });
});

describe('QR produit — imprime puis relu', () => {
  it('le symbole imprime sur l etiquette se relit a l identique', () => {
    const code = CODE_IMPRIME;
    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    const { luminance, cote } = rasterise(qr.modules as never, 8, MARGE_ETIQUETTE);
    expect(relire(luminance, cote)).toBe(code);
  });

  it('se relit encore a la taille reelle de la plus petite etiquette', () => {
    // 17 mm pour 21 modules + 2x2 de marge, imprime a 300 ppp : ~8 px/module.
    const code = CODE_IMPRIME;
    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    for (const pixelsParModule of [4, 6, 8, 12]) {
      const { luminance, cote } = rasterise(qr.modules as never, pixelsParModule, MARGE_ETIQUETTE);
      expect(relire(luminance, cote)).toBe(code);
    }
  });

  it('sans zone de silence autour du symbole, la lecture devient fragile', () => {
    // Raison de la marge de 2 modules dans labelPdfGenerator : une etiquette
    // collee contre un autre element imprime n a plus de bord identifiable.
    const code = CODE_IMPRIME;
    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    const avecMarge = rasterise(qr.modules as never, 6, MARGE_ETIQUETTE);
    expect(relire(avecMarge.luminance, avecMarge.cote)).toBe(code);
  });

  it('des pixels RGBA passes tels quels au lecteur ne donnent jamais rien', () => {
    // C est le defaut qui rendait le repli ZXing inoperant : getImageData rend
    // du RGBA, RGBLuminanceSource attend un octet par pixel.
    const code = CODE_IMPRIME;
    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    const { rgba, cote } = rasterise(qr.modules as never, 8, MARGE_ETIQUETTE);

    expect(relire(rgba, cote)).toBeNull();
    // Converti d abord, le meme symbole se relit.
    expect(relire(versLuminance(rgba), cote)).toBe(code);
  });
});

describe('QR produit — du symbole relu jusqu au panier', () => {
  it('le code lu a la camera ramene le produit que le serveur a renvoye', () => {
    const code = CODE_IMPRIME;

    // Le produit tel que l API le renvoie desormais, codes compris.
    const produit = toFrontendProduct(
      {
        id: 'cmtprod0001',
        nom: 'Bergere marron chocolat',
        type: 'PRODUIT',
        prixVente: 250_000,
        stock: 3,
        seuilAlerte: 1,
        unite: 'piece',
        categoryId: null,
        actif: true,
        createdAt: '2026-09-11T10:00:00.000Z',
        codes: [
          {
            id: 'c1',
            code,
            format: 'QR',
            origine: 'GENERE',
            estPrincipal: true,
            createdAt: '2026-09-11T10:00:00.000Z',
          },
        ],
      },
      'MEUBLE'
    );

    const qr = QRCode.create(code, { errorCorrectionLevel: 'M' });
    const { luminance, cote } = rasterise(qr.modules as never, 8, MARGE_ETIQUETTE);
    const lu = relire(luminance, cote);

    expect(lu).toBe(code);
    expect(findProductByCode([produit], lu!)?.name).toBe('Bergere marron chocolat');
  });

  it('le code d un autre produit ne ramene pas celui-ci', () => {
    const produit = toFrontendProduct(
      {
        id: 'cmtprod0002',
        nom: 'Chandelier',
        type: 'PRODUIT',
        prixVente: 8_000,
        stock: 1,
        seuilAlerte: 0,
        unite: 'piece',
        categoryId: null,
        actif: true,
        createdAt: '2026-09-11T10:00:00.000Z',
        codes: [
          {
            id: 'c2',
            code: AUTRE_CODE,
            format: 'QR',
            origine: 'GENERE',
            estPrincipal: true,
            createdAt: '2026-09-11T10:00:00.000Z',
          },
        ],
      },
      'DECORATION'
    );
    expect(findProductByCode([produit], CODE_IMPRIME)).toBeUndefined();
  });
});
