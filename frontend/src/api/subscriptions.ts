import { api } from './client';

export type SubscriptionPeriod = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

export interface SubscriptionPaymentStatus {
  paymentId: string;
  statut: 'EN_ATTENTE' | 'REUSSI' | 'ECHOUE' | 'EXPIRE';
  planCode: 'SOLO' | 'BUSINESS' | null;
  periode: SubscriptionPeriod | null;
  montant: number;
  subscriptionEndsAt: string | null;
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
  payments: {
    paymentId: string;
    date: string;
    montant: number;
    methode: string;
    referencePasserelle: string | null;
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
export function startSubscriptionCheckout(planCode: 'SOLO' | 'BUSINESS', periode: SubscriptionPeriod) {
  return api.post<{ paymentId: string; redirectUrl: string }>('/subscriptions/checkout', { planCode, periode });
}

export function fetchSubscriptionPayment(paymentId: string) {
  return api
    .get<{ payment: SubscriptionPaymentStatus }>(`/subscriptions/payments/${encodeURIComponent(paymentId)}`)
    .then((d) => d.payment);
}
