import type { Business } from '@prisma/client';

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
