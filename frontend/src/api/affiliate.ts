import { api, ApiError } from './client';
import type { CountryCode } from './auth';

export type AffiliateActivity =
  | { type: 'INSCRIPTION'; date: string; boutique: string; paye: boolean }
  | { type: 'PAIEMENT' | 'RENOUVELLEMENT'; date: string; boutique: string; planCode: string; mois: number; montant: number }
  | { type: 'RETRAIT_DEMANDE' | 'RETRAIT_PAYE'; date: string; montant: number };

export type PayoutOperator = 'ORANGE_MONEY' | 'MTN' | 'WAVE' | 'MOOV';

export interface AffiliateDashboard {
  code: string;
  /** null pour un compte créé avant que le prénom soit demandé. */
  nom: string | null;
  telephone: string;
  pays: string;
  /** Lien public en https, construit par le serveur. */
  lien: string;
  /** Commission par mois payé, par formule, lue dans les réglages du back-office. */
  taux: { planCode: string; montant: number }[];
  /** Durée d'essai d'un compte inscrit avec ce lien (30 + jours offerts). */
  joursEssaiAvecLien: number;
  inscrits: number;
  payants: number;
  solde: number;
  seuilRetrait: number;
  retraitEnCours: { montant: number; date: string; operateur: PayoutOperator | null; numeroReception: string | null } | null;
  /** Ni téléphone ni e-mail des comptes amenés. */
  listeInscrits: { nom: string; date: string; statut: 'ESSAI' | 'ABONNE' | 'INACTIF'; planCode: string | null }[];
  listeAbonnes: { nom: string; planCode: string | null; paiements: number; commission: number }[];
  totalGagne: number;
  activite: AffiliateActivity[];
}

/** null si aucune session affilié (401 AUTH_SESSION_EXPIRED). */
export async function fetchAffiliate(): Promise<AffiliateDashboard | null> {
  try {
    return (await api.get<{ affiliate: AffiliateDashboard }>('/affiliate/me')).affiliate;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'AUTH_SESSION_EXPIRED') return null;
    throw error;
  }
}

export function registerAffiliate(input: { nom: string; telephone: string; pays: CountryCode; pin: string }) {
  return api.post<{ affiliate: AffiliateDashboard }>('/affiliate/register', input).then((d) => d.affiliate);
}

export function loginAffiliate(input: { telephone: string; pin: string }) {
  return api.post<{ affiliate: AffiliateDashboard }>('/affiliate/login', input).then((d) => d.affiliate);
}

export function saveAffiliateName(nom: string) {
  return api.post<{ affiliate: AffiliateDashboard }>('/affiliate/profile', { nom }).then((d) => d.affiliate);
}

export function logoutAffiliate() {
  return api.post<{ loggedOut: true }>('/affiliate/logout');
}

/** Retrait de tout le solde : seul l'endroit où envoyer l'argent est choisi ici. */
export function requestAffiliatePayout(input: { operateur: PayoutOperator; numeroReception: string }) {
  return api.post<{ affiliate: AffiliateDashboard }>('/affiliate/payouts', input).then((d) => d.affiliate);
}

// ─── Code d'affiliation à l'inscription ───

/**
 * Clic sur un lien /a/CODE : le serveur mémorise le code 30 jours dans un
 * cookie signé. Renvoie le code retenu, null s'il n'existe pas.
 */
export function claimReferral(code: string) {
  return api.post<{ code: string | null }>('/affiliate/ref', { code }).then((d) => d.code);
}

/** Code de lien mémorisé côté serveur pour cet appareil, null s'il n'y en a pas. */
export function fetchReferral() {
  return api.get<{ code: string | null }>('/affiliate/ref').then((d) => d.code);
}

/** Vérifie un code saisi à la main (existe, affilié actif). */
export function checkAffiliateCode(code: string) {
  return api.get<{ valide: boolean }>(`/affiliate/codes/${encodeURIComponent(code)}`).then((d) => d.valide);
}

export interface AffiliatePerks {
  joursOfferts: number;
  joursEssaiTotal: number;
  reductionPremierPaiement: number;
}

/** Avantage d'une inscription avec un code (réglages du back-office). */
export function fetchAffiliatePerks() {
  return api.get<AffiliatePerks>('/affiliate/perks');
}
