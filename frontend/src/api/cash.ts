import { api, generateClientUuid } from './client';
import { toApiPaymentMethode, toFrontendPaymentMethod } from './mappers';
import type { CashRegisterSession, CashMovement, PaymentMethod } from '../types';

export interface ApiCashRegister {
  id: string;
  businessId: string;
  ouverteParId: string;
  ouverteLe: string;
  fondDepart: number;
  fermeeParId?: string | null;
  fermeeLe?: string | null;
  montantCompte?: number | null;
  statut: 'OUVERTE' | 'FERMEE';
  // Absents pour un SELLER (spec §0 règle 7).
  montantAttendu?: number | null;
  ecart?: number | null;
  commentaireEcart?: string | null;
}

export interface ApiCashMovement {
  id: string;
  cashRegisterId: string;
  clientUuid: string;
  type: 'ENTREE' | 'SORTIE';
  origine: 'COMMANDE' | 'REMBOURSEMENT' | 'DEPENSE' | 'APPORT' | 'RETRAIT';
  referenceId?: string | null;
  montant: number;
  methode: string;
  motif?: string | null;
  userId: string;
  createdAt: string;
}

export function getCurrentRegister() {
  return api.get<{ register: ApiCashRegister | null }>('/cash/current').then((d) => d.register);
}

export function openRegister(fondDepart: number) {
  return api
    .post<{ register: ApiCashRegister }>('/cash/open', { clientUuid: generateClientUuid(), fondDepart })
    .then((d) => d.register);
}

export function closeRegister(montantCompte: number, commentaireEcart?: string) {
  return api
    .post<{ register: ApiCashRegister; attenduTotal?: number }>('/cash/close', {
      montantCompte,
      commentaireEcart,
    })
    .then((d) => d.register);
}

export function listMovements() {
  return api.get<{ movements: ApiCashMovement[] }>('/cash/movements').then((d) => d.movements);
}

/**
 * Réservé OWNER/ACCOUNTANT côté backend (FORBIDDEN_ROLE pour un SELLER) — un
 * SELLER n'a donc que la caisse courante via getCurrentRegister().
 */
export function listHistory() {
  return api.get<{ registers: ApiCashRegister[] }>('/cash/history').then((d) => d.registers);
}

export function createManualMovement(params: {
  type: 'APPORT' | 'RETRAIT';
  montant: number;
  motif: string;
  methode: PaymentMethod;
}) {
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; movement: ApiCashMovement }>('/cash/movements', {
      clientUuid: generateClientUuid(),
      type: params.type,
      montant: params.montant,
      motif: params.motif,
      methode: toApiPaymentMethode(params.methode),
    })
    .then((d) => d.movement);
}

export function toFrontendCashSession(r: ApiCashRegister, names: { openedBy?: string; closedBy?: string }): CashRegisterSession {
  return {
    id: r.id,
    ouvertePar: names.openedBy ?? r.ouverteParId,
    ouverteLe: r.ouverteLe,
    fondDepart: r.fondDepart,
    fermeePar: r.fermeeParId ? (names.closedBy ?? r.fermeeParId) : undefined,
    fermeeLe: r.fermeeLe ?? undefined,
    montantAttendu: r.montantAttendu ?? undefined,
    montantCompte: r.montantCompte ?? undefined,
    ecart: r.ecart ?? undefined,
    commentaireEcart: r.commentaireEcart ?? undefined,
    statut: r.statut,
  };
}

export function toFrontendCashMovement(m: ApiCashMovement, userName: string): CashMovement {
  return {
    id: m.id,
    cashRegisterId: m.cashRegisterId,
    clientUuid: m.clientUuid,
    type: m.type,
    origine: m.origine,
    referenceId: m.referenceId ?? undefined,
    montant: m.montant,
    methode: toFrontendPaymentMethod(m.methode),
    motif: m.motif ?? undefined,
    userName,
    createdAt: m.createdAt,
  };
}
