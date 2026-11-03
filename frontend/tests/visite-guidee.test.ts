/**
 * La visite guidée : ce qui doit rester vrai de ses bulles.
 *
 * Ces tests ne pilotent pas de navigateur. Ils vérifient les règles qu'on peut
 * tenir sans écran — et qui sont précisément celles qui se cassent en silence
 * quand on retouche un texte ou qu'on ajoute une étape :
 *
 *  - une bulle posée sur un champ de saisie n'avance JAMAIS toute seule ;
 *  - aucune bulle ne dépasse 20 mots, aucun titre 5 mots ;
 *  - chaque acte s'ouvre en montrant le bouton, sans changer d'écran ;
 *  - les bulles de prix donnent un exemple chiffré.
 *
 * Le reste de la liste de recette — le voile, le clavier, le 320 px, la
 * rotation, la mémoire côté serveur — demande un vrai navigateur et reste à
 * vérifier à la main.
 */

import { describe, expect, it } from 'vitest';

/** Champ de formulaire simulé : les prédicats testent `instanceof`. */
class FauxInput {
  value = '';
  constructor(valeur = '') {
    this.value = valeur;
  }
}

// Posés AVANT l'import des scénarios : deux conditions d'avance interrogent
// `document`, et les prédicats de validité lisent `HTMLInputElement` au moment
// de l'appel. L'import dynamique plus bas garantit l'ordre.
(globalThis as unknown as Record<string, unknown>).HTMLInputElement = FauxInput;
(globalThis as unknown as Record<string, unknown>).document = {
  querySelector: () => null,
};

const { SCENARIOS, ACTES, INDEX_ACTE_3, BULLE_PAR_ECRAN } = await import(
  '../src/components/tour/scenarios'
);
type Step = (typeof SCENARIOS)['parcours']['steps'][number];

/** Toutes les bulles de tous les scénarios, sans exception. */
const TOUTES: Step[] = Object.values(SCENARIOS).flatMap((s) => s.steps);

/** Compte les mots d'un texte, les marques de gras retirées. */
function mots(texte: string): number {
  return texte
    .replace(/\*\*/g, '')
    .split(/[\s’']+/)
    .map((m) => m.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((m) => m.length > 0).length;
}

function parId(id: string): Step {
  const trouve = TOUTES.find((s) => s.id === id);
  if (!trouve) throw new Error(`Bulle introuvable : ${id}`);
  return trouve;
}

describe('les textes', () => {
  it('aucune bulle ne dépasse 20 mots', () => {
    const trop = TOUTES.filter((s) => mots(s.texte) > 20).map(
      (s) => `${s.id} (${mots(s.texte)} mots)`
    );
    expect(trop).toEqual([]);
  });

  it('aucun titre ne dépasse 5 mots', () => {
    const trop = TOUTES.filter((s) => s.titre && mots(s.titre) > 5).map(
      (s) => `${s.id} (${mots(s.titre!)} mots)`
    );
    expect(trop).toEqual([]);
  });

  it('la bulle de l’icône Aide parle de l’assistant et des questions', () => {
    const aide = parId('accueil-aide');
    expect(aide.texte).toMatch(/assistant/i);
    expect(aide.texte).toMatch(/question/i);
  });

  it('les bulles de prix donnent toutes un exemple chiffré', () => {
    for (const id of ['produit-prix-vente', 'produit-prix-achat']) {
      expect(parId(id).texte, id).toMatch(/\d{3,}/);
    }
  });

  it('la bulle du prix d’achat dit le format attendu', () => {
    expect(parId('produit-prix-achat').texte).toMatch(/sans espace/i);
  });

  it('chaque marque de gras est bien fermée', () => {
    for (const s of TOUTES) {
      const marques = (s.texte.match(/\*\*/g) ?? []).length;
      expect(marques % 2, `${s.id} : ${s.texte}`).toBe(0);
    }
  });
});

describe('comment une bulle avance', () => {
  it('une bulle « Remplis » n’avance jamais toute seule', () => {
    const fautives = TOUTES.filter(
      (s) =>
        s.kind === 'remplis' && (s.passeQuand !== undefined || s.passeQuandVisible !== undefined)
    ).map((s) => s.id);
    expect(fautives).toEqual([]);
  });

  it('une bulle « Remplis » sait dire si son champ est valide', () => {
    const remplis = TOUTES.filter((s) => s.kind === 'remplis');
    expect(remplis.length).toBeGreaterThan(0);
    for (const s of remplis) expect(s.valide, s.id).toBeTypeOf('function');
  });

  it('une bulle « Regarde » n’avance pas toute seule non plus', () => {
    const fautives = TOUTES.filter(
      (s) =>
        s.kind === 'regarde' && (s.passeQuand !== undefined || s.passeQuandVisible !== undefined)
    ).map((s) => s.id);
    expect(fautives).toEqual([]);
  });

  it('une bulle « Appuie » porte toujours une condition d’avance', () => {
    const appuie = TOUTES.filter((s) => s.kind === 'appuie');
    expect(appuie.length).toBeGreaterThan(0);
    for (const s of appuie) {
      expect(
        s.passeQuand !== undefined || s.passeQuandVisible !== undefined,
        `${s.id} n’a aucune condition : la visite s’y arrêterait pour toujours`
      ).toBe(true);
    }
  });

  it('une bulle « Appuie » ne porte pas de libellé de bouton', () => {
    // Elle n'en affiche pas : un libellé ici serait du texte mort.
    const fautives = TOUTES.filter((s) => s.kind === 'appuie' && s.bouton !== undefined).map(
      (s) => s.id
    );
    expect(fautives).toEqual([]);
  });
});

describe('la validité d’un champ', () => {
  const nom = parId('produit-nom').valide!;
  const prix = parId('produit-prix-achat').valide!;

  it('champ vide : le bouton reste gris', () => {
    expect(nom(new FauxInput('') as unknown as Element)).toBe(false);
  });

  it('une seule lettre ne suffit pas', () => {
    expect(nom(new FauxInput('S') as unknown as Element)).toBe(false);
  });

  it('deux lettres suffisent', () => {
    expect(nom(new FauxInput('Sa') as unknown as Element)).toBe(true);
  });

  it('un nom effacé refait passer le bouton au gris', () => {
    expect(nom(new FauxInput('Sac à main') as unknown as Element)).toBe(true);
    expect(nom(new FauxInput('') as unknown as Element)).toBe(false);
  });

  it('un montant nul ne vaut pas un montant', () => {
    expect(prix(new FauxInput('0') as unknown as Element)).toBe(false);
    expect(prix(new FauxInput('') as unknown as Element)).toBe(false);
  });

  it('3500 est un montant valide, espaces compris', () => {
    expect(prix(new FauxInput('3500') as unknown as Element)).toBe(true);
    expect(prix(new FauxInput('3 500') as unknown as Element)).toBe(true);
  });

  it('un champ absent ne rend jamais le bouton actif', () => {
    expect(nom(null)).toBe(false);
    expect(prix(null)).toBe(false);
  });
});

describe('le chemin', () => {
  it('l’acte 1 commence par montrer le chemin, pas par ouvrir l’écran', () => {
    const premiere = ACTES.ACTE_1[0];
    expect(premiere.kind).toBe('appuie');
    expect(premiere.target).toContain('nav-produits');
  });

  it('chaque acte s’ouvre sur une bulle « Appuie »', () => {
    expect(ACTES.ACTE_1[0].kind).toBe('appuie');
    expect(ACTES.ACTE_2[0].kind).toBe('appuie');
    expect(ACTES.ACTE_3[0].kind).toBe('appuie');
  });

  it('aucune bulle n’ouvre un écran toute seule', () => {
    // `prepare` ne sert plus qu'à refermer un reçu. Une bulle qui appellerait
    // `ouvrirEcran` téléporterait le commerçant au lieu de lui montrer le
    // chemin — et il n'apprendrait jamais où appuyer la prochaine fois.
    const vus: string[] = [];
    const app = {
      nbProduits: 0,
      nbVentes: 0,
      nbArticlesPanier: 0,
      venteOuverte: false,
      produitOuvert: false,
      ecran: 'home',
      ouvrirEcran: (tab: string) => vus.push(tab),
      fermerRecu: () => {},
    };
    for (const s of TOUTES) s.prepare?.(app as never);
    expect(vus).toEqual([]);
  });

  it('après « Produit créé », le bouton ramène au tableau de bord', () => {
    const passage = parId('produit-cree');
    expect(passage.bouton).toBe('Continuer');
    const vus: string[] = [];
    passage.action?.({ ouvrirEcran: (tab: string) => vus.push(tab) } as never);
    expect(vus).toEqual(['home']);
  });

  it('l’acte 2 attend que la vente soit ouverte, sans l’ouvrir', () => {
    const bouton = ACTES.ACTE_2[0];
    expect(bouton.passeQuand!({ venteOuverte: false } as never, null)).toBe(false);
    expect(bouton.passeQuand!({ venteOuverte: true } as never, null)).toBe(true);
  });

  it('l’acte 3 attend l’écran des chiffres', () => {
    const chemin = ACTES.ACTE_3[0];
    expect(chemin.passeQuand!({ ecran: 'home' } as never, null)).toBe(false);
    expect(chemin.passeQuand!({ ecran: 'more/reports' } as never, null)).toBe(true);
  });

  it('l’acte 1 attend l’ouverture de la fiche produit', () => {
    const ajouter = ACTES.ACTE_1[1];
    expect(ajouter.kind).toBe('appuie');
    expect(ajouter.passeQuand!({ produitOuvert: false } as never, null)).toBe(false);
    expect(ajouter.passeQuand!({ produitOuvert: true } as never, null)).toBe(true);
  });
});

describe('la forme du parcours', () => {
  it('les félicitations tombent juste après l’acte 2', () => {
    expect(INDEX_ACTE_3).toBe(ACTES.ACTE_1.length + ACTES.ACTE_2.length);
    expect(SCENARIOS.parcours.steps[INDEX_ACTE_3].id).toBe(ACTES.ACTE_3[0].id);
  });

  it('aucun identifiant de bulle n’est en double', () => {
    const ids = TOUTES.map((s) => s.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('chaque bulle d’écran a bien son scénario', () => {
    for (const id of Object.values(BULLE_PAR_ECRAN)) {
      expect(SCENARIOS[id], id).toBeDefined();
    }
  });
});
