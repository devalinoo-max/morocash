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
 * annuel négocié pour la formule Business (Business.tarifAnnuelBusiness), posé
 * à la main au cas par cas. Sert au paiement comme à l'affichage, pour que la
 * boutique ne voie jamais un montant différent de celui qui lui sera demandé.
 */
export function businessPriceForPeriod(
  business: Pick<Business, 'tarifAnnuelBusiness'>,
  plan: Pick<Plan, 'code' | 'prixMensuel' | 'prixTrimestriel' | 'prixSemestriel' | 'prixAnnuel'>,
  periode: SubPeriod
): number {
  if (periode === 'ANNUEL' && plan.code === 'BUSINESS' && business.tarifAnnuelBusiness !== null) {
    return business.tarifAnnuelBusiness;
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
