import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_PERIOD,
  PERIOD_SHORTCUTS,
  countDays,
  exceedsMaxSpan,
  formatRangeLabel,
  loadPeriodSelection,
  normalizeCustomRange,
  parseDayValue,
  previousPeriod,
  resolvePeriod,
  savePeriodSelection,
  toDayValue,
} from '../src/utils/periodFilter';

/**
 * Les règles du filtre de période, celles que le commerçant constate sans
 * pouvoir les deviner : ce que couvre « 7 jours », ce qui arrive quand il
 * inverse ses deux dates, ce qu'il retrouve le lendemain matin.
 *
 * Un faux ici ne plante rien : il affiche un total sur la mauvaise période, ce
 * qui est pire qu'une erreur visible.
 */

// Un vendredi, au milieu d'un mois, pour que « mois dernier » ait 30 jours.
const MAINTENANT = new Date(2026, 9, 16, 14, 30); // 16 octobre 2026, 14h30

describe('les raccourcis', () => {
  it("« Aujourd'hui » couvre la journée entière, pas jusqu'à l'heure courante", () => {
    const p = resolvePeriod({ shortcut: 'today' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-10-16');
    expect(p.start.getHours()).toBe(0);
    expect(p.end.getHours()).toBe(23);
    expect(countDays(p)).toBe(1);
  });

  it('« Hier » ne couvre qu\'hier', () => {
    const p = resolvePeriod({ shortcut: 'yesterday' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-10-15');
    expect(toDayValue(p.end)).toBe('2026-10-15');
    expect(p.label).toBe('Hier');
  });

  it('« 7 jours » fait sept jours pleins, aujourd\'hui compris', () => {
    const p = resolvePeriod({ shortcut: '7days' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-10-10');
    expect(toDayValue(p.end)).toBe('2026-10-16');
    expect(countDays(p)).toBe(7);
  });

  it('« 30 jours » fait trente jours pleins, aujourd\'hui compris', () => {
    const p = resolvePeriod({ shortcut: '30days' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-09-17');
    expect(countDays(p)).toBe(30);
  });

  it('« Ce mois » part du 1er et s\'arrête aujourd\'hui, pas à la fin du mois', () => {
    const p = resolvePeriod({ shortcut: 'thisMonth' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-10-01');
    expect(toDayValue(p.end)).toBe('2026-10-16');
  });

  it('« Mois dernier » couvre le mois civil complet', () => {
    const p = resolvePeriod({ shortcut: 'lastMonth' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-09-01');
    expect(toDayValue(p.end)).toBe('2026-09-30');
    expect(countDays(p)).toBe(30);
  });

  it('propose bien les sept puces de la spec, « Personnalisé » en dernier', () => {
    expect(PERIOD_SHORTCUTS.map((s) => s.id)).toEqual([
      'today',
      'yesterday',
      '7days',
      '30days',
      'thisMonth',
      'lastMonth',
      'custom',
    ]);
  });
});

describe('la période personnalisée', () => {
  it('B2 — ne garde que la période demandée', () => {
    const p = resolvePeriod(
      { shortcut: 'custom', customStart: '2026-09-01', customEnd: '2026-10-15' },
      MAINTENANT
    );
    expect(toDayValue(p.start)).toBe('2026-09-01');
    expect(toDayValue(p.end)).toBe('2026-10-15');
    expect(p.label).toBe('Du 1er sept. au 15 oct. 2026');
  });

  it('B3 — une fin avant le début est échangée, sans message d\'erreur', () => {
    const plage = normalizeCustomRange('2026-10-15', '2026-09-01');
    expect(plage).not.toBeNull();
    expect(plage!.startValue).toBe('2026-09-01');
    expect(plage!.endValue).toBe('2026-10-15');

    // Et l'écran affiche la même chose que si les dates avaient été saisies
    // dans le bon ordre : rien ne trahit l'inversion.
    const inverse = resolvePeriod(
      { shortcut: 'custom', customStart: '2026-10-15', customEnd: '2026-09-01' },
      MAINTENANT
    );
    expect(inverse.label).toBe('Du 1er sept. au 15 oct. 2026');
  });

  it('B4 — douze mois pile passent, trois ans sont refusés', () => {
    expect(exceedsMaxSpan(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(false);
    expect(exceedsMaxSpan(new Date(2026, 0, 1), new Date(2027, 0, 1))).toBe(true);
    expect(exceedsMaxSpan(new Date(2024, 0, 1), new Date(2026, 11, 31))).toBe(true);
  });

  it('une date vide ou illisible retombe sur le jour même au lieu de tout vider', () => {
    expect(parseDayValue('')).toBeNull();
    expect(parseDayValue('2026-02-31')).toBeNull();
    expect(parseDayValue('15/10/2026')).toBeNull();

    const p = resolvePeriod({ shortcut: 'custom', customStart: '', customEnd: '' }, MAINTENANT);
    expect(toDayValue(p.start)).toBe('2026-10-16');
    expect(p.label).toBe("Aujourd'hui");
  });

  it('écrit le 1er du mois « 1er », et une seule fois l\'année partagée', () => {
    expect(formatRangeLabel(new Date(2026, 8, 1), new Date(2026, 9, 15))).toBe(
      'Du 1er sept. au 15 oct. 2026'
    );
    expect(formatRangeLabel(new Date(2025, 11, 20), new Date(2026, 0, 5))).toBe(
      'Du 20 déc. 2025 au 5 janv. 2026'
    );
    expect(formatRangeLabel(new Date(2026, 9, 15), new Date(2026, 9, 15))).toBe('Le 15 oct. 2026');
  });
});

describe('la période précédente, pour les comparaisons', () => {
  it('compare un mois civil au mois civil d\'avant', () => {
    const selection = { shortcut: 'lastMonth' as const };
    const p = resolvePeriod(selection, MAINTENANT);
    const avant = previousPeriod(selection, p);
    expect(toDayValue(avant.start)).toBe('2026-08-01');
    expect(toDayValue(avant.end)).toBe('2026-08-31');
  });

  it('compare une plage libre au même nombre de jours juste avant', () => {
    const selection = {
      shortcut: 'custom' as const,
      customStart: '2026-09-01',
      customEnd: '2026-09-14',
    };
    const p = resolvePeriod(selection, MAINTENANT);
    const avant = previousPeriod(selection, p);
    expect(countDays(avant)).toBe(14);
    expect(toDayValue(avant.end)).toBe('2026-08-31');
    expect(toDayValue(avant.start)).toBe('2026-08-18');
  });
});

describe('le choix gardé d\'un écran à l\'autre', () => {
  // L'environnement des tests est Node : on lui donne le minimum de
  // localStorage dont le module se sert.
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('B5 — on quitte l\'écran et on revient : le filtre est toujours là', () => {
    const choix = { shortcut: 'custom' as const, customStart: '2026-09-01', customEnd: '2026-10-15' };
    savePeriodSelection('commandes', choix, MAINTENANT);
    expect(loadPeriodSelection('commandes', MAINTENANT)).toEqual(choix);
  });

  it('B6 — le lendemain, le filtre est revenu sur « Aujourd\'hui »', () => {
    savePeriodSelection('commandes', { shortcut: 'lastMonth' }, MAINTENANT);
    const lendemain = new Date(2026, 9, 17, 8, 0);
    expect(loadPeriodSelection('commandes', lendemain)).toEqual(DEFAULT_PERIOD);
  });

  it('chaque écran garde son propre filtre', () => {
    savePeriodSelection('commandes', { shortcut: 'lastMonth' }, MAINTENANT);
    expect(loadPeriodSelection('depenses', MAINTENANT)).toEqual(DEFAULT_PERIOD);
    expect(loadPeriodSelection('commandes', MAINTENANT).shortcut).toBe('lastMonth');
  });

  it('un contenu abîmé en mémoire ne casse pas l\'écran', () => {
    localStorage.setItem('morocash_period_v1:commandes', '{pas du json');
    expect(loadPeriodSelection('commandes', MAINTENANT)).toEqual(DEFAULT_PERIOD);

    localStorage.setItem(
      'morocash_period_v1:commandes',
      JSON.stringify({ jour: toDayValue(MAINTENANT), selection: { shortcut: 'ce-mois-la' } })
    );
    expect(loadPeriodSelection('commandes', MAINTENANT)).toEqual(DEFAULT_PERIOD);
  });
});
