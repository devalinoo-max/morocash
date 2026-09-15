/// <reference types="vite/client" />
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import * as zxing from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * Lecture d'un PDF d'étiquettes dans le navigateur du banc d'essai : chaque
 * page est dessinée par pdf.js, son texte extrait, ses QR décodés par
 * zxing-cpp. Toutes les positions sont rendues en points PDF, origine en haut
 * à gauche, pour être comparées aux mesures du gabarit.
 */

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
zxing.prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

const ECHELLE = 4;

export interface TextePdf {
  str: string;
  x: number;
  y: number;
}
export interface QrPdf {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PagePdf {
  width: number;
  height: number;
  textes: TextePdf[];
  png: string;
}

const canvases: HTMLCanvasElement[] = [];

export async function lirePdf(base64: string, avecImages = false): Promise<PagePdf[]> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  canvases.length = 0;
  const pages: PagePdf[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: ECHELLE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    canvases.push(canvas);

    const contenu = await page.getTextContent();
    const textes = contenu.items
      .filter((it): it is typeof it & { str: string; transform: number[] } => 'str' in it && it.str.trim() !== '')
      .map((it) => ({ str: it.str, x: it.transform[4], y: base.height - it.transform[5] }));

    pages.push({ width: base.width, height: base.height, textes, png: avecImages ? canvas.toDataURL('image/png') : '' });
  }
  return pages;
}

/**
 * Décode le QR d'une zone (points) : une étiquette à la fois. Lire une page
 * entière de 24 QR d'un coup en laissait parfois passer un.
 */
export async function lireQr(pageIdx: number, x: number, y: number, w: number, h: number): Promise<QrPdf | null> {
  const canvas = canvases[pageIdx];
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const ox = Math.max(0, Math.round(x * ECHELLE));
  const oy = Math.max(0, Math.round(y * ECHELLE));
  const image = ctx.getImageData(ox, oy, Math.round(w * ECHELLE), Math.round(h * ECHELLE));
  const [r] = (await zxing.readBarcodes(image, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 })).filter(
    (l) => l.isValid
  );
  if (!r) return null;
  const p = r.position;
  const xs = [p.topLeft.x, p.topRight.x, p.bottomLeft.x, p.bottomRight.x];
  const ys = [p.topLeft.y, p.topRight.y, p.bottomLeft.y, p.bottomRight.y];
  const qx = (ox + Math.min(...xs)) / ECHELLE;
  const qy = (oy + Math.min(...ys)) / ECHELLE;
  return { text: r.text, x: qx, y: qy, w: (ox + Math.max(...xs)) / ECHELLE - qx, h: (oy + Math.max(...ys)) / ECHELLE - qy };
}

/** Écart-type de la luminance dans un rectangle (points) : une photo varie, une case vide non. */
export function ecartLuminance(pageIdx: number, x: number, y: number, w: number, h: number): number {
  const canvas = canvases[pageIdx];
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = ctx.getImageData(Math.round(x * ECHELLE), Math.round(y * ECHELLE), Math.max(1, Math.round(w * ECHELLE)), Math.max(1, Math.round(h * ECHELLE))).data;
  let somme = 0;
  let carres = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    somme += l;
    carres += l * l;
  }
  const moyenne = somme / n;
  return Math.sqrt(Math.max(0, carres / n - moyenne * moyenne));
}
