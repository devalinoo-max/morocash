import { afterEach, beforeAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'crypto';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import type { CodeFormat } from '@prisma/client';
import { generateBarcodePngBuffer } from '@/server/integrations/qr';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct, listProducts } from '@/server/modules/products/service';
import {
  addCode,
  findProductByCode as findOnServer,
  listCodes,
  removeCode,
  setPrimaryCode,
} from '@/server/modules/products/codes';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { GET as verifyReceiptPage } from '@/app/api/v1/receipts/verify/[businessId]/[clientUuid]/route';
import {
  decodeImageData,
  decodeRgbaWithZXing,
  mapFormatStringToBarcodeFormat,
  normalizeReading,
  useWasmBinaryForTests,
  validateBarcodeChecksum,
} from '../../frontend/src/utils/barcodeEngine';
import {
  createScanGate,
  findProductByCode,
  looseCode,
  upcaToUpce,
  upceToUpca,
} from '../../frontend/src/utils/productCodeLookup';
import { createKeyboardScanBuffer, resolveKeyboardScan, type ScanKeyEvent } from '../../frontend/src/utils/hardwareScanner';
import { toFrontendProduct, codeFieldsFromApi } from '../../frontend/src/api/products';
import { receiptVerifyUrl } from '../../frontend/src/utils/receiptHelpers';
import type { Product, Sale } from '../../frontend/src/types';

/**
 * Tous les scans de l'application, du symbole imprimé jusqu'à ce qu'il ramène.
 *
 * Chaque code est FABRIQUÉ par le générateur du serveur (celui des étiquettes),
 * rendu en pixels, puis RELU par les moteurs embarqués dans l'app (zxing-cpp en
 * WebAssembly pour iPhone, ordinateur et photos ; ZXing JavaScript en repli). On vérifie ce que
 * la lecture renvoie — le texte et le format — puis le produit retrouvé.
 */

function pixelsDuPng(buffer: Buffer): { rgba: Uint8ClampedArray; width: number; height: number } {
  const png = PNG.sync.read(buffer);
  return { rgba: new Uint8ClampedArray(png.data), width: png.width, height: png.height };
}

/** Pose le symbole au milieu d'une image plus grande, comme sur une photo. */
function dansUnePhoto(
  src: { rgba: Uint8ClampedArray; width: number; height: number },
  options: { marge: number; fond: number; encre: number }
) {
  const width = src.width + options.marge * 2;
  const height = src.height + options.marge * 2;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = rgba[i + 1] = rgba[i + 2] = options.fond;
    rgba[i + 3] = 255;
  }
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4;
      const d = ((y + options.marge) * width + (x + options.marge)) * 4;
      // Contraste réduit : noir délavé sur blanc cassé.
      const v = src.rgba[s] < 128 ? options.encre : options.fond;
      rgba[d] = rgba[d + 1] = rgba[d + 2] = v;
      rgba[d + 3] = 255;
    }
  }
  return { rgba, width, height };
}

/** Un produit tel que le catalogue de l'app le connaît. */
function produit(over: Partial<Product>): Product {
  return {
    id: 'cmtprod0000',
    name: 'Article',
    salePrice: 1_000,
    purchasePrice: 500,
    stock: 10,
    alertThreshold: 1,
    category: 'DIVERS',
    unit: 'piece',
    salesCount: 0,
    createdAt: '2026-09-14T10:00:00.000Z',
    ...over,
  } as Product;
}

const CATALOGUE: Product[] = [
  produit({ id: 'cmtqr', name: 'Sac raphia', internalCode: 'INT-612332909' }),
  produit({ id: 'cmtean13', name: 'Pâte à tartiner', barcode: '3017620422003' }),
  produit({ id: 'cmtean8', name: 'Chewing-gum', barcode: '96385074' }),
  produit({ id: 'cmtupca', name: 'Soda canette', barcode: '036000291452' }),
  produit({ id: 'cmtupce', name: 'Piles AA', barcode: '04252614' }),
  produit({ id: 'cmtitf', name: 'Carton de 12 savons', barcode: '10012345678902' }),
  produit({ id: 'cmtc39', name: 'Pagne wax', barcode: 'PAGNE-WAX-07' }),
  produit({
    id: 'cmtdm',
    name: 'Tapis berbère',
    productCodes: [
      {
        id: 'k1',
        business_id: 'b',
        product_id: 'cmtdm',
        code: 'INT-409664751',
        format: 'DATAMATRIX',
        origine: 'GENERE',
        est_principal: true,
        created_at: '2026-09-14T10:00:00.000Z',
      },
    ],
  }),
];

/**
 * Formats que l'app sait lire, avec un code réel de chaque sorte et ce que la
 * lecture doit rendre.
 */
const FORMATS: { format: CodeFormat; code: string; lu: string; produit: string }[] = [
  { format: 'QR', code: 'INT-612332909', lu: 'INT-612332909', produit: 'Sac raphia' },
  { format: 'EAN13', code: '3017620422003', lu: '3017620422003', produit: 'Pâte à tartiner' },
  { format: 'EAN8', code: '96385074', lu: '96385074', produit: 'Chewing-gum' },
  { format: 'UPCA', code: '036000291452', lu: '036000291452', produit: 'Soda canette' },
  { format: 'UPCE', code: '04252614', lu: '04252614', produit: 'Piles AA' },
  { format: 'ITF14', code: '10012345678902', lu: '10012345678902', produit: 'Carton de 12 savons' },
  { format: 'CODE39', code: 'PAGNE-WAX-07', lu: 'PAGNE-WAX-07', produit: 'Pagne wax' },
  { format: 'CODE128', code: 'INT-612332909', lu: 'INT-612332909', produit: 'Sac raphia' },
  { format: 'DATAMATRIX', code: 'INT-409664751', lu: 'INT-409664751', produit: 'Tapis berbère' },
];

beforeAll(async () => {
  // Le lecteur WebAssembly de l'app (zxing-cpp), chargé depuis le disque.
  const binaire = fs.readFileSync(path.resolve(import.meta.dirname, '../../frontend/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
  await useWasmBinaryForTests(binaire.buffer.slice(binaire.byteOffset, binaire.byteOffset + binaire.byteLength) as ArrayBuffer);
});

describe('Scan iPhone et ordinateur (zxing-cpp) — chaque format imprimé se relit et ramène le bon produit', () => {
  for (const cas of FORMATS) {
    it(`${cas.format} « ${cas.code} »`, async () => {
      const image = pixelsDuPng(await generateBarcodePngBuffer(cas.format, cas.code));
      const lecture = await decodeImageData({ data: image.rgba, width: image.width, height: image.height });

      expect(lecture, `le ${cas.format} n'a pas été lu`).not.toBeNull();
      // Le code tel qu'imprimé sous le symbole : un UPC-E revient en 8 chiffres,
      // un UPC-A en 12, et pas sous leur forme EAN-13.
      expect(lecture!.code).toBe(cas.lu);
      expect(lecture!.format).toBe(cas.format);
      expect(findProductByCode(CATALOGUE, lecture!.code)?.name).toBe(cas.produit);
    });
  }

  it('lu sur une photo : symbole petit au milieu du cadre, contraste délavé', async () => {
    for (const cas of FORMATS.filter((f) => ['QR', 'EAN13', 'UPCE', 'CODE128', 'DATAMATRIX'].includes(f.format))) {
      const brut = pixelsDuPng(await generateBarcodePngBuffer(cas.format, cas.code));
      const photo = dansUnePhoto(brut, { marge: 120, fond: 215, encre: 70 });
      const lecture = await decodeImageData({ data: photo.rgba, width: photo.width, height: photo.height });
      expect(lecture?.code, cas.format).toBe(cas.lu);
    }
  });

  it('une image sans code ne ramène rien (pas de produit inventé)', async () => {
    const blanc = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    expect(await decodeImageData({ data: blanc, width: 200, height: 200 })).toBeNull();
  });
});

describe('Repli ZXing JavaScript (si le WebAssembly ne se charge pas)', () => {
  for (const cas of FORMATS.filter((f) => f.format !== 'UPCE')) {
    it(`${cas.format} « ${cas.code} »`, async () => {
      const image = pixelsDuPng(await generateBarcodePngBuffer(cas.format, cas.code));
      const lecture = decodeRgbaWithZXing(image.rgba, image.width, image.height);
      expect(lecture?.code).toBe(cas.lu);
      expect(findProductByCode(CATALOGUE, lecture!.code)?.name).toBe(cas.produit);
    });
  }

  it('UPC-E : ce repli ne le lit pas — c est ce que zxing-cpp corrige', async () => {
    const image = pixelsDuPng(await generateBarcodePngBuffer('UPCE', '04252614'));
    expect(decodeRgbaWithZXing(image.rgba, image.width, image.height)).toBeNull();
  });
});

describe('Lecteur du navigateur (Android) — ses réponses sont remises dans la forme imprimée', () => {
  it('UPC-E et UPC-A rendus sous forme longue ou EAN-13', () => {
    expect(normalizeReading('0042100005264', 'UPCE')).toEqual({ code: '04252614', format: 'UPCE' });
    expect(normalizeReading('042100005264', 'upc_e')).toEqual({ code: '04252614', format: 'UPCE' });
    expect(normalizeReading('0036000291452', 'EAN13')).toEqual({ code: '036000291452', format: 'UPCA' });
    expect(normalizeReading('3017620422003', 'ean_13')).toEqual({ code: '3017620422003', format: 'EAN13' });
    expect(normalizeReading(' INT-612332909 ', 'qr_code')).toEqual({ code: 'INT-612332909', format: 'QR' });
  });
});

describe('Scan — étiquettes code-barres de la boutique', () => {
  it('le code interne imprimé en code-barres garde son tiret, et se relit tel quel', async () => {
    // Même symbologie que labelPdfGenerator (Code 128).
    const image = pixelsDuPng(await generateBarcodePngBuffer('CODE128', 'INT-612332909'));
    const lecture = decodeRgbaWithZXing(image.rgba, image.width, image.height);
    expect(lecture?.code).toBe('INT-612332909');
    expect(findProductByCode(CATALOGUE, lecture!.code)?.name).toBe('Sac raphia');
  });

  it('les étiquettes déjà collées, imprimées sans le tiret, scannent encore', async () => {
    const image = pixelsDuPng(await generateBarcodePngBuffer('CODE128', 'INT612332909'));
    const lecture = decodeRgbaWithZXing(image.rgba, image.width, image.height);
    expect(lecture?.code).toBe('INT612332909');
    expect(findProductByCode(CATALOGUE, lecture!.code)?.name).toBe('Sac raphia');
  });

  it('le code du fabricant réimprimé en Code 128 ramène le même produit', async () => {
    const image = pixelsDuPng(await generateBarcodePngBuffer('CODE128', '3017620422003'));
    const lecture = decodeRgbaWithZXing(image.rgba, image.width, image.height);
    expect(findProductByCode(CATALOGUE, lecture!.code)?.name).toBe('Pâte à tartiner');
  });
});

describe('Scan — reconnaissance tolérante, sans confusion', () => {
  it('un UPC-A lu en EAN-13 (0 devant) par Android ou iPhone est reconnu', () => {
    expect(findProductByCode(CATALOGUE, '0036000291452')?.name).toBe('Soda canette');
    // …et l'inverse : EAN-13 enregistré, lu en UPC-A sur un autre lecteur.
    const cat = [produit({ id: 'x', name: 'Lait', barcode: '0012345678905' })];
    expect(findProductByCode(cat, '012345678905')?.name).toBe('Lait');
  });

  it('casse, espaces et saut de ligne d un lecteur USB sont ignorés', () => {
    expect(findProductByCode(CATALOGUE, '  int-612332909\n')?.name).toBe('Sac raphia');
    expect(findProductByCode(CATALOGUE, '\t3017620422003\r\n')?.name).toBe('Pâte à tartiner');
  });

  it('le code exact passe avant la forme tolérante', () => {
    const cat = [
      produit({ id: 'a', name: 'Avec tiret', barcode: 'AB-1234' }),
      produit({ id: 'b', name: 'Sans tiret', barcode: 'AB1234' }),
    ];
    expect(findProductByCode(cat, 'AB1234')?.name).toBe('Sans tiret');
    expect(findProductByCode(cat, 'AB-1234')?.name).toBe('Avec tiret');
  });

  it('un code court ou un EAN-8 n est jamais rapproché par ses zéros', () => {
    const cat = [produit({ id: 'a', name: 'Code 12', barcode: '12' })];
    expect(findProductByCode(cat, '0012')).toBeUndefined();
    // EAN-8 qui n'est pas un UPC-E valide : laissé tel quel.
    expect(looseCode('96385074')).toBe('96385074');
    expect(findProductByCode(CATALOGUE, '963850740')).toBeUndefined();
  });

  it('un UPC-E et sa forme longue UPC-A désignent le même article', () => {
    expect(upceToUpca('04252614')).toBe('042100005264');
    expect(upcaToUpce('042100005264')).toBe('04252614');
    // Les quatre familles de compression UPC-E, aller-retour.
    for (const upce of ['01234565', '01234133', '01200034', '01234580']) {
      const upca = upceToUpca(upce);
      if (upca) expect(upcaToUpce(upca)).toBe(upce);
    }
    expect(upceToUpca('04252615')).toBeNull(); // clé fausse
    expect(upcaToUpce('036000291452')).toBeNull(); // UPC-A sans forme courte
    expect(findProductByCode(CATALOGUE, '042100005264')?.name).toBe('Piles AA');
    expect(findProductByCode(CATALOGUE, '0042100005264')?.name).toBe('Piles AA');
    const cat = [produit({ id: 'l', name: 'Long', barcode: '042100005264' })];
    expect(findProductByCode(cat, '04252614')?.name).toBe('Long');
  });

  it('un code inconnu, vide, ou le lien d un reçu ne ramènent aucun produit', () => {
    expect(findProductByCode(CATALOGUE, '3017620422004')).toBeUndefined();
    expect(findProductByCode(CATALOGUE, '')).toBeUndefined();
    expect(
      findProductByCode(CATALOGUE, 'https://morocashfront.vercel.app/api/v1/receipts/verify/cm1/3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c')
    ).toBeUndefined();
  });
});

describe('Scan continu — la caméra ne compte pas deux fois le même article', () => {
  it('une étiquette tenue 5 s devant la caméra (30 images/s) ne compte qu une fois', () => {
    const gate = createScanGate();
    let acceptes = 0;
    for (let t = 0; t <= 5_000; t += 33) if (gate.accept('INT-612332909', t)) acceptes++;
    expect(acceptes).toBe(1);
  });

  it('retirée puis représentée, elle compte à nouveau : deux articles identiques', () => {
    const gate = createScanGate();
    expect(gate.accept('INT-612332909', 0)).toBe(true);
    expect(gate.accept('INT-612332909', 500)).toBe(false);
    // Hors du cadre de 500 ms à 2 000 ms, puis de retour.
    expect(gate.accept('INT-612332909', 2_000)).toBe(true);
  });

  it('deux articles différents à la suite comptent chacun', () => {
    const gate = createScanGate();
    expect(gate.accept('INT-612332909', 0)).toBe(true);
    expect(gate.accept('3017620422003', 100)).toBe(true);
    expect(gate.accept('INT-612332909', 200)).toBe(true);
  });

  it('une lecture vide est ignorée', () => {
    expect(createScanGate().accept('   ', 0)).toBe(false);
  });
});

/** Touches d'une douchette : `texte` écrit par l'ordinateur, `touches` physiques (e.code). */
function rafale(
  texte: string,
  options: { touches?: string[]; debut?: number; ecart?: number; entree?: boolean } = {}
): ScanKeyEvent[] {
  const ecart = options.ecart ?? 8;
  let t = options.debut ?? 1_000;
  const events: ScanKeyEvent[] = texte.split('').map((key, i) => ({
    key,
    code: options.touches?.[i] ?? (/\d/.test(key) ? `Digit${key}` : /[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : key === '-' ? 'Minus' : ''),
    shiftKey: /[A-Z]/.test(key),
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    timeStamp: (t += ecart),
  }));
  if (options.entree !== false) {
    events.push({ key: 'Enter', code: 'Enter', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, timeStamp: t + ecart });
  }
  return events;
}

function lire(events: ScanKeyEvent[], buffer = createKeyboardScanBuffer()) {
  let scan = null;
  for (const e of events) scan = buffer.push(e).scan ?? scan;
  return scan;
}

describe('Douchette USB / Bluetooth (ordinateur, tablette, iPhone)', () => {
  it('un code tapé en rafale puis Entrée est une lecture', () => {
    expect(lire(rafale('3017620422003'))).toEqual({ typed: '3017620422003', physical: '3017620422003' });
    const scan = lire(rafale('INT-612332909'))!;
    expect(resolveKeyboardScan(CATALOGUE, scan)).toMatchObject({ code: 'INT-612332909', product: { name: 'Sac raphia' } });
  });

  it('ordinateur en AZERTY, douchette en QWERTY : le code est retrouvé par les touches', () => {
    // La douchette presse les touches 3,0,1,7… du clavier américain ;
    // l'ordinateur français écrit « "à&è§é)àééàà" ».
    const azerty: Record<string, string> = { '1': '&', '2': 'é', '3': '"', '4': "'", '5': '(', '6': '-', '7': 'è', '8': '_', '9': 'ç', '0': 'à' };
    const code = '3017620422003';
    const events = rafale(code.split('').map((d) => azerty[d]).join(''), { touches: code.split('').map((d) => `Digit${d}`) });
    const scan = lire(events)!;
    expect(scan.typed).toBe(code.split('').map((d) => azerty[d]).join(''));
    expect(scan.typed).not.toMatch(/\d/);
    expect(scan.physical).toBe(code);
    expect(resolveKeyboardScan(CATALOGUE, scan)).toMatchObject({ code, product: { name: 'Pâte à tartiner' } });
    // Code inconnu : la lecture par les touches, lisible, est retenue.
    const inconnu = '6009510800210';
    const s2 = lire(rafale(inconnu.split('').map((d) => azerty[d]).join(''), { touches: inconnu.split('').map((d) => `Digit${d}`) }))!;
    expect(resolveKeyboardScan(CATALOGUE, s2)).toEqual({ code: inconnu, product: undefined });
  });

  it('QWERTY sur AZERTY avec lettres et tiret : « INT-612332909 »', () => {
    // I, N, T sont aux mêmes places ; la touche « - » américaine écrit « ) »
    // en AZERTY et les chiffres deviennent des symboles.
    const ecrit = 'INT)-&é""éçàç'; // 6 → « - », 1 → « & », 2 → « é »…
    const touches = ['KeyI', 'KeyN', 'KeyT', 'Minus', 'Digit6', 'Digit1', 'Digit2', 'Digit3', 'Digit3', 'Digit2', 'Digit9', 'Digit0', 'Digit9'];
    expect(ecrit.length).toBe(touches.length);
    const scan = lire(rafale(ecrit, { touches }))!;
    expect(scan.typed).toBe(ecrit);
    expect(scan.physical.toUpperCase()).toBe('INT-612332909');
    expect(resolveKeyboardScan(CATALOGUE, scan)).toMatchObject({ product: { name: 'Sac raphia' } });
  });

  it('une personne qui tape au clavier n est jamais prise pour une douchette', () => {
    expect(lire(rafale('3017620422003', { ecart: 140 }))).toBeNull();
    // Rafale trop courte (« ok » + Entrée).
    expect(lire(rafale('ok'))).toBeNull();
    // Raccourci Ctrl+V en plein milieu : la rafale est abandonnée.
    const buffer = createKeyboardScanBuffer();
    const events = rafale('301762042');
    for (const e of events.slice(0, 5)) buffer.push(e);
    buffer.push({ ...events[5], ctrlKey: true });
    for (const e of events.slice(6)) buffer.push(e);
    expect(buffer.length).toBeLessThan(9);
  });

  it('l écran qui ralentit sur les premiers caractères (champ qui filtre) ne coupe pas le code', () => {
    // Constaté dans le navigateur : le 1er caractère tapé dans « Rechercher ou
    // scanner » filtre le catalogue, et le 2e arrive 120 ms plus tard.
    const events = rafale('3017620422003');
    events[1].timeStamp = events[0].timeStamp + 120;
    for (let i = 2; i < events.length; i++) events[i].timeStamp = events[i - 1].timeStamp + 8;
    expect(lire(events)).toEqual({ typed: '3017620422003', physical: '3017620422003' });
    // Au-delà du 3e caractère, un retard est celui d'une personne : pas de lecture.
    const lent = rafale('3017620422003');
    lent[6].timeStamp = lent[5].timeStamp + 120;
    for (let i = 7; i < lent.length; i++) lent[i].timeStamp = lent[i - 1].timeStamp + 8;
    expect(lire(lent)?.typed).not.toBe('3017620422003');
  });

  it('une douchette réglée sans Entrée final est lue après un court silence', () => {
    const buffer = createKeyboardScanBuffer();
    const events = rafale('3017620422003', { entree: false });
    for (const e of events) expect(buffer.push(e).scan).toBeNull();
    const fin = events[events.length - 1].timeStamp;
    expect(buffer.flush(fin + 10)).toBeNull(); // encore en rafale
    expect(buffer.flush(fin + 200)).toEqual({ typed: '3017620422003', physical: '3017620422003' });
  });

  it('deux articles scannés à la suite donnent deux lectures', () => {
    const buffer = createKeyboardScanBuffer();
    const a = rafale('3017620422003', { debut: 0 });
    const b = rafale('96385074', { debut: 1_000 });
    const lectures = [...a, ...b].map((e) => buffer.push(e).scan).filter(Boolean);
    expect(lectures.map((l) => l!.typed)).toEqual(['3017620422003', '96385074']);
  });
});

describe('Saisie d un code — format et clé de contrôle', () => {
  it('reconnaît chaque format et valide les vraies clés', () => {
    expect(validateBarcodeChecksum('3017620422003')).toMatchObject({ format: 'EAN13', isValidChecksum: true });
    expect(validateBarcodeChecksum('96385074')).toMatchObject({ format: 'EAN8', isValidChecksum: true });
    expect(validateBarcodeChecksum('036000291452')).toMatchObject({ format: 'UPCA', isValidChecksum: true });
    expect(validateBarcodeChecksum('10012345678902')).toMatchObject({ format: 'ITF14', isValidChecksum: true });
  });

  it('signale un chiffre mal recopié', () => {
    const r = validateBarcodeChecksum('3017620422004');
    expect(r.isValidChecksum).toBe(false);
    expect(r.warningMessage).toMatch(/mal recopié/);
  });

  it('le code maison du serveur est reconnu comme code interne, pas comme Code 39', () => {
    expect(validateBarcodeChecksum('INT-612332909').format).toBe('INTERNE');
  });

  it('les noms de format des deux lecteurs (natif et ZXing) sont compris', () => {
    expect(mapFormatStringToBarcodeFormat('ean_13')).toBe('EAN13');
    expect(mapFormatStringToBarcodeFormat('upc_e')).toBe('UPCE');
    expect(mapFormatStringToBarcodeFormat('data_matrix')).toBe('DATAMATRIX');
    expect(mapFormatStringToBarcodeFormat('QR_CODE')).toBe('QR');
    expect(mapFormatStringToBarcodeFormat('ITF')).toBe('ITF14');
  });
});

/** Rend un QR en pixels RGBA, comme sur l'écran du reçu. */
function qrEnPixels(texte: string) {
  const qr = QRCode.create(texte, { errorCorrectionLevel: 'M' });
  const modules = qr.modules.size;
  const px = 6;
  const marge = 4;
  const cote = (modules + marge * 2) * px;
  const rgba = new Uint8ClampedArray(cote * cote * 4).fill(255);
  for (let y = 0; y < modules; y++) {
    for (let x = 0; x < modules; x++) {
      if (!qr.modules.data[y * modules + x]) continue;
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const i = (((y + marge) * px + dy) * cote + (x + marge) * px + dx) * 4;
          rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
      }
    }
  }
  return { rgba, width: cote, height: cote };
}

describe('Base réelle — codes enregistrés, scan en caisse et QR du reçu', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('un code-barres ajouté au produit est gardé par le serveur et scanne après rechargement', async () => {
    const { business } = await registerBusiness(
      { businessNom: 'Verif Scan Codes', telephone: `225${Date.now().toString().slice(-8)}1`, pin: '123456' },
      {}
    );
    const product = await createProduct(business.id, {
      nom: 'Pâte à tartiner 400g',
      type: 'PRODUIT',
      prixVente: 3_500,
      prixAchat: 2_500,
      stock: 12,
      seuilAlerte: 2,
      unite: 'pot',
    });

    // La création renvoie désormais le produit avec son QR interne.
    const creeAvecCodes = product as typeof product & { codes?: { code: string; origine: string }[] };
    expect(creeAvecCodes.codes?.[0]).toMatchObject({ origine: 'GENERE' });
    const interne = creeAvecCodes.codes![0].code;
    expect(interne).toMatch(/^INT-\d{9}$/);

    // Le code de l'emballage, lu à la caméra.
    const ean = await addCode(business.id, product.id, {
      code: '3017620422003',
      format: 'EAN13',
      origine: 'SCANNE',
      estPrincipal: false,
    });

    // Un même code ne peut pas être pris par un second article.
    const autre = await createProduct(business.id, {
      nom: 'Autre pot',
      type: 'PRODUIT',
      prixVente: 1_000,
      prixAchat: 500,
      stock: 1,
      seuilAlerte: 0,
      unite: 'pot',
    });
    await expect(
      addCode(business.id, autre.id, { code: '3017620422003', format: 'EAN13', origine: 'MANUEL', estPrincipal: false })
    ).rejects.toMatchObject({ code: 'CODE_ALREADY_USED' });

    // Le catalogue rechargé (GET /products) porte les deux codes…
    const apiProducts = (await listProducts(business.id)).map((p) => ({
      id: p.id,
      nom: p.nom,
      type: p.type,
      prixVente: p.prixVente,
      stock: p.stock,
      seuilAlerte: p.seuilAlerte,
      unite: p.unite,
      categoryId: p.categoryId,
      actif: p.actif,
      createdAt: p.createdAt.toISOString(),
      codes: (p.codes ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        format: c.format,
        origine: c.origine,
        estPrincipal: c.estPrincipal,
        createdAt: c.createdAt.toISOString(),
      })),
    }));
    const catalogue = apiProducts.map((p) => toFrontendProduct(p as never));
    const pot = catalogue.find((p) => p.id === product.id)!;
    expect(pot.internalCode).toBe(interne);
    expect(pot.barcode).toBe('3017620422003');

    // …et chaque scan ramène le bon article, au caisse comme côté serveur.
    const image = pixelsDuPng(await generateBarcodePngBuffer('EAN13', '3017620422003'));
    const lu = decodeRgbaWithZXing(image.rgba, image.width, image.height)!;
    expect(findProductByCode(catalogue, lu.code)?.id).toBe(product.id);
    const qr = pixelsDuPng(await generateBarcodePngBuffer('QR', interne));
    expect(findProductByCode(catalogue, decodeRgbaWithZXing(qr.rgba, qr.width, qr.height)!.code)?.id).toBe(product.id);
    expect((await findOnServer(business.id, '3017620422003'))?.id).toBe(product.id);

    // Code principal : un second code fabricant, choisi comme principal, est
    // gardé par le serveur et devient LE code-barres du produit.
    const second = await addCode(business.id, product.id, {
      code: '04252614',
      format: 'UPCE',
      origine: 'MANUEL',
      estPrincipal: false,
    });
    const apres = await setPrimaryCode(business.id, product.id, second.id);
    expect(apres.filter((c) => c.estPrincipal).map((c) => c.code)).toEqual(['04252614']);
    const relus = (await listCodes(business.id, product.id)).map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));
    expect(codeFieldsFromApi(product.id, relus)).toMatchObject({ barcode: '04252614', internalCode: interne });
    // Un code d'un autre produit ne peut pas être désigné.
    await expect(setPrimaryCode(business.id, autre.id, second.id)).rejects.toMatchObject({ code: 'RESOURCE_NOT_OWNED' });
    await removeCode(business.id, product.id, second.id);

    // Retiré, le code ne ramène plus rien et se libère pour un autre article.
    await removeCode(business.id, product.id, ean.id);
    const restants = await listCodes(business.id, product.id);
    expect(codeFieldsFromApi(product.id, restants.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))).barcode).toBeUndefined();
    await expect(findOnServer(business.id, '3017620422003')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    await expect(
      addCode(business.id, autre.id, { code: '3017620422003', format: 'EAN13', origine: 'MANUEL', estPrincipal: false })
    ).resolves.toMatchObject({ code: '3017620422003' });
  });

  it('le QR du reçu, scanné par le client, ouvre le bon reçu sans ses données privées', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Scan Recu', telephone: `225${Date.now().toString().slice(-8)}2`, pin: '123456' },
      {}
    );
    const product = await createProduct(business.id, {
      nom: 'Bijoux',
      type: 'PRODUIT',
      prixVente: 5_000,
      prixAchat: 3_000,
      stock: 10,
      seuilAlerte: 1,
      unite: 'pièce',
    });
    const customer = await createCustomer(business.id, { nom: 'Kane Salimata', telephone: '0701020304' });
    const clientUuid = randomUUID();
    const commande = await createOrder(
      {
        businessId: business.id,
        userId: owner.id,
        role: 'OWNER',
        remiseMaxVendeur: 0,
        cashRegisterMode: business.cashRegisterMode as 'LIBRE' | 'STRICT',
      },
      { clientUuid, customerId: customer.id, items: [{ productId: product.id, qte: 1 }], montantRecu: 2_500, methode: 'ESPECES' }
    );
    const numero = commande.order.numero;

    // Le lien encodé dans le QR, tel que le reçu le fabrique.
    g.window = { location: { origin: 'https://morocashfront.vercel.app' } };
    const url = receiptVerifyUrl({ clientUuid } as Sale, { businessId: business.id } as never);
    expect(url).toBe(`https://morocashfront.vercel.app/api/v1/receipts/verify/${business.id}/${clientUuid}`);

    // Scanné : le QR rend exactement ce lien.
    const image = qrEnPixels(url);
    const lecture = decodeRgbaWithZXing(image.rgba, image.width, image.height);
    expect(lecture).toMatchObject({ code: url, format: 'QR' });

    // La page ouverte par ce lien.
    // /api/v1/receipts/verify/<boutique>/<clientUuid>
    const [, , , , , businessId, uuid] = new URL(lecture!.code).pathname.split('/');
    expect([businessId, uuid]).toEqual([business.id, clientUuid]);
    const res = await verifyReceiptPage(new Request(lecture!.code), {
      params: Promise.resolve({ businessId, clientUuid: uuid }),
    });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('Verif Scan Recu');
    expect(html).toContain(numero);
    expect(html).toContain('Bijoux');
    expect(html).toMatch(/TOTAL<\/span><span>5[\s  ]000 F/);
    expect(html).toMatch(/Reste à payer : 2[\s  ]500 F/);
    expect(html).toContain('Reçu authentique');
    // Prénom seulement ; ni nom de famille complet, ni téléphone du client.
    expect(html).toContain('Kane');
    expect(html).not.toContain('Salimata');
    expect(html).not.toContain('0701020304');

    // Un lien d'une autre boutique, ou modifié à la main, ne montre rien.
    const intrus = await verifyReceiptPage(new Request(url), {
      params: Promise.resolve({ businessId, clientUuid: randomUUID() }),
    });
    expect(intrus.status).toBe(404);
  });
});
