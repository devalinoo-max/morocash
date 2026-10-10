import { api, generateClientUuid } from './client';
import { toApiPaymentMethode, toFrontendPaymentMethod } from './mappers';
import type { CashRegisterSession, CashMovement, PaymentMethod, Versement } from '../types';
import { toFrontendVersement, type ApiVersement } from './payments';

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

// ── Journal de la caisse ────────────────────────────────────────────────────
// Cartes, cumuls et soldes calculés par le serveur (GET /cash/journal).

export interface CashJournalLine {
  id: string;
  kind: 'FOND' | 'ENTREE' | 'SORTIE';
  createdAt: string;
  amount: number;
  method: PaymentMethod;
  label: string;
  category: string | null;
  by: string | null;
  isCancelled: boolean;
  versement: Versement | null;
  expenseId: string | null;
  /** Total courant de sa carte après cette ligne. */
  cumul: number;
  /** Total courant de son mode de paiement après cette ligne. */
  cumulMode: number;
  /** Solde après cette ligne ; null si les sorties sont masquées pour ce compte. */
  balanceAfter: number | null;
}

export interface CashJournal {
  canSeeExits: boolean;
  fondDepart: number;
  entrees: number;
  sorties: number | null;
  solde: number | null;
  modes: { method: PaymentMethod; total: number }[];
  creances: { total: number; nbClients: number };
  lines: CashJournalLine[];
}

interface ApiCashJournal {
  peutVoirSorties: boolean;
  fondDepart: number;
  entrees: number;
  sorties: number | null;
  solde: number | null;
  modes: { methode: string; total: number }[];
  creances: { total: number; nbClients: number };
  lignes: {
    id: string;
    kind: 'FOND' | 'ENTREE' | 'SORTIE';
    createdAt: string;
    montant: number;
    methode: string;
    libelle: string;
    categorie: string | null;
    par: string | null;
    annule: boolean;
    versement: ApiVersement | null;
    expenseId: string | null;
    cumul: number;
    cumulMode: number;
    soldeApres: number | null;
  }[];
}

export function fetchCashJournal(from: Date, to: Date): Promise<CashJournal> {
  const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  return api.get<ApiCashJournal>(`/cash/journal?${query}`).then((d) => ({
    canSeeExits: d.peutVoirSorties,
    fondDepart: d.fondDepart,
    entrees: d.entrees,
    sorties: d.sorties,
    solde: d.solde,
    modes: d.modes.map((m) => ({ method: toFrontendPaymentMethod(m.methode), total: m.total })),
    creances: d.creances,
    lines: d.lignes.map((l) => ({
      id: l.id,
      kind: l.kind,
      createdAt: l.createdAt,
      amount: l.montant,
      method: toFrontendPaymentMethod(l.methode),
      label: l.libelle,
      category: l.categorie,
      by: l.par,
      isCancelled: l.annule,
      versement: l.versement ? toFrontendVersement(l.versement) : null,
      expenseId: l.expenseId,
      cumul: l.cumul,
      cumulMode: l.cumulMode,
      balanceAfter: l.soldeApres,
    })),
  }));
}
