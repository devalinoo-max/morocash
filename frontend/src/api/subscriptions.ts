import { api } from './client';

export type SubscriptionPeriod = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

export interface SubscriptionPaymentStatus {
  paymentId: string;
  statut: 'EN_ATTENTE' | 'REUSSI' | 'ECHOUE' | 'EXPIRE';
  planCode: 'SOLO' | 'BUSINESS' | null;
  periode: SubscriptionPeriod | null;
  montant: number;
  subscriptionEndsAt: string | null;
  /** Fin d'abonnement posée par ce paiement, calculée par le serveur (null tant qu'il n'a pas réussi). */
  dateFinApres: string | null;
}

/** Devis de prolongation : tout est calculé par le serveur, l'écran ne fait qu'afficher. */
export interface RenewalQuote {
  planCode: 'SOLO' | 'BUSINESS';
  planNom: string;
  dateFinActuelle: string | null;
  joursRestants: number;
  enEssai: boolean;
  options: {
    periode: SubscriptionPeriod;
    mois: number;
    montant: number;
    prixNormal: number;
    dateFinApres: string;
    /** Plus de 12 mois d'avance : le serveur refusera cette durée. */
    bloque: boolean;
    conversion: { valeur: number; joursConvertis: number } | null;
  }[];
}

export interface SubscriptionOverview {
  statut: string;
  planCode: 'SOLO' | 'BUSINESS' | null;
  planNom: string | null;
  current: { periode: SubscriptionPeriod; dateDebut: string; dateFin: string } | null;
  subscriptionEndsAt: string | null;
  joursRestants: number | null;
  trialEndsAt: string | null;
  utilisateurs: number;
  /** Tarif annuel négocié pour la formule Business (null = prix public de la grille). */
  tarifAnnuelBusiness: number | null;
  /** Durée de l'essai offerte à l'inscription (30, ou 45 avec un code d'affiliation). */
  dureeEssaiJours: number;
  /** Réduction (%) du code d'affiliation sur le prochain paiement, null si aucune. */
  reductionAffiliation: number | null;
  payments: {
    paymentId: string;
    date: string;
    montant: number;
    methode: string;
    referencePasserelle: string | null;
    /** Remise du code d'affiliation (prix normal = montant + remise). */
    remiseAffiliation: number;
    nombreMois: number | null;
    dateFinAvant: string | null;
    dateFinApres: string | null;
    planCode: 'SOLO' | 'BUSINESS' | null;
    periode: SubscriptionPeriod | null;
    dateDebut: string | null;
    dateFin: string | null;
  }[];
}

/** GET /subscriptions/current — formule en cours, dates et paiements réussis. */
export function fetchSubscriptionOverview() {
  return api.get<{ subscription: SubscriptionOverview }>('/subscriptions/current').then((d) => d.subscription);
}

/** POST /subscriptions/checkout — renvoie l'adresse de la page de paiement pawaPay. */
/**
 * `clientUuid` est tiré une fois par choix de durée : un double clic sur
 * « Payer » renvoie le même paiement au lieu d'en ouvrir un second.
 */
export function startSubscriptionCheckout(
  planCode: 'SOLO' | 'BUSINESS',
  periode: SubscriptionPeriod,
  clientUuid?: string
) {
  return api.post<{ paymentId: string; redirectUrl: string }>('/subscriptions/checkout', {
    planCode,
    periode,
    ...(clientUuid ? { clientUuid } : {}),
  });
}

/** GET /subscriptions/quote — prix et nouvelle date de fin de chaque durée, avant paiement. */
export function fetchRenewalQuote(planCode: 'SOLO' | 'BUSINESS') {
  return api
    .get<{ quote: RenewalQuote }>(`/subscriptions/quote?planCode=${planCode}`)
    .then((d) => d.quote);
}

export function fetchSubscriptionPayment(paymentId: string) {
  return api
    .get<{ payment: SubscriptionPaymentStatus }>(`/subscriptions/payments/${encodeURIComponent(paymentId)}`)
    .then((d) => d.payment);
}
