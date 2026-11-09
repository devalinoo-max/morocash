/**
 * Le filtre de période, partagé par tous les écrans qui en ont un.
 *
 * Avant ce fichier, Commandes, Dépenses, Rapports et Clients avaient chacun
 * ses propres raccourcis, ses propres bornes et son propre libellé : « 7 jours »
 * ne couvrait pas les mêmes jours d'un écran à l'autre, et « Ce mois » était le
 * dernier choix possible — impossible de demander deux dates. Un seul jeu de
 * raccourcis vit ici, avec les règles qui vont avec (bornes inversées remises
 * dans l'ordre, période plafonnée à 12 mois, choix gardé jusqu'au soir).
 *
 * Les dates personnalisées voyagent en AAAA-MM-JJ, la valeur d'un
 * <input type="date"> : c'est un jour du calendrier du commerçant, pas un
 * instant, et le passer en Date ou en ISO le décalerait d'un fuseau.
 */

export type PeriodShortcut =
  | 'today'
  | 'yesterday'
  | '7days'
  | '30days'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

/** Les puces, dans l'ordre d'affichage. « Personnalisé » ouvre la feuille de dates. */
export const PERIOD_SHORTCUTS: { id: PeriodShortcut; label: string }[] = [
  { id: 'today', label: "Aujourd'hui" },
  { id: 'yesterday', label: 'Hier' },
  { id: '7days', label: '7 jours' },
  { id: '30days', label: '30 jours' },
  { id: 'thisMonth', label: 'Ce mois' },
  { id: 'lastMonth', label: 'Mois dernier' },
  { id: 'custom', label: 'Personnalisé' },
];

/** Au-delà, l'écran refuse : une année de lignes est déjà plus qu'on ne lit. */
export const MAX_PERIOD_MONTHS = 12;

export const PERIOD_TOO_LONG_MESSAGE = 'Choisis une période de 12 mois maximum.';

/** Le choix du commerçant : un raccourci, et deux dates quand c'est « Personnalisé ». */
export interface PeriodSelection {
  shortcut: PeriodShortcut;
  /** AAAA-MM-JJ. Ignorés hors « custom ». */
  customStart?: string;
  customEnd?: string;
}

/** Ce que l'écran filtre réellement : deux instants, et de quoi l'écrire en haut. */
export interface ResolvedPeriod {
  start: Date;
  end: Date;
  /** « Aujourd'hui », « Mois dernier », « Du 1er sept. au 15 oct. 2026 ». */
  label: string;
}

export const DEFAULT_PERIOD: PeriodSelection = { shortcut: 'today' };

export const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const addDays = (d: Date, days: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** « 2026-09-01 » → 1er septembre 2026 à 00:00 locale, ou null si illisible. */
export function parseDayValue(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  // Rejette le 31 février, que Date aurait silencieusement glissé au 3 mars.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Date locale → « AAAA-MM-JJ », sans passer par UTC. */
export function toDayValue(d: Date): string {
  const mois = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mois}-${jour}`;
}

/**
 * Les deux dates remises dans l'ordre. Une fin avant le début est une faute de
 * frappe ordinaire : on l'échange sans rien dire, plutôt que d'afficher une
 * erreur pour une intention parfaitement claire.
 */
export function normalizeCustomRange(
  startValue: string | undefined,
  endValue: string | undefined
): { start: Date; end: Date; startValue: string; endValue: string } | null {
  const a = parseDayValue(startValue);
  const b = parseDayValue(endValue);
  if (!a || !b) return null;
  const from = a <= b ? a : b;
  const to = a <= b ? b : a;
  return { start: from, end: to, startValue: toDayValue(from), endValue: toDayValue(to) };
}

/**
 * Plus de 12 mois ? On compare au même jour 12 mois plus tard : du 1er janvier
 * au 31 décembre fait douze mois pile et passe, le 1er janvier suivant non.
 */
export function exceedsMaxSpan(start: Date, end: Date): boolean {
  const limit = new Date(start.getFullYear(), start.getMonth() + MAX_PERIOD_MONTHS, start.getDate());
  return startOfDay(end).getTime() >= startOfDay(limit).getTime();
}

const MOIS_COURTS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/** « 1er sept. » — le premier du mois se dit « 1er », jamais « 1 ». */
function jourEtMois(d: Date): string {
  const jour = d.getDate() === 1 ? '1er' : String(d.getDate());
  return `${jour} ${MOIS_COURTS[d.getMonth()]}`;
}

/**
 * « Du 1er sept. au 15 oct. 2026 » : l'année ne s'écrit qu'une fois quand les
 * deux bornes la partagent, et un seul jour se dit « Le 15 oct. 2026 ».
 */
export function formatRangeLabel(start: Date, end: Date): string {
  if (startOfDay(start).getTime() === startOfDay(end).getTime()) {
    return `Le ${jourEtMois(start)} ${start.getFullYear()}`;
  }
  if (start.getFullYear() === end.getFullYear()) {
    return `Du ${jourEtMois(start)} au ${jourEtMois(end)} ${end.getFullYear()}`;
  }
  return `Du ${jourEtMois(start)} ${start.getFullYear()} au ${jourEtMois(end)} ${end.getFullYear()}`;
}

/**
 * Le choix du commerçant transformé en intervalle. « 7 jours » inclut
 * aujourd'hui (J-6 à J, sept jours pleins), comme « 30 jours » (J-29 à J).
 *
 * Un « Personnalisé » sans dates lisibles retombe sur la journée en cours
 * plutôt que de produire un intervalle invalide : toute comparaison avec une
 * date invalide est fausse, et l'écran se viderait sans rien expliquer.
 */
export function resolvePeriod(selection: PeriodSelection, now: Date = new Date()): ResolvedPeriod {
  const today = startOfDay(now);

  switch (selection.shortcut) {
    case 'yesterday': {
      const y = addDays(today, -1);
      return { start: startOfDay(y), end: endOfDay(y), label: 'Hier' };
    }
    case '7days':
      return { start: startOfDay(addDays(today, -6)), end: endOfDay(now), label: '7 derniers jours' };
    case '30days':
      return { start: startOfDay(addDays(today, -29)), end: endOfDay(now), label: '30 derniers jours' };
    case 'thisMonth':
      return {
        start: new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0),
        end: endOfDay(now),
        label: 'Ce mois',
      };
    case 'lastMonth': {
      const premier = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const dernier = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: startOfDay(premier), end: endOfDay(dernier), label: 'Mois dernier' };
    }
    case 'custom': {
      const plage = normalizeCustomRange(selection.customStart, selection.customEnd);
      if (!plage) return { start: today, end: endOfDay(now), label: "Aujourd'hui" };
      return {
        start: startOfDay(plage.start),
        end: endOfDay(plage.end),
        label: formatRangeLabel(plage.start, plage.end),
      };
    }
    default:
      return { start: today, end: endOfDay(now), label: "Aujourd'hui" };
  }
}

/** Nombre de jours pleins couverts, bornes incluses. */
export function countDays(period: ResolvedPeriod): number {
  const jours = (startOfDay(period.end).getTime() - startOfDay(period.start).getTime()) / 86_400_000;
  return Math.round(jours) + 1;
}

/**
 * Période équivalente juste avant, pour les comparaisons. Un mois civil se
 * compare au mois civil précédent ; une plage libre, au même nombre de jours
 * qui la précède.
 */
export function previousPeriod(selection: PeriodSelection, period: ResolvedPeriod): ResolvedPeriod {
  if (selection.shortcut === 'thisMonth' || selection.shortcut === 'lastMonth') {
    const premier = new Date(period.start.getFullYear(), period.start.getMonth() - 1, 1);
    const dernier = new Date(period.start.getFullYear(), period.start.getMonth(), 0);
    return { start: startOfDay(premier), end: endOfDay(dernier), label: 'le mois précédent' };
  }
  const jours = countDays(period);
  const fin = addDays(startOfDay(period.start), -1);
  const debut = addDays(startOfDay(period.start), -jours);
  return { start: startOfDay(debut), end: endOfDay(fin), label: 'la période précédente' };
}

export function isWithinPeriod(date: string | Date, period: ResolvedPeriod): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return false;
  return d >= period.start && d <= period.end;
}

// ─────────────── Le choix gardé d'un écran à l'autre ───────────────

/**
 * Le filtre survit à une sortie d'écran, pas à la nuit : le lendemain matin, un
 * commerçant veut sa journée, pas celle d'hier qu'il regardait au moment de
 * fermer l'app. Le jour du choix est donc rangé avec lui, et un jour qui n'est
 * plus le bon fait repartir sur « Aujourd'hui ».
 */
const STORAGE_PREFIX = 'morocash_period_v1:';

interface StoredPeriod {
  jour: string;
  selection: PeriodSelection;
}

export function loadPeriodSelection(screenKey: string, now: Date = new Date()): PeriodSelection {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + screenKey);
    if (!raw) return DEFAULT_PERIOD;
    const stored = JSON.parse(raw) as StoredPeriod;
    if (!stored || stored.jour !== toDayValue(now)) return DEFAULT_PERIOD;
    const shortcut = stored.selection?.shortcut;
    if (!PERIOD_SHORTCUTS.some((s) => s.id === shortcut)) return DEFAULT_PERIOD;
    return stored.selection;
  } catch {
    // Stockage indisponible (navigation privée, quota) : on repart du jour même.
    return DEFAULT_PERIOD;
  }
}

export function savePeriodSelection(
  screenKey: string,
  selection: PeriodSelection,
  now: Date = new Date()
): void {
  try {
    const stored: StoredPeriod = { jour: toDayValue(now), selection };
    localStorage.setItem(STORAGE_PREFIX + screenKey, JSON.stringify(stored));
  } catch {
    // Rien à sauver vaut mieux que planter l'écran : le filtre repartira du jour.
  }
}
