import { api } from './client';

export type SubscriptionPeriod = 'MENSUEL' | 'ANNUEL';

export interface SubscriptionPaymentStatus {
  paymentId: string;
  statut: 'EN_ATTENTE' | 'REUSSI' | 'ECHOUE' | 'EXPIRE';
  planCode: 'SOLO' | 'BUSINESS' | null;
  periode: SubscriptionPeriod | null;
  montant: number;
  subscriptionEndsAt: string | null;
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
