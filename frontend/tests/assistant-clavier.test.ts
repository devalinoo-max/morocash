import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chromium, type Browser, type Page } from 'playwright-core';

/**
 * L'assistant d'aide sur téléphone, clavier ouvert, dans un vrai navigateur.
 *
 * Le reproche du commerçant : une fois l'assistant ouvert, il prend tout
 * l'écran et on ne peut plus le fermer tant que le clavier est là. Deux règles
 * sont vérifiées ici :
 *   1. ouvrir l'assistant n'ouvre pas le clavier (pas de focus automatique) ;
 *   2. clavier ouvert, le panneau reste au-dessus du clavier, sa croix de
 *      fermeture est visible et cliquable, et un morceau du fond reste
 *      touchable pour fermer d'un appui à côté.
 *
 * Le clavier est simulé (voir tests/ecran/fauxClavier.ts) : un navigateur
 * piloté n'en ouvre pas de vrai.
 *
 * Sans Chrome ni Edge sur la machine, la suite est ignorée (et le dit).
 */

const ici = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(ici, '..');

const CHROME_CANDIDATS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => Boolean(p));
const chrome = CHROME_CANDIDATS.find((p) => fs.existsSync(p));

const TELEPHONES = [
  { nom: 'petit téléphone 320×568', width: 320, height: 568, clavier: 260 },
  { nom: 'téléphone 360×640', width: 360, height: 640, clavier: 290 },
  { nom: 'téléphone 390×844', width: 390, height: 844, clavier: 336 },
];

interface EtatPanneau {
  /** Le panneau est-il affiché ? */
  ouvert: boolean;
  /** Bord bas du panneau, en pixels depuis le haut de la page. */
  bas: number;
  /** Bord haut du panneau. */
  haut: number;
  /** Hauteur de la zone visible (page moins clavier). */
  zoneVisible: number;
  /** La croix de fermeture est-elle entièrement dans la zone visible ? */
  croixVisible: boolean;
  /** Un clic au centre de la croix atteint-il bien la croix ? */
  croixCliquable: boolean;
  /** Le champ de saisie a-t-il le focus ? */
  champFocus: boolean;
  /** Le fond semi-transparent est-il touchable au-dessus du panneau ? */
  fondTouchable: boolean;
}

async function lireEtat(page: Page, clavier: number): Promise<EtatPanneau> {
  return page.evaluate((hauteurClavier) => {
    const zoneVisible = window.innerHeight - hauteurClavier;
    const panneau = document.querySelector<HTMLElement>('[role="dialog"]');
    const croix = document.querySelector<HTMLElement>('[aria-label="Fermer l’assistant"]');
    const champ = document.querySelector<HTMLInputElement>('[aria-label="Ta question"]');
    if (!panneau) {
      return {
        ouvert: false,
        bas: 0,
        haut: 0,
        zoneVisible,
        croixVisible: false,
        croixCliquable: false,
        champFocus: false,
        fondTouchable: false,
      };
    }
    const rp = panneau.getBoundingClientRect();
    const rc = croix?.getBoundingClientRect();
    const croixVisible = Boolean(rc && rc.top >= -0.5 && rc.bottom <= zoneVisible + 0.5 && rc.height > 0);
    const dessus = rc ? document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2) : null;
    const croixCliquable = Boolean(croix && dessus && (dessus === croix || croix.contains(dessus)));
    // 20 px au-dessus du panneau : on doit y toucher le fond, pas le panneau.
    const auDessus = rp.top > 20 ? document.elementFromPoint(window.innerWidth / 2, rp.top - 20) : null;
        return {
      ouvert: true,
      bas: rp.bottom,
      haut: rp.top,
      zoneVisible,
      croixVisible,
      croixCliquable,
      champFocus: Boolean(champ && document.activeElement === champ),
      fondTouchable: Boolean(auDessus && auDessus !== panneau && !panneau.contains(auDessus)),
    };
  }, clavier);
}

describe.skipIf(!chrome)('Assistant d’aide, clavier ouvert — dans un vrai navigateur', () => {
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
    base = `http://localhost:${typeof adresse === 'object' && adresse ? adresse.port : 5175}`;
    browser = await chromium.launch({ executablePath: chrome, headless: true });
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  }, 60_000);

  async function ouvrirAssistant(ecran: { width: number; height: number }): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: ecran.width, height: ecran.height } });
    await page.goto(`${base}/?ecran=assistant`);
    await page.waitForSelector('#btn-help-assistant', { timeout: 60_000 });
    await page.click('#btn-help-assistant');
    await page.waitForSelector('[role="dialog"]', { timeout: 10_000 });
    return page;
  }

  for (const ecran of TELEPHONES) {
    it(`${ecran.nom} : ouvrir n'ouvre pas le clavier, et la croix reste atteignable`, async () => {
      const page = await ouvrirAssistant(ecran);
      try {
        // 1. Le clavier ne s'ouvre pas tout seul.
        const repos = await lireEtat(page, 0);
        expect(repos.champFocus, `${ecran.nom} : le champ prend le focus, le clavier s'ouvre tout seul`).toBe(false);
        expect(repos.croixVisible, `${ecran.nom} : la croix de fermeture sort de l'écran`).toBe(true);
        expect(repos.croixCliquable, `${ecran.nom} : la croix est recouverte`).toBe(true);
        expect(repos.fondTouchable, `${ecran.nom} : le panneau couvre tout, pas de fond à toucher`).toBe(true);

        // 2. Le commerçant touche le champ : le clavier s'ouvre.
        await page.click('[aria-label="Ta question"]');
        await page.evaluate((px) => (window as unknown as { simulerClavier(px: number): void }).simulerClavier(px), ecran.clavier);
        await page.waitForTimeout(400);

        const avecClavier = await lireEtat(page, ecran.clavier);
        expect(avecClavier.ouvert, `${ecran.nom} : le panneau a disparu`).toBe(true);
        expect(
          avecClavier.bas,
          `${ecran.nom} : le bas du panneau (${avecClavier.bas}) passe sous le clavier (zone visible ${avecClavier.zoneVisible})`
        ).toBeLessThanOrEqual(avecClavier.zoneVisible + 1);
        expect(avecClavier.haut, `${ecran.nom} : le haut du panneau sort de l'écran`).toBeGreaterThanOrEqual(-0.5);
        expect(avecClavier.croixVisible, `${ecran.nom} : clavier ouvert, la croix n'est plus visible`).toBe(true);
        expect(avecClavier.croixCliquable, `${ecran.nom} : clavier ouvert, la croix est recouverte`).toBe(true);
        expect(avecClavier.fondTouchable, `${ecran.nom} : clavier ouvert, plus rien à toucher pour fermer`).toBe(true);

        // 3. La croix ferme vraiment, clavier toujours ouvert.
        await page.click('[aria-label="Fermer l’assistant"]');
        await page.waitForTimeout(400);
        expect(
          await page.evaluate(() => document.querySelector('[role="dialog"]') === null),
          `${ecran.nom} : la croix n'a pas fermé l'assistant`
        ).toBe(true);

        // 4. Clavier refermé : la bulle revient, sans rien laisser de travers.
        await page.evaluate(() => (window as unknown as { simulerClavier(px: number): void }).simulerClavier(0));
        await page.waitForTimeout(400);
        expect(
          await page.evaluate(() => document.getElementById('btn-help-assistant') !== null),
          `${ecran.nom} : la bulle d'aide n'est pas revenue`
        ).toBe(true);
      } finally {
        await page.close();
      }
    }, 120_000);
  }

  it('ordinateur 1366×768 : le champ garde le focus à l’ouverture', async () => {
    const page = await ouvrirAssistant({ width: 1366, height: 768 });
    try {
      const etat = await lireEtat(page, 0);
      expect(etat.champFocus, 'ordinateur : le champ devrait être prêt à la frappe').toBe(true);
    } finally {
      await page.close();
    }
  }, 120_000);
});
