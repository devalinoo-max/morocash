import { api } from './client';
import { toApiPaymentMethode, toFrontendPaymentMethod } from './mappers';
import type { Activity, PaymentMethod, Versement } from '../types';

export interface ApiVersement {
  id: string;
  clientUuid: string;
  numero: number | null;
  aLaCommande: boolean;
  orderId: string | null;
  orderNumero: string | null;
  orderDate: string | null;
  orderTotal: number | null;
  orderClientUuid: string | null;
  customerId: string | null;
  customerNom: string | null;
  customerTelephone: string | null;
  montant: number;
  methode: string;
  createdAt: string;
  resteApres: number | null;
  dejaPaye: number | null;
  numeroRecu: string | null;
  statut: 'VALIDE' | 'ANNULE';
  motifAnnulation: string | null;
  encaissePar: string | null;
}

export function toFrontendVersement(v: ApiVersement): Versement {
  return {
    id: v.id,
    clientUuid: v.clientUuid,
    numero: v.numero,
    atOrder: v.aLaCommande,
    orderId: v.orderId,
    orderReference: v.orderNumero,
    orderDate: v.orderDate,
    orderTotal: v.orderTotal,
    orderClientUuid: v.orderClientUuid,
    customerId: v.customerId,
    customerName: v.customerNom,
    customerPhone: v.customerTelephone,
    amount: v.montant,
    method: toFrontendPaymentMethod(v.methode),
    createdAt: v.createdAt,
    remainingAfter: v.resteApres,
    paidSoFar: v.dejaPaye,
    receiptNumber: v.numeroRecu,
    isCancelled: v.statut !== 'VALIDE',
    cancelReason: v.motifAnnulation,
    collectedBy: v.encaissePar,
  };
}

export interface CollectDebtResponse {
  status: 'CREATED' | 'DUPLICATE';
  versements: ApiVersement[];
  dette: number;
  customer: { id: string; nom: string };
}

/**
 * « Encaisser » depuis « Qui me doit ». Le clientUuid rend l'envoi rejouable :
 * le serveur reconnaît un renvoi et répond DUPLICATE au lieu d'encaisser deux fois.
 */
export function collectCustomerDebt(
  customerId: string,
  montant: number,
  methode: PaymentMethod,
  clientUuid: string
) {
  return api.post<CollectDebtResponse>(`/customers/${customerId}/payments`, {
    clientUuid,
    montant,
    methode: toApiPaymentMethode(methode),
  });
}

export function cancelVersement(paymentId: string, motif: string) {
  return api
    .post<{ versement: ApiVersement }>(`/payments/${paymentId}/cancel`, { motif })
    .then((d) => toFrontendVersement(d.versement));
}

export function fetchVersementReceipt(paymentId: string) {
  return api
    .get<{ boutique: { nom: string; ville: string | null }; versement: ApiVersement }>(
      `/payments/${paymentId}/receipt`
    )
    .then((d) => toFrontendVersement(d.versement));
}

interface ApiActivity {
  totalVendu: number;
  nbCommandes: number;
  nbVersements: number;
  resteSurCommandes: number;
  commandes: { id: string; payeALaCommande: number; paye: number; reste: number }[];
  versements: ApiVersement[];
}

export function fetchActivity(from: Date, to: Date): Promise<Activity> {
  const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  return api.get<ApiActivity>(`/activity?${query}&type=all`).then((d) => ({
    totalVendu: d.totalVendu,
    nbCommandes: d.nbCommandes,
    nbVersements: d.nbVersements,
    resteSurCommandes: d.resteSurCommandes,
    commandes: Object.fromEntries(
      d.commandes.map((c) => [c.id, { paidAtOrder: c.payeALaCommande, paid: c.paye, remaining: c.reste }])
    ),
    versements: d.versements.map(toFrontendVersement),
  }));
}
