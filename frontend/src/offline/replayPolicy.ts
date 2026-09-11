import { ApiError } from '../api/client';
import { SERVER_DEDUPLICATED, type PendingKind } from './queue';

/**
 * Ce que la file fait d'une ecriture qui vient d'echouer.
 *
 * C'est la decision la plus lourde de consequences de toute l'app : se tromper
 * ici, c'est soit perdre ce que le commercant a saisi hors ligne, soit le
 * dupliquer, soit figer la file. Elle vit donc ici, sans dependance a React,
 * pour rester verifiable (tests/stock-et-hors-ligne).
 */

/**
 * Une panne reseau franche (requete jamais partie, ou coupee en vol) se rejoue
 * sans risque. Une reponse d'erreur du serveur, elle, veut dire quelque chose
 * et doit remonter au commercant : rejouer indefiniment un refus ne le
 * corrigera pas.
 */
export function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NETWORK_ERROR';
}

/**
 * Refus prononces AVANT toute ecriture en base : session expiree, quota de
 * requetes, boutique en lecture seule, abonnement echu. Rien n'a ete cree cote
 * serveur, donc rejouer plus tard ne peut pas faire de doublon — meme pour un
 * produit ou un client, qui n'ont pas de garde-fou anti-doublon en base.
 *
 * Le cas est frequent et couteux : un commercant reste hors ligne assez
 * longtemps pour que sa session expire perdait, au retour du reseau, tout ce
 * qu'il avait saisi entre-temps.
 */
const RETRYABLE_REFUSALS = new Set([
  'AUTH_SESSION_EXPIRED',
  'AUTH_TOO_MANY_ATTEMPTS',
  'RATE_LIMITED',
  'BUSINESS_READ_ONLY',
  'SUBSCRIPTION_EXPIRED',
]);

export function wroteNothing(error: unknown): boolean {
  return error instanceof ApiError && RETRYABLE_REFUSALS.has(error.code);
}

/**
 * La ressource visee n'existe pas (ou plus) cote serveur. Pour une
 * modification de produit, cela veut dire que sa creation n'est jamais passee :
 * insister sur le meme identifiant echouera toujours.
 */
export function isMissingResource(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'PRODUCT_NOT_FOUND' || error.code === 'RESOURCE_NOT_OWNED')
  );
}

export type ReplayDecision =
  /** Reseau coupe : on garde tout et on retentera, avec un delai croissant. */
  | { action: 'RETRY_LATER' }
  /** Refus du serveur, rejouable : la ligne reste en file, la reprise s'arrete
   *  la et attend un clic sur "Reessayer". */
  | { action: 'KEEP_AND_BLOCK' }
  /** Refus du serveur sur une creation non dedoublonnee en base : la creation a
   *  peut-etre abouti cote serveur, la rejouer risquerait un doublon. */
  | { action: 'DROP' };

/**
 * Decision prise apres l'echec d'UNE ecriture de la file.
 *
 * `canRetry` pilote le bouton "Reessayer" : il ne doit apparaitre que lorsque
 * rejouer a une chance d'aboutir sans creer de doublon.
 */
export function decideAfterFailure(
  kind: PendingKind,
  error: unknown
): { decision: ReplayDecision; canRetry: boolean } {
  if (isNetworkFailure(error)) {
    return { decision: { action: 'RETRY_LATER' }, canRetry: true };
  }
  const rejouable = SERVER_DEDUPLICATED[kind] || wroteNothing(error);
  return {
    decision: rejouable ? { action: 'KEEP_AND_BLOCK' } : { action: 'DROP' },
    canRetry: rejouable,
  };
}

/**
 * Rechargement serveur et ecritures en attente se marchent dessus : pendant
 * qu'un rechargement est en vol, le commercant continue de vendre, et ses
 * commandes toutes fraiches n'existent pas encore cote serveur. Les appliquer
 * telles quelles les ferait disparaitre de l'ecran — le pire bug possible pour
 * une caisse.
 *
 * On remet donc en tete ce que le serveur ne connait pas encore. Meme regle au
 * demarrage, ou l'instantane local ne contient que la version serveur : sans
 * cette fusion, un produit cree en mode avion disparaissait de l'ecran au
 * redemarrage de l'app alors que son envoi attendait toujours.
 */
export function mergePending<T extends { id: string }>(
  serverRows: T[],
  localRows: T[],
  pendingLocalIds: Set<string>
): T[] {
  const serverIds = new Set(serverRows.map((r) => r.id));
  const stillLocal = localRows.filter((r) => pendingLocalIds.has(r.id) && !serverIds.has(r.id));
  return [...stillLocal, ...serverRows];
}
