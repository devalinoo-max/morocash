import { QUEUE_STORE, idbDelete, idbGetAll, idbPut } from './idb';

/**
 * File d'attente des ecritures.
 *
 * Elle sert deux besoins qui n'en font qu'un : rendre l'interface instantanee
 * (point 1) et faire marcher l'app sans reseau (point 2). Dans les deux cas
 * l'ecran agit tout de suite, la requete part ensuite, et si elle echoue elle
 * reste ici jusqu'a ce qu'elle passe.
 */
export type PendingKind =
  | 'ORDER_CREATE'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'CUSTOMER_CREATE'
  | 'EXPENSE_CREATE';

export interface PendingMutation {
  /** clientUuid : c'est LUI qui empeche les doublons cote serveur. */
  id: string;
  kind: PendingKind;
  /** Corps de la requete, deja au format attendu par l'API. */
  payload: any;
  /** Id de l'element affiche a l'ecran, a reconcilier quand le serveur repond. */
  localId: string;
  /** Libelle court montre a l'utilisateur ("Commande CMD-...", "Produit Riz 5kg"). */
  label: string;
  /** Contexte d'affichage (nom du client, du produit...) inutile au serveur. */
  meta?: any;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

/**
 * Certaines entites ont un clientUuid unique en base (commande, depense,
 * paiement, mouvement de stock) : le serveur y detecte lui-meme un renvoi et
 * renvoie l'existant au lieu d'un doublon. On peut donc reessayer sans risque.
 *
 * Les produits et les clients n'ont pas ce garde-fou en base : on ne rejoue
 * une creation que si la requete n'a jamais atteint le serveur (panne reseau
 * franche). Une reponse d'erreur du serveur, elle, remonte a l'utilisateur.
 */
export const SERVER_DEDUPLICATED: Record<PendingKind, boolean> = {
  ORDER_CREATE: true,
  EXPENSE_CREATE: true,
  PRODUCT_CREATE: false,
  PRODUCT_UPDATE: true,
  CUSTOMER_CREATE: false,
};

export function listPending(): Promise<PendingMutation[]> {
  return idbGetAll<PendingMutation>(QUEUE_STORE).then((rows) =>
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  );
}

export function enqueue(mutation: PendingMutation): Promise<void> {
  return idbPut(QUEUE_STORE, mutation);
}

export function dequeue(id: string): Promise<void> {
  return idbDelete(QUEUE_STORE, id);
}

export async function markAttempt(id: string, error: string): Promise<PendingMutation | null> {
  const rows = await listPending();
  const found = rows.find((r) => r.id === id);
  if (!found) return null;
  const updated: PendingMutation = {
    ...found,
    attempts: found.attempts + 1,
    lastError: error,
  };
  await idbPut(QUEUE_STORE, updated);
  return updated;
}

/**
 * Delai croissant entre deux tentatives : 2s, 4s, 8s... plafonne a 1 minute.
 * Sans plafond, un reseau coupe une heure repousserait la reprise a plusieurs
 * heures apres son retour.
 */
export function retryDelayMs(attempts: number): number {
  return Math.min(60_000, 2000 * Math.pow(2, Math.max(0, attempts - 1)));
}
