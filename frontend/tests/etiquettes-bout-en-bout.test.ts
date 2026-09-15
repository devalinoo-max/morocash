import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chromium, type Browser, type Page } from 'playwright-core';
import { generateLabelsPdfBuffer } from '../server/labelPdfGenerator';
import { formatLabelPrice, ticketLayout } from '../src/utils/labelTicket';
import { BOUTIQUE_ETIQUETTES, PRODUITS_ETIQUETTES, codeAttendu } from './ecran/produitsEtiquettes';

/**
 * Étiquettes, de bout en bout, dans un vrai navigateur (Chrome sans fenêtre).
 *
 * La VRAIE fenêtre « Imprimer vos étiquettes » s'ouvre sur un catalogue
 * d'essai dont les photos arrivent en WebP par l'adresse de l'API, comme en
 * vrai. On choisit le format et la couleur, on clique « Télécharger le PDF » :
 * la requête part vers /api/v1/products/labels, où le VRAI générateur du
 * serveur fabrique le PDF. Ce PDF est ensuite dessiné et lu page par page :
 * - chaque étiquette porte son prix écrit « 12 500 F », jamais de « / » ;
 * - chaque QR se décode et renvoie le code du produit, en bas de l'étiquette,
 *   au moins un tiers de sa largeur, au même endroit sur toutes ;
 * - la photo du produit est imprimée dans sa case, vide quand il n'en a pas ;
 * - le nom de la boutique, le nom du produit et « Scannez pour vérifier ».
 *
 * Sans Chrome ni Edge sur la machine, la suite est ignorée (et le dit).
 */

const ici = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(ici, '..');

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
  .filter((p): p is string => Boolean(p))
  .find((p) => fs.existsSync(p));

// Pages PDF en PNG, facultatif, pour relire les étiquettes à l'œil.
const CAPTURES = process.env.ETIQUETTES_CAPTURES;

const PT = 72 / 25.4;

interface Planche {
  bouton: string;
  format: string;
  largeur: number;
  hauteur: number;
  colonnes: number;
  parPage: number;
  margeGauche: number;
  margeHaut: number;
}

// Même disposition que getSheetConfig dans le générateur, en mm.
const PLANCHES: Planche[] = [
  { bouton: '24 étiquettes par page', format: '24_63x34', largeur: 63, hauteur: 34, colonnes: 3, parPage: 24, margeGauche: 10.5, margeHaut: 12.5 },
  { bouton: '65 étiquettes par page', format: '65_38x21', largeur: 38, hauteur: 21, colonnes: 5, parPage: 65, margeGauche: 10, margeHaut: 12 },
  { bouton: '12 étiquettes par page', format: '12_105x48', largeur: 105, hauteur: 48, colonnes: 2, parPage: 12, margeGauche: 0, margeHaut: 4.5 },
  { bouton: '21 étiquettes par page', format: '21_70x42', largeur: 70, hauteur: 42, colonnes: 3, parPage: 21, margeGauche: 0, margeHaut: 1.5 },
  { bouton: 'Ticket thermique 58 mm', format: 'thermal_58', largeur: 58, hauteur: 40, colonnes: 1, parPage: 1, margeGauche: 0, margeHaut: 0 },
];

const CAS = [
  { planche: PLANCHES[0], variante: 'couleur', exemplaires: 12 },
  { planche: PLANCHES[1], variante: 'claire', exemplaires: 1 },
  { planche: PLANCHES[2], variante: 'couleur', exemplaires: 1 },
  { planche: PLANCHES[3], variante: 'claire', exemplaires: 1 },
  { planche: PLANCHES[4], variante: 'couleur', exemplaires: 1 },
] as const;

interface PagePdf {
  width: number;
  height: number;
  textes: { str: string; x: number; y: number }[];
  png: string;
}

describe.skipIf(!chrome)('Étiquettes de bout en bout — fenêtre, serveur, PDF imprimé', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let base = '';

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      root: path.join(ici, 'ecran'),
      logLevel: 'error',
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: [{ find: /^.*\/context\/AppContext$/, replacement: path.join(ici, 'ecran', 'fauxContexte.tsx') }],
      },
      server: { port: 0, strictPort: false, fs: { allow: [frontend] } },
    });
    await server.listen();
    const adresse = server.httpServer!.address();
    base = `http://localhost:${typeof adresse === 'object' && adresse ? adresse.port : 5174}`;
    browser = await chromium.launch({ executablePath: chrome, headless: true });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  /** Ouvre la fenêtre, sert les photos en WebP et répond à la demande de PDF avec le vrai générateur. */
  async function ouvrir(): Promise<{ page: Page; attendrePdf: () => Promise<{ payload: any; pdf: Buffer }> }> {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // Fichier sur disque : Playwright refuse un Buffer venu du contexte de test.
    let photoWebp: string | null = null;

    await page.route('**/api/v1/products/*/raw', async (route) => {
      await route.fulfill({ status: 200, contentType: 'image/webp', path: photoWebp! });
    });

    let resoudre!: (v: { payload: any; pdf: Buffer }) => void;
    const promessePdf = new Promise<{ payload: any; pdf: Buffer }>((r) => (resoudre = r));
    await page.route('**/api/v1/products/labels', async (route) => {
      const payload = route.request().postDataJSON();
      // Même lecture de la requête que server.ts et api/v1/products/labels.ts.
      const pdf = await generateLabelsPdfBuffer({
        products: payload.products,
        copies: payload.copies,
        options: {
          format: payload.options.format,
          variante: payload.options.variante === 'couleur' ? 'couleur' : 'claire',
          startIndex: payload.options.startIndex ? Number(payload.options.startIndex) : 1,
          customDimensions: payload.options.customDimensions,
        },
        settings: payload.settings,
      });
      await route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
      resoudre({ payload, pdf });
    });

    await page.goto(`${base}/?ecran=etiquettes`);
    await page.waitForSelector('#panel-print-labels-modal', { timeout: 60_000 });

    // Une vraie photo WebP, bariolée : la case photo du PDF doit la montrer.
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 240;
      const ctx = c.getContext('2d')!;
      const couleurs = ['#E11D48', '#F59E0B', '#10B981', '#0EA5E9', '#111827', '#FDE68A'];
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = couleurs[i % couleurs.length];
        ctx.fillRect(i * 20, 0, 20, 240);
      }
      return c.toDataURL('image/webp', 0.9).split(',')[1];
    });
    photoWebp = path.join(os.tmpdir(), 'morocash-etiquette-photo.webp');
    fs.writeFileSync(photoWebp, Buffer.from(b64, 'base64'));

    return { page, attendrePdf: () => promessePdf };
  }

  for (const cas of CAS) {
    const { planche, variante, exemplaires } = cas;
    it(`${planche.bouton}, version ${variante}, ${exemplaires} exemplaire(s) par produit`, async () => {
      const { page, attendrePdf } = await ouvrir();
      try {
        await page.getByText(planche.bouton, { exact: true }).click();
        await page.getByRole('button', { name: variante === 'claire' ? /^Claire/ : /^Pleine couleur/ }).click();
        if (exemplaires === 12) await page.getByRole('button', { name: 'Tout mettre à 12' }).click();

        // L'aperçu de la fenêtre dessine bien le ticket dentelé.
        expect(await page.locator('#panel-print-labels-modal svg path[d*=" A"]').count()).toBeGreaterThan(0);

        await page.locator('#btn-download-labels-pdf').click();
        const { payload, pdf } = await attendrePdf();

        // 1. Ce que la fenêtre envoie au serveur.
        expect(payload.options.format).toBe(planche.format);
        expect(payload.options.variante).toBe(variante);
        for (const p of PRODUITS_ETIQUETTES) {
          const envoye = payload.products.find((x: any) => x.id === p.id);
          expect(envoye, `${p.name} absent de la requête`).toBeTruthy();
          if (p.avecPhoto) expect(envoye.photo, `${p.name} : photo non convertie en JPEG`).toMatch(/^data:image\/jpeg/);
          else expect(envoye.photo).toBeUndefined();
        }

        // 2. Le PDF, dessiné et lu dans le navigateur.
        const pages: PagePdf[] = await page.evaluate(
          ([b64, images]) => (window as any).lirePdf(b64, images),
          [pdf.toString('base64'), Boolean(CAPTURES)] as const
        );
        const nbEtiquettes = PRODUITS_ETIQUETTES.length * exemplaires;
        expect(pages.length).toBe(Math.ceil(nbEtiquettes / planche.parPage));

        if (CAPTURES) {
          fs.mkdirSync(CAPTURES, { recursive: true });
          pages.slice(0, 2).forEach((pg, i) =>
            fs.writeFileSync(
              path.join(CAPTURES, `${planche.format}-${variante}-page${i + 1}.png`),
              Buffer.from(pg.png.split(',')[1], 'base64')
            )
          );
        }

        // Jamais de « / » nulle part sur les étiquettes.
        const barres = pages.flatMap((pg) => pg.textes).filter((t) => t.str.includes('/'));
        expect(barres.map((t) => t.str), 'texte contenant « / »').toEqual([]);

        const W = planche.largeur * PT;
        const H = planche.hauteur * PT;
        const L = ticketLayout(planche.largeur, planche.hauteur);
        const decalagesQr: { dx: number; dy: number }[] = [];

        for (let k = 0; k < nbEtiquettes; k++) {
          const produit = PRODUITS_ETIQUETTES[Math.floor(k / exemplaires)];
          const pageIdx = Math.floor(k / planche.parPage);
          const pos = k % planche.parPage;
          const cx = planche.margeGauche * PT + (pos % planche.colonnes) * W;
          const cy = planche.margeHaut * PT + Math.floor(pos / planche.colonnes) * H;
          const pg = pages[pageIdx];
          const dedans = (x: number, y: number) => x >= cx - 1 && x <= cx + W + 1 && y >= cy - 1 && y <= cy + H + 1;
          const textes = pg.textes.filter((t) => dedans(t.x, t.y)).map((t) => t.str);
          const ctx = `étiquette ${k + 1} (${produit.name}), page ${pageIdx + 1}`;

          expect(textes, `${ctx} : prix`).toContain(formatLabelPrice(produit.salePrice));
          expect(textes.filter((t) => t.trim() === 'Scannez pour vérifier').length, `${ctx} : légende du QR`).toBe(1);
          expect(textes, `${ctx} : morocash.app`).toContain('morocash.app');
          expect(textes.join(' '), `${ctx} : boutique`).toContain(BOUTIQUE_ETIQUETTES.slice(0, 4));
          expect(textes.join(' '), `${ctx} : nom du produit`).toContain(produit.name.slice(0, 4));

          // QR : lisible, bon code, dans la case prévue en bas, au moins un tiers de la largeur.
          const caseX = cx + L.qr.x * PT;
          const caseY = cy + L.qr.y * PT;
          const tailleCase = L.qr.size * PT;
          const qr: { text: string; x: number; y: number; w: number; h: number } | null = await page.evaluate(
            ([i, x, y, t]) => (window as any).lireQr(i, x, y, t, t),
            [pageIdx, caseX - 3, caseY - 3, tailleCase + 6]
          );
          expect(tailleCase, `${ctx} : QR plus petit qu'un tiers de la largeur`).toBeGreaterThanOrEqual(W / 3);
          expect(qr, `${ctx} : QR illisible`).toBeTruthy();
          expect(qr!.text, `${ctx} : code du QR`).toBe(codeAttendu(produit));
          // Le symbole remplit sa case, marge de silence comprise (2 modules de chaque côté).
          expect(qr!.w, `${ctx} : symbole QR trop petit`).toBeGreaterThan(tailleCase * 0.8);
          expect(Math.abs(qr!.x + qr!.w / 2 - (caseX + tailleCase / 2)), `${ctx} : QR décentré`).toBeLessThan(2);
          expect(Math.abs(qr!.y + qr!.h / 2 - (caseY + tailleCase / 2)), `${ctx} : QR décentré`).toBeLessThan(2);
          expect(caseY + tailleCase, `${ctx} : QR pas en bas`).toBeGreaterThan(cy + H * 0.75);
          decalagesQr.push({ dx: qr!.x + qr!.w / 2 - cx, dy: qr!.y + qr!.h / 2 - cy });

          // Photo : la case montre la photo, ou reste unie quand le produit n'en a pas.
          const marge = L.photo.size * 0.25;
          const ecart: number = await page.evaluate(
            ([i, x, y, t]) => (window as any).ecartLuminance(i, x, y, t, t),
            [pageIdx, cx + (L.photo.x + marge) * PT, cy + (L.photo.y + marge) * PT, (L.photo.size - 2 * marge) * PT]
          );
          if (produit.avecPhoto) expect(ecart, `${ctx} : photo absente`).toBeGreaterThan(20);
          else expect(ecart, `${ctx} : case photo pas vide`).toBeLessThan(3);
        }

        // Même gabarit partout : le QR est au même endroit dans chaque étiquette.
        const ref = decalagesQr[0];
        for (const d of decalagesQr) {
          expect(Math.abs(d.dx - ref.dx)).toBeLessThan(1.5);
          expect(Math.abs(d.dy - ref.dy)).toBeLessThan(1.5);
        }
      } finally {
        await page.close();
      }
    }, 180_000);
  }
});
