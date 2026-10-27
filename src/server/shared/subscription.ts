import { addDays, addMonths } from 'date-fns';
import type { Business, Plan, SubPeriod } from '@prisma/client';

/** Durées d'abonnement proposées au paiement, en mois. */
export const PERIOD_MONTHS: Record<SubPeriod, number> = {
  MENSUEL: 1,
  TRIMESTRIEL: 3,
  SEMESTRIEL: 6,
  ANNUEL: 12,
};

/** Prix d'une formule pour une durée — toujours lu en base, jamais envoyé par le navigateur. */
export function planPriceForPeriod(
  plan: Pick<Plan, 'prixMensuel' | 'prixTrimestriel' | 'prixSemestriel' | 'prixAnnuel'>,
  periode: SubPeriod
): number {
  switch (periode) {
    case 'TRIMESTRIEL':
      return plan.prixTrimestriel;
    case 'SEMESTRIEL':
      return plan.prixSemestriel;
    case 'ANNUEL':
      return plan.prixAnnuel;
    case 'MENSUEL':
    default:
      return plan.prixMensuel;
  }
}

/**
 * Prix réellement dû par une boutique : le prix public du plan, sauf tarif
 * négocié pour la formule Business (tarifAnnuelBusiness pour l'année,
 * tarifMensuelBusiness pour le mois), posé à la main au cas par cas. Sert au
 * paiement comme à l'affichage, pour que la boutique ne voie jamais un montant
 * différent de celui qui lui sera demandé.
 */
export function businessPriceForPeriod(
  business: Pick<Business, 'tarifAnnuelBusiness' | 'tarifMensuelBusiness'>,
  plan: Pick<Plan, 'code' | 'prixMensuel' | 'prixTrimestriel' | 'prixSemestriel' | 'prixAnnuel'>,
  periode: SubPeriod
): number {
  if (plan.code === 'BUSINESS') {
    if (periode === 'ANNUEL' && business.tarifAnnuelBusiness !== null) {
      return business.tarifAnnuelBusiness;
    }
    if (periode === 'MENSUEL' && business.tarifMensuelBusiness !== null) {
      return business.tarifMensuelBusiness;
    }
  }
  return planPriceForPeriod(plan, periode);
}

/** Libellé court d'une durée : « 1 mois », « 3 mois »… */
export function periodLabel(periode: SubPeriod): string {
  return `${PERIOD_MONTHS[periode]} mois`;
}

type BusinessLockFields = Pick<Business, 'statut' | 'trialEndsAt' | 'subscriptionEndsAt'>;

/**
 * Aucun cron ne fait basculer `Business.statut` de ESSAI/ACTIF vers IMPAYE à
 * l'échéance (voir src/server/jobs) — trialEndsAt/subscriptionEndsAt restent
 * donc la seule source de vérité pour savoir si l'accès doit être restreint,
 * indépendamment de ce que vaut `statut` à l'instant T.
 */
export function isSubscriptionLapsed(business: BusinessLockFields): boolean {
  if (business.statut === 'IMPAYE') return true;
  if (business.statut === 'ESSAI') {
    return !!business.trialEndsAt && business.trialEndsAt.getTime() < Date.now();
  }
  if (business.statut === 'ACTIF') {
    return !!business.subscriptionEndsAt && business.subscriptionEndsAt.getTime() < Date.now();
  }
  return false;
}

/** SUSPENDU (décision back-office) / RESILIE (fermeture volontaire) — distinct d'un abonnement simplement expiré. */
export function isAdministrativelyLocked(business: Pick<Business, 'statut'>): boolean {
  return business.statut === 'SUSPENDU' || business.statut === 'RESILIE';
}

export function isBusinessLocked(business: BusinessLockFields): boolean {
  return isAdministrativelyLocked(business) || isSubscriptionLapsed(business);
}

export function getTrialDaysLeft(business: Pick<Business, 'statut' | 'trialEndsAt'>): number | null {
  if (business.statut !== 'ESSAI' || !business.trialEndsAt) return null;
  const msLeft = business.trialEndsAt.getTime() - Date.now();
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

/** Essai de base, sans code d'affiliation. La durée réelle d'un compte est Business.dureeEssaiJours. */
export const BASE_TRIAL_DAYS = 30;

/**
 * Prix après la réduction du code d'affiliation (premier paiement seulement),
 * arrondi à l'entier FCFA inférieur. Même calcul côté écran pour l'affichage ;
 * le montant facturé, lui, est toujours celui calculé ici par le serveur.
 */
export function affiliateDiscountedPrice(price: number, reductionPct: number): number {
  if (reductionPct <= 0) return price;
  return Math.floor((price * (100 - reductionPct)) / 100);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Avance maximale déjà payée au moment d'acheter : au-delà de 12 mois payés
 * d'avance, on ne peut plus prolonger. En dessous, toutes les durées (12 mois
 * compris) restent possibles, les jours restants s'ajoutant à la durée achetée.
 */
export const MAX_AVANCE_MOIS = 12;

/** Base du prorata d'un changement de formule : un mois compte pour 30 jours. */
const JOURS_PRORATA = 30;

type PlanPrix = { code: string; prixMensuel: number };

export interface RenewalInput {
  now: Date;
  statut: Business['statut'];
  subscriptionEndsAt: Date | null;
  /** Formule payée en ce moment (Business.plan). null pendant l'essai. */
  planActuel: PlanPrix | null;
  /** Formule achetée par ce paiement. */
  planCible: PlanPrix;
  mois: number;
}

export interface RenewalResult {
  /** Fin d'abonnement avant ce paiement (null si jamais payé). */
  dateFinAvant: Date | null;
  /** Point de départ des mois achetés. */
  dateDebut: Date;
  /** Fin d'abonnement après ce paiement. */
  dateFinApres: Date;
  /** Jours encore payés au moment du calcul (0 si expiré ou en essai). */
  joursRestants: number;
  /** Changement de formule avec des jours restants : leur valeur, puis ce qu'elle vaut en jours de la nouvelle formule. */
  conversion: { valeur: number; joursConvertis: number } | null;
  /** Vrai si plus de 12 mois sont déjà payés d'avance : paiement refusé. */
  depasseAvanceMax: boolean;
}

/**
 * LA règle de prolongation, seule source de la nouvelle date de fin (devis
 * affiché avant paiement comme activation au paiement réussi) :
 *
 *   abonnement en cours  -> nouvelle fin = fin actuelle + N mois
 *   sinon                -> nouvelle fin = maintenant + N mois
 *
 * Les jours restants ne sont jamais perdus. L'essai gratuit, lui, ne se
 * reporte pas : le paiement y met fin et la date part du jour du paiement.
 * Changement de formule avec des jours restants : ces jours sont convertis en
 * argent au prorata (prix mensuel / 30), puis en jours de la nouvelle formule
 * (arrondis à l'inférieur). Ex. 15 jours d'une formule à 15 000 F = 7 500 F =
 * 11 jours d'une formule à 20 000 F.
 */
export function computeRenewal(input: RenewalInput): RenewalResult {
  const { now, planActuel, planCible, mois } = input;
  const enCours =
    input.statut !== 'ESSAI' && input.subscriptionEndsAt && input.subscriptionEndsAt.getTime() > now.getTime()
      ? input.subscriptionEndsAt
      : null;
  const joursRestants = enCours ? Math.ceil((enCours.getTime() - now.getTime()) / DAY_MS) : 0;

  let dateDebut = now;
  let conversion: RenewalResult['conversion'] = null;
  if (enCours) {
    if (!planActuel || planActuel.code === planCible.code) {
      dateDebut = enCours;
    } else {
      const valeur = Math.floor((joursRestants * planActuel.prixMensuel) / JOURS_PRORATA);
      const joursConvertis =
        planCible.prixMensuel > 0 ? Math.floor((valeur * JOURS_PRORATA) / planCible.prixMensuel) : 0;
      conversion = { valeur, joursConvertis };
      dateDebut = addDays(now, joursConvertis);
    }
  }

  const dateFinApres = addMonths(dateDebut, mois);
  return {
    dateFinAvant: input.subscriptionEndsAt,
    dateDebut,
    dateFinApres,
    joursRestants,
    conversion,
    depasseAvanceMax: dateDebut.getTime() > addMonths(now, MAX_AVANCE_MOIS).getTime(),
  };
}
