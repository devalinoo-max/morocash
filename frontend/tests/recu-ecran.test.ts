import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { chromium, type Browser, type Page } from 'playwright-core';

/**
 * L'écran du reçu, vérifié dans un vrai navigateur (Chrome sans fenêtre).
 *
 * Les VRAIS composants (fenêtre du reçu après une vente, onglet Mes reçus)
 * sont affichés avec une session fixe, à plusieurs tailles d'écran, du petit
 * téléphone à l'ordinateur portable. On vérifie ce que voit le commerçant :
 * chaque bouton est entièrement à l'écran, rien ne le recouvre, son libellé
 * n'est pas coupé, le total reste lisible et rien ne déborde sur le côté.
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

// Captures d'écran facultatives, pour relire les résultats à l'œil.
const CAPTURES = process.env.RECU_CAPTURES;

const ECRANS = [
  { nom: 'petit téléphone 320×568', width: 320, height: 568 },
  { nom: 'téléphone 360×640', width: 360, height: 640 },
  { nom: 'téléphone 390×844', width: 390, height: 844 },
  { nom: 'tablette 768×1024', width: 768, height: 1024 },
  { nom: 'ordinateur 1366×768', width: 1366, height: 768 },
  { nom: 'ordinateur bas 1280×600', width: 1280, height: 600 },
];

const BOUTONS_RECU = [
  'btn-close-receipt-modal-header',
  'btn-receipt-whatsapp',
  'btn-receipt-print',
  'btn-receipt-download',
  'btn-receipt-copy',
];

interface Verdict {
  id: string;
  present: boolean;
  entierementVisible: boolean;
  recouvert: boolean;
  libelleCoupe: boolean;
}

/** Visible, non recouvert, libellé entier — pour chaque élément demandé. */
async function examiner(page: Page, selecteurs: string[]): Promise<Verdict[]> {
  return page.evaluate((sels) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return sels.map((sel) => {
      const el = (sel.startsWith('#') || sel.startsWith('[') ? document.querySelector(sel) : document.getElementById(sel)) as HTMLElement | null;
      if (!el) return { id: sel, present: false, entierementVisible: false, recouvert: true, libelleCoupe: false };
      const r = el.getBoundingClientRect();
      const entierementVisible = r.width > 0 && r.height > 0 && r.left >= -0.5 && r.top >= -0.5 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5;
      // Cinq points (centre et coins rentrés) : un bouton à moitié caché sous
      // une barre collante échoue même si son centre est libre.
      // Points rentrés de 10 px : un coin arrondi n'appartient pas au bouton
      // pour le navigateur, ce ne serait pas un recouvrement.
      const dx = Math.min(10, r.width / 4);
      const dy = Math.min(10, r.height / 4);
      const points = [
        [r.left + r.width / 2, r.top + r.height / 2],
        [r.left + dx, r.top + dy],
        [r.right - dx, r.top + dy],
        [r.left + dx, r.bottom - dy],
        [r.right - dx, r.bottom - dy],
      ];
      const recouvert = points.some(([x, y]) => {
        const top = document.elementFromPoint(x, y);
        return !top || !(top === el || el.contains(top));
      });
      // Un libellé qui passe sur deux lignes compte aussi comme coupé.
      const surDeuxLignes = Array.from(el.querySelectorAll<HTMLElement>('span')).some((n) => {
        const lh = parseFloat(getComputedStyle(n).lineHeight) || parseFloat(getComputedStyle(n).fontSize) * 1.5;
        return n.textContent!.trim().length > 0 && n.getBoundingClientRect().height > lh * 1.6;
      });
      const libelleCoupe = surDeuxLignes || [el, ...Array.from(el.querySelectorAll<HTMLElement>('span'))].some(
        (n) => n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible'
      );
      return { id: sel, present: true, entierementVisible, recouvert, libelleCoupe };
    });
  }, selecteurs);
}

function attendreToutVisible(verdicts: Verdict[], contexte: string) {
  for (const v of verdicts) {
    expect(v.present, `${contexte} : « ${v.id} » absent`).toBe(true);
    expect(v.entierementVisible, `${contexte} : « ${v.id} » sort de l'écran`).toBe(true);
    expect(v.recouvert, `${contexte} : « ${v.id} » est recouvert par autre chose`).toBe(false);
    expect(v.libelleCoupe, `${contexte} : le libellé de « ${v.id} » est coupé`).toBe(false);
  }
}

async function debordementHorizontal(page: Page): Promise<{ page: boolean; recu: boolean }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const recu = document.querySelector<HTMLElement>('[id^="receipt-view-"]');
    return {
      page: doc.scrollWidth > window.innerWidth + 1,
      recu: recu ? recu.scrollWidth > recu.clientWidth + 1 : true,
    };
  });
}

async function capture(page: Page, nom: string) {
  if (!CAPTURES) return;
  fs.mkdirSync(CAPTURES, { recursive: true });
  await page.screenshot({ path: path.join(CAPTURES, `${nom.replace(/[^a-z0-9]+/gi, '-')}.png`) });
}

describe.skipIf(!chrome)('Reçu à l écran — dans un vrai navigateur', () => {
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
        // Les vrais composants, une session fixe : context/AppContext est
        // remplacé par le faux contexte du banc d'essai.
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

  async function ouvrir(query: string, ecran: { width: number; height: number }): Promise<Page> {
    const page = await browser.newPage({ viewport: { width: ecran.width, height: ecran.height } });
    await page.goto(`${base}/?${query}`);
    await page.waitForSelector('[id^="receipt-view-"], #products-tab-content, table', { timeout: 60_000 });
    // Le QR code se dessine après le premier affichage.
    await page.waitForTimeout(400);
    return page;
  }

  for (const ecran of ECRANS) {
    for (const cas of [
      { nom: '3 articles', query: 'ecran=recu&articles=3' },
      { nom: '30 articles aux noms longs', query: 'ecran=recu&articles=30&noms=longs' },
    ]) {
      it(`${ecran.nom} — ${cas.nom} : boutons visibles, rien de caché, rien ne déborde`, async () => {
        const page = await ouvrir(cas.query, ecran);
        const contexte = `${ecran.nom}, ${cas.nom}`;
        try {
          attendreToutVisible(await examiner(page, BOUTONS_RECU), contexte);

          // Le TOTAL reste lisible sans défiler, même avec 30 articles.
          const total = await page.evaluate(() => {
            const el = Array.from(document.querySelectorAll('span')).find((s) => s.textContent?.trim() === 'TOTAL :');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return { visible: r.top >= 0 && r.bottom <= window.innerHeight, libre: Boolean(top && (top === el || el.contains(top) || top.contains(el))) };
          });
          expect(total, `${contexte} : ligne TOTAL introuvable`).not.toBeNull();
          expect(total!.visible, `${contexte} : le TOTAL n'est pas visible sans défiler`).toBe(true);
          expect(total!.libre, `${contexte} : le TOTAL est recouvert`).toBe(true);

          const deb = await debordementHorizontal(page);
          expect(deb.page, `${contexte} : la page défile sur le côté`).toBe(false);
          expect(deb.recu, `${contexte} : le reçu déborde sur le côté`).toBe(false);

          // Les copies client / commerçant restent atteignables et lisibles.
          const bascules = await page.evaluate(() =>
            Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')).map((b, i) => {
              b.setAttribute('data-bascule', String(i));
              return `[data-bascule="${i}"]`;
            })
          );
          expect(bascules.length, `${contexte} : bascule copie client / commerçant absente`).toBe(2);
          attendreToutVisible(await examiner(page, bascules), `${contexte} (copies)`);

          await page.click('[data-bascule="1"]');
          await expect.poll(() => page.locator('text=au total').count()).toBeGreaterThan(0);
          await capture(page, `${contexte}-commercant`);
        } finally {
          await page.close();
        }
      }, 90_000);
    }

    it(`${ecran.nom} — « Imprimer » ouvre le choix du format, bouton d'impression visible`, async () => {
      const page = await ouvrir('ecran=recu&articles=12', ecran);
      try {
        await page.click('#btn-receipt-print');
        await page.waitForSelector('#print-receipt-title');
        const cible = await page.evaluate(() => {
          const dialog = document.getElementById('print-receipt-title')!.closest('[role="dialog"]')!;
          const boutons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'));
          const imprimer = boutons[boutons.length - 1];
          imprimer.id = 'test-bouton-imprimer';
          return imprimer.textContent ?? '';
        });
        expect(cible).toMatch(/Imprimer/);
        attendreToutVisible(await examiner(page, ['test-bouton-imprimer']), `${ecran.nom}, fenêtre d'impression`);
        await capture(page, `${ecran.nom}-impression`);
      } finally {
        await page.close();
      }
    }, 90_000);

    it(`${ecran.nom} — « Envoyer sur WhatsApp » ouvre le choix du destinataire, entièrement à l'écran`, async () => {
      const page = await ouvrir('ecran=recu&articles=3', ecran);
      try {
        await page.click('#btn-receipt-whatsapp');
        await expect.poll(() => page.locator('[role="dialog"]').count()).toBeGreaterThan(1);
        const fenetre = await page.evaluate(() => {
          const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'));
          const d = dialogs[dialogs.length - 1];
          const r = d.getBoundingClientRect();
          const boutons = Array.from(d.querySelectorAll<HTMLButtonElement>('button')).map((b, i) => {
            b.setAttribute('data-wa', String(i));
            return `[data-wa="${i}"]`;
          });
          return { dansLEcran: r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= window.innerHeight + 0.5, boutons };
        });
        expect(fenetre.dansLEcran, `${ecran.nom} : la fenêtre WhatsApp sort de l'écran`).toBe(true);
        // Le premier choix (le client) doit être visible et cliquable.
        const verdicts = await examiner(page, fenetre.boutons);
        expect(verdicts.some((v) => v.entierementVisible && !v.recouvert), `${ecran.nom} : aucun choix WhatsApp cliquable`).toBe(true);
        await capture(page, `${ecran.nom}-whatsapp`);
      } finally {
        await page.close();
      }
    }, 90_000);
  }

  for (const ecran of ECRANS.filter((e) => e.width >= 768)) {
    it(`${ecran.nom} — Mes reçus : le volet d'aperçu montre le reçu et tous ses boutons`, async () => {
      const page = await ouvrir('ecran=mes-recus&articles=20', ecran);
      try {
        await page.click('button[title="Voir l\'aperçu complet"]');
        await page.waitForSelector('[id^="receipt-view-"]');
        await page.waitForTimeout(300);
        attendreToutVisible(await examiner(page, BOUTONS_RECU), `${ecran.nom}, Mes reçus`);
        const deb = await debordementHorizontal(page);
        expect(deb.recu, `${ecran.nom} : le reçu du volet déborde`).toBe(false);
        await capture(page, `${ecran.nom}-mes-recus`);
      } finally {
        await page.close();
      }
    }, 90_000);
  }
});
