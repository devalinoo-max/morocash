import { api, generateClientUuid } from './client';
import { toApiPaymentMethode } from './mappers';
import type { Customer, PaymentMethod } from '../types';

export interface ApiCustomer {
  id: string;
  nom: string;
  telephone: string | null;
  note: string | null;
  archive: boolean;
  createdAt: string;
}

export interface CreateCustomerInput {
  nom: string;
  telephone?: string;
  note?: string;
}

export function listCustomers() {
  return api.get<{ customers: ApiCustomer[] }>('/customers').then((d) => d.customers);
}

export function createCustomer(input: CreateCustomerInput) {
  return api.post<{ customer: ApiCustomer }>('/customers', input).then((d) => d.customer);
}

export function repayDebt(customerId: string, montant: number, methode: PaymentMethod) {
  return api.post<{ status: 'CREATED' | 'DUPLICATE'; payment: unknown }>(
    `/customers/${customerId}/payments`,
    { clientUuid: generateClientUuid(), montant, methode: toApiPaymentMethode(methode) }
  );
}

/**
 * Solde débiteur exact (spec §7.5 : "calculé, jamais stocké" — pas de champ
 * dédié sur Customer). GET /customers/:id/history renvoie déjà `solde` calculé
 * côté serveur (Σcommandes non annulées − Σpaiements validés, y compris les
 * remboursements de dette sans commande) — on le récupère par client plutôt que
 * de réimplémenter la formule côté frontend (un essai précédent oubliait les
 * remboursements de dette, qui n'apparaissent dans aucune commande).
 */
export function fetchCustomerBalance(customerId: string) {
  return api
    .get<{ solde: number; totalDu: number; totalRecu: number }>(`/customers/${customerId}/history`)
    .then((d) => d.solde);
}

export function toFrontendCustomer(c: ApiCustomer, solde: number): Customer {
  return {
    id: c.id,
    name: c.nom,
    phone: c.telephone ?? '',
    totalDebt: solde,
    debtAgeDays: solde > 0 ? 1 : 0,
    lastActivity: c.createdAt,
    notes: c.note ?? undefined,
    syncStatus: 'SYNCED',
  };
}
