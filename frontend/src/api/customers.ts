import { api } from './client';
import type { Customer } from '../types';

export interface ApiCustomer {
  id: string;
  nom: string;
  telephone: string | null;
  note: string | null;
  archive: boolean;
  createdAt: string;
  /** Solde calculé par GET /customers (absent sur un serveur plus ancien). */
  solde?: number;
  dernierVersement?: { date: string; montant: number } | null;
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

export function updateCustomer(id: string, input: Partial<CreateCustomerInput>) {
  return api.patch<{ customer: unknown }>(`/customers/${id}`, input);
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
    lastPayment: c.dernierVersement
      ? { at: c.dernierVersement.date, amount: c.dernierVersement.montant }
      : null,
    syncStatus: 'SYNCED',
  };
}
