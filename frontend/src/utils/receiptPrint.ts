/**
 * Formats d'impression des reçus — tout ce qui se décide sans écran.
 *
 * Ce fichier est importé à la fois par l'application et par le générateur PDF
 * du serveur : la mise en page choisie à l'aperçu et celle du PDF sortent donc
 * de la même règle. Il ne doit dépendre ni du DOM ni de Node.
 *
 * Toutes les dimensions sont en millimètres. L'unité choisie par le commerçant
 * (cm, pouces) n'est qu'un confort d'affichage.
 */

export type ReceiptPrintFormat = '58' | '80' | 'A5' | 'A4' | 'CUSTOM';
export type PrintUnit = 'mm' | 'cm' | 'po';

export interface SavedPrintSize {
  nom: string;
  largeurMm: number;
  /** null = hauteur automatique (ticket qui s'allonge avec les articles). */
  hauteurMm: number | null;
}

/** Ce que le serveur reçoit : une taille de page, rien d'autre. */
export interface PrintPageSpec {
  largeurMm: number;
  hauteurMm: number | null;
}

export const STANDARD_FORMATS: {
  id: Exclude<ReceiptPrintFormat, 'CUSTOM'>;
  label: string;
  aide: string;
  page: PrintPageSpec;
}[] = [
  { id: '58', label: 'Ticket 58 mm', aide: 'Imprimante Bluetooth de poche', page: { largeurMm: 58, hauteurMm: null } },
  { id: '80', label: 'Ticket 80 mm', aide: 'Imprimante de caisse', page: { largeurMm: 80, hauteurMm: null } },
  { id: 'A5', label: 'A5', aide: 'Moitié d’une feuille', page: { largeurMm: 148, hauteurMm: 210 } },
  { id: 'A4', label: 'A4', aide: 'Feuille entière', page: { largeurMm: 210, hauteurMm: 297 } },
];

export const DEFAULT_PRINT_FORMAT: ReceiptPrintFormat = '58';
export const MAX_SAVED_SIZES = 3;
export const MIN_WIDTH_MM = 30;
export const MAX_WIDTH_MM = 250;
/** En dessous, les noms longs passent sur deux lignes : on prévient sans bloquer. */
export const NARROW_WARNING_MM = 50;

/** Marge totale retirée à la largeur du papier (4 mm de chaque côté). */
export const PRINT_MARGIN_MM = 8;

export type ReceiptLayout = 'ETROIT' | 'MOYEN' | 'LARGE';

/**
 * La mise en page découle de la largeur imprimable, jamais d'un réglage :
 *   moins de 60 mm  → ticket étroit, chasse fixe, une colonne
 *   60 à 100 mm     → ticket de caisse, deux colonnes
 *   plus de 100 mm  → document aéré, tableau à filets
 * 58 mm (48 imprimables) tombe en ÉTROIT, 80 mm (72) en MOYEN, A5/A4 en LARGE.
 */
export function layoutForWidth(largeurMm: number): ReceiptLayout {
  const imprimable = largeurMm - PRINT_MARGIN_MM;
  if (imprimable < 60) return 'ETROIT';
  if (imprimable <= 100) return 'MOYEN';
  return 'LARGE';
}

export function pageForStandard(format: Exclude<ReceiptPrintFormat, 'CUSTOM'>): PrintPageSpec {
  return STANDARD_FORMATS.find((f) => f.id === format)!.page;
}

const MM_PER_UNIT: Record<PrintUnit, number> = { mm: 1, cm: 10, po: 25.4 };
const DECIMALS: Record<PrintUnit, number> = { mm: 0, cm: 1, po: 2 };

export const UNIT_LABELS: Record<PrintUnit, string> = { mm: 'mm', cm: 'cm', po: 'po' };

export function toMm(value: number, unit: PrintUnit): number {
  return value * MM_PER_UNIT[unit];
}

/** 76 mm → « 76 » ; en cm → « 7,6 » ; en pouces → « 2,99 ». */
export function formatInUnit(mm: number, unit: PrintUnit): string {
  let text = (mm / MM_PER_UNIT[unit]).toFixed(DECIMALS[unit]);
  // Zéros inutiles après la virgule seulement : « 70 » doit rester « 70 ».
  if (text.includes('.')) text = text.replace(/0+$/, '').replace(/\.$/, '');
  return text.replace('.', ',');
}

/** « 7,6 » ou « 7.6 » → 7.6 ; vide ou illisible → null. */
export function parseDimension(text: string): number | null {
  const cleaned = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type SizeCheck =
  | { ok: true; avertissement?: string }
  | { ok: false; erreur: string };

export function checkCustomSize(largeurMm: number | null, hauteurMm: number | null, hauteurSaisie: boolean): SizeCheck {
  if (largeurMm === null) return { ok: false, erreur: 'Indique une largeur.' };
  if (largeurMm < MIN_WIDTH_MM) {
    return { ok: false, erreur: `Largeur trop petite. Le minimum lisible est ${MIN_WIDTH_MM} mm.` };
  }
  if (largeurMm > MAX_WIDTH_MM) {
    return { ok: false, erreur: `Largeur trop grande. Le maximum est ${MAX_WIDTH_MM} mm, la largeur d’une feuille A4.` };
  }
  if (hauteurSaisie && (hauteurMm === null || hauteurMm <= 0)) {
    return { ok: false, erreur: 'Hauteur illisible. Laisse le champ vide pour une hauteur automatique.' };
  }
  if (largeurMm <= NARROW_WARNING_MM) {
    return { ok: true, avertissement: 'À cette largeur, les noms longs seront coupés sur deux lignes.' };
  }
  return { ok: true };
}

/** « 76 × 200 mm » ou « 76 mm · hauteur auto ». */
export function describePage(page: PrintPageSpec): string {
  const l = Math.round(page.largeurMm);
  return page.hauteurMm ? `${l} × ${Math.round(page.hauteurMm)} mm` : `${l} mm · hauteur auto`;
}

export const SIZE_SHORTCUTS: { label: string; largeurMm: number; hauteurMm: number | null }[] = [
  { label: '44 mm', largeurMm: 44, hauteurMm: null },
  { label: '57 mm', largeurMm: 57, hauteurMm: null },
  { label: '76 mm', largeurMm: 76, hauteurMm: null },
  { label: '100 × 150', largeurMm: 100, hauteurMm: 150 },
  { label: 'A6', largeurMm: 105, hauteurMm: 148 },
];

/** Réglages d'impression tels que la boutique les mémorise. */
export interface ReceiptPrintPrefs {
  formatImpression: ReceiptPrintFormat;
  customLargeurMm: number;
  customHauteurMm: number | null;
  customUnite: PrintUnit;
  taillesEnregistrees: SavedPrintSize[];
}

export function readPrintPrefs(saved: Partial<ReceiptPrintPrefs> | undefined): ReceiptPrintPrefs {
  return {
    formatImpression: saved?.formatImpression ?? DEFAULT_PRINT_FORMAT,
    customLargeurMm: saved?.customLargeurMm ?? 76,
    customHauteurMm: saved?.customHauteurMm ?? null,
    customUnite: saved?.customUnite ?? 'mm',
    taillesEnregistrees: (saved?.taillesEnregistrees ?? []).slice(0, MAX_SAVED_SIZES),
  };
}

/** La page que produit le réglage par défaut de la boutique. */
export function pageForPrefs(prefs: ReceiptPrintPrefs): PrintPageSpec {
  if (prefs.formatImpression === 'CUSTOM') {
    return { largeurMm: prefs.customLargeurMm, hauteurMm: prefs.customHauteurMm };
  }
  return pageForStandard(prefs.formatImpression);
}

/**
 * Montant tel qu'un document l'imprime : toujours complet, jamais abrégé.
 * Espace ordinaire (et non insécable) : les polices standard du PDF n'ont pas
 * toutes le glyphe U+00A0.
 */
export function formatMoneyFull(amount: number | undefined | null): string {
  const n = Math.round(Number(amount) || 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}${Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}
