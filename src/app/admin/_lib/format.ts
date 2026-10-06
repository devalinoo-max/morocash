import type { SubPeriod } from './types';

// Libellés partagés par les pages du back-office.

/** Pays proposés à l'inscription (voir SUPPORTED_COUNTRIES dans register.ts). */
export const COUNTRY_LABELS: Record<string, string> = {
  CI: 'Côte d’Ivoire',
  SN: 'Sénégal',
  BJ: 'Bénin',
  TG: 'Togo',
  ML: 'Mali',
  BF: 'Burkina Faso',
};

export function countryLabel(code: string): string {
  return COUNTRY_LABELS[code] ?? code;
}

/** Durée seule : « 1 mois », « 1 an »… */
export const PERIOD_LABELS: Record<SubPeriod, string> = {
  MENSUEL: '1 mois',
  TRIMESTRIEL: '3 mois',
  SEMESTRIEL: '6 mois',
  ANNUEL: '1 an',
};

/** Suffixe de prix : « /mois », « /an »… */
const PERIOD_SUFFIX: Record<SubPeriod, string> = {
  MENSUEL: '/mois',
  TRIMESTRIEL: '/3 mois',
  SEMESTRIEL: '/6 mois',
  ANNUEL: '/an',
};

export const METHOD_LABELS: Record<string, string> = {
  ORANGE_MONEY: 'Orange Money',
  MTN: 'MTN MoMo',
  MOOV: 'Moov Money',
  WAVE: 'Wave',
  VIREMENT: 'Virement',
  ESPECES: 'Espèces',
};

export function formatAmount(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} F`;
}

/** « Solo — 9 900 F/mois », « Business — 199 000 F/an ». */
export function formatOffer(formule: string, montant: number, periode: SubPeriod): string {
  return `${formule} — ${formatAmount(montant)}${PERIOD_SUFFIX[periode]}`;
}

/** « mme koné » → « Mme Koné » : majuscule en tête de chaque mot. */
export function capitalizeName(nom: string): string {
  return nom.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/** « 79HC9M · Mme Koné », ou le code seul si l'affilié n'a pas encore donné son nom. */
export function affiliateLabel(affiliate: { code: string; nom: string | null }): string {
  return affiliate.nom ? `${affiliate.code} · ${capitalizeName(affiliate.nom)}` : affiliate.code;
}

/** Opérateurs mobile money d'un retrait d'affilié. */
export const PAYOUT_OPERATOR_LABELS: Record<string, string> = {
  ORANGE_MONEY: 'Orange Money',
  MTN: 'MTN MoMo',
  WAVE: 'Wave',
  MOOV: 'Moov Money',
};
