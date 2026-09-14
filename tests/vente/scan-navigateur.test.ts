import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { CodeFormat } from '@prisma/client';
import { generateBarcodePngBuffer } from '@/server/integrations/qr';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { addCode, listCodes } from '@/server/modules/products/codes';

/**
 * Le scan dans la VRAIE application, dans un vrai navigateur (Chrome sans
 * fenêtre), branchée sur le vrai backend et la vraie base.
 *
 * - Douchette : les touches sont envoyées au navigateur comme par un clavier
 *   (événements de confiance, via le protocole de Chrome), y compris un
 *   ordinateur en AZERTY avec une douchette en QWERTY.
 * - Caméra : Chrome reçoit une fausse caméra qui filme un code-barres. Le
 *   lecteur natif est retiré de la page : c'est le chemin d'un iPhone ou d'un
 *   ordinateur (zxing-cpp en WebAssembly).
 * - Chaque code enregistré depuis l'écran est relu dans la base.
 *
 * Il faut les serveurs de développement lancés : backend sur 3000, frontend
 * sur 5173 (`npm run dev` et `cd frontend && npm run dev`). Sans eux, ou sans
 * Chrome, la suite est ignorée et le dit.
 */

const FRONT = process.env.SCAN_FRONT_URL ?? 'http://localhost:5173';
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p): p is string => Boolean(p) && fs.existsSync(p!));

const serveursPrets = await fetch(`${FRONT}/api/v1/auth/me`)
  .then((r) => r.status === 401 || r.ok)
  .catch(() => false);

const { chromium } = (await import(
  path.resolve(import.meta.dirname, '../../frontend/node_modules/playwright-core/index.mjs')
)) as typeof import('playwright-core');
type Browser = import('playwright-core').Browser;
type Page = import('playwright-core').Page;

/** Vidéo Y4M d'un code-barres, pour la fausse caméra de Chrome. */
async function videoDuCode(format: CodeFormat, code: string): Promise<string> {
  const png = PNG.sync.read(await generateBarcodePngBuffer(format, code));
  const W = 640;
  const H = 480;
  const echelle = Math.max(1, Math.floor(Math.min((W * 0.7) / png.width, (H * 0.7) / png.height)));
  const y = Buffer.alloc(W * H, 235);
  const ox = Math.floor((W - png.width * echelle) / 2);
  const oy = Math.floor((H - png.height * echelle) / 2);
  for (let py = 0; py < png.height * echelle; py++) {
    for (let px = 0; px < png.width * echelle; px++) {
      const s = (Math.floor(py / echelle) * png.width + Math.floor(px / echelle)) * 4;
      y[(oy + py) * W + ox + px] = png.data[s] < 128 ? 16 : 235;
    }
  }
  const uv = Buffer.alloc((W / 2) * (H / 2), 128);
  const frames = Array.from({ length: 5 }, () => Buffer.concat([Buffer.from('FRAME\n'), y, uv, uv]));
  const fichier = path.join(os.tmpdir(), `morocash-scan-${format}-${code.replace(/\W/g, '')}.y4m`);
  fs.writeFileSync(fichier, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...frames]));
  return fichier;
}

const AZERTY: Record<string, string> = { '1': '&', '2': 'é', '3': '"', '4': "'", '5': '(', '6': '-', '7': 'è', '8': '_', '9': 'ç', '0': 'à' };

/**
 * Douchette : une touche toutes les ~5 ms, puis Entrée. `azerty` : ce que
 * produit une douchette QWERTY sur un ordinateur français (touche Digit3 →
 * caractère « " »).
 */
async function douchette(page: Page, code: string, options: { azerty?: boolean } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const touche = async (key: string, codeTouche: string, text?: string) => {
    await cdp.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code: codeTouche, text, unmodifiedText: text });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: codeTouche });
  };
  for (const c of code) {
    const codeTouche = /\d/.test(c) ? `Digit${c}` : /[a-z]/i.test(c) ? `Key${c.toUpperCase()}` : c === '-' ? 'Minus' : '';
    const ecrit = options.azerty && /\d/.test(c) ? AZERTY[c] : options.azerty && c === '-' ? ')' : c;
    await touche(ecrit, codeTouche, ecrit);
  }
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp.detach();
}

async function attendre<T>(lire: () => Promise<T>, ok: (v: T) => boolean, delai = 20_000): Promise<T> {
  const fin = Date.now() + delai;
  let v = await lire();
  while (!ok(v) && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 400));
    v = await lire();
  }
  return v;
}

describe.skipIf(!CHROME || !serveursPrets)('Scan dans la vraie application (navigateur + backend + base)', () => {
  let browser: Browser;
  let businessId = '';
  const telephone = `07${Date.now().toString().slice(-8)}`;
  const pin = '246810';
  const ids: Record<string, string> = {};
  const captures = process.env.SCAN_CAPTURES;

  beforeAll(async () => {
    const { business } = await registerBusiness({ businessNom: 'Verif Scan Navigateur', telephone, pin }, {});
    businessId = business.id;
    const base = { type: 'PRODUIT' as const, prixAchat: 500, stock: 20, seuilAlerte: 2, unite: 'pièce' };
    ids.pate = (await createProduct(businessId, { ...base, nom: 'Pâte à tartiner', prixVente: 3_500 })).id;
    ids.piles = (await createProduct(businessId, { ...base, nom: 'Piles AA', prixVente: 1_500 })).id;
    ids.sac = (await createProduct(businessId, { ...base, nom: 'Sac raphia', prixVente: 12_000 })).id;
    await addCode(businessId, ids.pate, { code: '3017620422003', format: 'EAN13', origine: 'SCANNE', estPrincipal: false });
    await addCode(businessId, ids.piles, { code: '04252614', format: 'UPCE', origine: 'SCANNE', estPrincipal: false });
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
  });

  async function connecte(b: Browser = browser): Promise<Page> {
    const context = await b.newContext({ viewport: { width: 1366, height: 800 }, permissions: ['camera'] });
    const page = await context.newPage();
    page.on('dialog', (d) => d.accept());
    await page.goto(`${FRONT}/connexion`);
    const res = await page.evaluate(
      async ({ telephone, pin }) => {
        const r = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telephone, pin }),
          credentials: 'include',
        });
        return r.status;
      },
      { telephone, pin }
    );
    expect(res).toBe(200);
    return page;
  }

  async function capture(page: Page, nom: string) {
    if (!captures) return;
    fs.mkdirSync(captures, { recursive: true });
    await page.screenshot({ path: path.join(captures, `${nom}.png`) });
  }

  async function ouvrirProduits(page: Page) {
    await page.goto(`${FRONT}/produits`);
    await page.waitForSelector('#products-tab-content', { timeout: 60_000 });
    await page.getByText('Pâte à tartiner').first().waitFor({ timeout: 60_000 });
    await page.mouse.click(5, 5); // curseur hors de tout champ
  }

  it('Produits : la douchette ouvre l article scanné (QWERTY, puis AZERTY)', async () => {
    const page = await connecte();
    try {
      await ouvrirProduits(page);
      await douchette(page, '3017620422003');
      await expect.poll(() => page.inputValue('#input-product-form-name').catch(() => ''), { timeout: 15_000 }).toBe('Pâte à tartiner');
      await capture(page, 'produits-douchette');
      await page.keyboard.press('Escape');
      await page.reload();
      await ouvrirProduits(page);

      await douchette(page, '04252614', { azerty: true });
      await expect.poll(() => page.inputValue('#input-product-form-name').catch(() => ''), { timeout: 15_000 }).toBe('Piles AA');
    } finally {
      await capture(page, 'fin-1');
      await page.context().close();
    }
  }, 180_000);

  it('Produits : une douchette qui tape dans un champ ordinaire n est pas détournée', async () => {
    const page = await connecte();
    try {
      await ouvrirProduits(page);
      await douchette(page, '3017620422003');
      await page.waitForSelector('#input-product-form-name', { timeout: 15_000 });
      // Formulaire ouvert, curseur dans le nom : le code s'écrit dans le champ.
      await page.fill('#input-product-form-name', '');
      await page.click('#input-product-form-name');
      await douchette(page, '96385074');
      expect(await page.inputValue('#input-product-form-name')).toBe('96385074');
    } finally {
      await capture(page, 'fin-2');
      await page.context().close();
    }
  }, 180_000);

  it('Ajouter un code : scanné à la douchette, gardé par le serveur, puis principal, puis retiré', async () => {
    const page = await connecte();
    try {
      await ouvrirProduits(page);
      await page.getByText('Sac raphia').first().click();
      await page.click('#btn-add-product-code');
      await page.getByText('Ajouter un code scannable').waitFor();
      await page.mouse.click(5, 5);
      await douchette(page, '6009510800210');

      const codes = await attendre(
        () => listCodes(businessId, ids.sac),
        (c) => c.some((x) => x.code === '6009510800210')
      );
      expect(codes.find((c) => c.code === '6009510800210')).toMatchObject({ format: 'EAN13', origine: 'SCANNE' });
      await capture(page, 'ajout-code-douchette');

      // Rechargé : le code est toujours là, et « Définir principal » l'enregistre.
      await page.reload();
      await ouvrirProduits(page);
      await page.getByText('Sac raphia').first().click();
      const ligne = page.locator('div.rounded-2xl', { hasText: '6009510800210' }).last();
      await ligne.waitFor({ timeout: 30_000 });
      await ligne.getByRole('button', { name: 'Définir principal' }).click();
      const principal = await attendre(
        () => listCodes(businessId, ids.sac),
        (c) => c.find((x) => x.code === '6009510800210')?.estPrincipal === true
      );
      expect(principal.filter((c) => c.estPrincipal).map((c) => c.code)).toEqual(['6009510800210']);

      await ligne.getByTitle('Supprimer ce code').click();
      const apres = await attendre(
        () => listCodes(businessId, ids.sac),
        (c) => !c.some((x) => x.code === '6009510800210')
      );
      expect(apres.map((c) => c.code)).not.toContain('6009510800210');
      expect(apres.some((c) => c.origine === 'GENERE')).toBe(true);
    } finally {
      await capture(page, 'fin-3');
      await page.context().close();
    }
  }, 240_000);

  it('Caisse : la douchette met l article au panier ; un code inconnu ouvre la création, code rempli', async () => {
    const page = await connecte();
    try {
      await page.goto(`${FRONT}/commandes/nouvelle`);
      await page.waitForSelector('#input-sale-search-product', { timeout: 60_000 });
      await page.getByText('Pâte à tartiner').first().waitFor({ timeout: 60_000 });

      // Curseur dans la barre de recherche « Rechercher ou scanner » : le scan
      // part au panier et la barre reste vide.
      await page.click('#input-sale-search-product');
      await douchette(page, '3017620422003', { azerty: true });
      await page.getByText('1 article').first().waitFor({ timeout: 15_000 });
      expect(await page.inputValue('#input-sale-search-product')).toBe('');

      await page.mouse.click(5, 300);
      await douchette(page, '3017620422003');
      await page.getByText('2 articles').first().waitFor({ timeout: 15_000 });
      await capture(page, 'caisse-douchette');

      await douchette(page, '6001234567892');
      await page.getByText('Plus de détails').click({ timeout: 15_000 });
      await expect.poll(() => page.inputValue('#input-product-barcode').catch(() => ''), { timeout: 15_000 }).toBe('6001234567892');
    } finally {
      await capture(page, 'fin-4');
      await page.context().close();
    }
  }, 180_000);

  it('Comptage de stock : chaque lecture compte un article, à partir de 0', async () => {
    const page = await connecte();
    try {
      await page.goto(`${FRONT}/mouvements`);
      await page.getByRole('button', { name: 'Faire un comptage' }).click();
      await page.getByText('Faire un comptage de stock').waitFor({ timeout: 30_000 });
      const ligne = page.locator('tr', { hasText: 'Piles AA' });
      await ligne.waitFor({ timeout: 60_000 });
      await page.mouse.click(5, 5);
      await douchette(page, '04252614');
      await douchette(page, '04252614');
      await expect.poll(() => ligne.locator('input[type="number"]').inputValue(), { timeout: 15_000 }).toBe('2');
      await capture(page, 'comptage-douchette');
    } finally {
      await capture(page, 'fin-5');
      await page.context().close();
    }
  }, 180_000);

  for (const cas of [
    { format: 'UPCE' as const, code: '04252614', produit: 'Piles AA' },
    { format: 'EAN13' as const, code: '3017620422003', produit: 'Pâte à tartiner' },
  ]) {
    it(`Caméra sans lecteur natif (iPhone, ordinateur) : ${cas.format} lu à la caisse, compté une seule fois`, async () => {
      const video = await videoDuCode(cas.format, cas.code);
      const cam = await chromium.launch({
        executablePath: CHROME,
        headless: true,
        timeout: 60_000,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
      });
      try {
        const page = await connecte(cam);
        await page.addInitScript(() => {
          delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
        });
        await page.goto(`${FRONT}/commandes/nouvelle`);
        await page.getByText(cas.produit).first().waitFor({ timeout: 60_000 });
        expect(await page.evaluate(() => 'BarcodeDetector' in window)).toBe(false);
        await page.click('#btn-open-scanner');
        await page.getByText('1 dans le panier').waitFor({ timeout: 45_000 });
        await expect(page.getByText(cas.produit).last()).toBeTruthy();
        await capture(page, `camera-${cas.format}`);
        // L'étiquette reste devant la caméra 4 secondes : toujours 1 article.
        await page.waitForTimeout(4_000);
        await page.click('#btn-scanner-finish');
        await page.getByText('1 article').first().waitFor({ timeout: 10_000 });
        expect(await page.getByText('2 articles').count()).toBe(0);
      } finally {
        // Un Chrome qui ne se ferme pas ne doit pas bloquer toute la suite.
        await Promise.race([cam.close(), new Promise((r) => setTimeout(r, 15_000))]);
      }
    }, 240_000);
  }
});
