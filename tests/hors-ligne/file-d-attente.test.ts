import { describe, it, expect } from 'vitest';
import { ApiError } from '../../frontend/src/api/client';
import { SERVER_DEDUPLICATED, retryDelayMs, type PendingKind } from '../../frontend/src/offline/queue';
import {
  decideAfterFailure,
  isMissingResource,
  isNetworkFailure,
  mergePending,
  wroteNothing,
} from '../../frontend/src/offline/replayPolicy';

/**
 * La file d'attente hors ligne.
 *
 * Trois issues possibles apres l'echec d'une ecriture, et chacune a deja coute
 * cher en production : garder (rejeu sans doublon), bloquer (attendre le
 * commercant), jeter (risque de doublon ecarte, mais saisie perdue). Ces tests
 * figent la regle pour que les regressions des jours precedents ne reviennent
 * pas.
 */

const RESEAU = new ApiError({ code: 'NETWORK_ERROR', message: 'Impossible de joindre le serveur.' });
const SESSION_EXPIREE = new ApiError({ code: 'AUTH_SESSION_EXPIRED', message: 'Session expirée.' });
const ABONNEMENT = new ApiError({ code: 'SUBSCRIPTION_EXPIRED', message: 'Abonnement expiré.' });
const LECTURE_SEULE = new ApiError({ code: 'BUSINESS_READ_ONLY', message: 'Lecture seule.' });
const TROP_DE_REQUETES = new ApiError({ code: 'RATE_LIMITED', message: 'Trop de requêtes.' });
const VALIDATION = new ApiError({ code: 'VALIDATION_ERROR', message: 'Données invalides.' });
const PRODUIT_INTROUVABLE = new ApiError({ code: 'PRODUCT_NOT_FOUND', message: 'Produit introuvable.' });
const QUOTA = new ApiError({ code: 'QUOTA_PRODUCTS_REACHED', message: 'Limite atteinte.' });

const TOUS_LES_TYPES: PendingKind[] = [
  'ORDER_CREATE',
  'PRODUCT_CREATE',
  'PRODUCT_UPDATE',
  'CUSTOMER_CREATE',
  'EXPENSE_CREATE',
];

describe('Hors ligne — nature de l echec', () => {
  it('seule une panne reseau franche est une panne reseau', () => {
    expect(isNetworkFailure(RESEAU)).toBe(true);
    expect(isNetworkFailure(SESSION_EXPIREE)).toBe(false);
    expect(isNetworkFailure(new Error('boom'))).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
  });

  it('les refus prononces avant toute ecriture sont reconnus comme tels', () => {
    for (const refus of [SESSION_EXPIREE, ABONNEMENT, LECTURE_SEULE, TROP_DE_REQUETES]) {
      expect(wroteNothing(refus)).toBe(true);
    }
    // Un refus metier, lui, a pu etre prononce apres coup : on ne presume rien.
    expect(wroteNothing(VALIDATION)).toBe(false);
    expect(wroteNothing(QUOTA)).toBe(false);
  });

  it('une ressource absente cote serveur est distinguee des autres refus', () => {
    expect(isMissingResource(PRODUIT_INTROUVABLE)).toBe(true);
    expect(isMissingResource(VALIDATION)).toBe(false);
  });
});

describe('Hors ligne — que devient une ecriture qui echoue', () => {
  it('reseau coupe : tout est garde et retente, quel que soit le type', () => {
    for (const kind of TOUS_LES_TYPES) {
      const { decision, canRetry } = decideAfterFailure(kind, RESEAU);
      expect(decision.action).toBe('RETRY_LATER');
      expect(canRetry).toBe(true);
    }
  });

  it('session expiree pendant une longue coupure : rien n est jete', () => {
    // C est LE cas qui faisait perdre les produits saisis en mode avion : le
    // serveur repond 401, rien n a ete cree, mais la file jetait la ligne.
    for (const kind of TOUS_LES_TYPES) {
      const { decision, canRetry } = decideAfterFailure(kind, SESSION_EXPIREE);
      expect(decision.action).toBe('KEEP_AND_BLOCK');
      expect(canRetry).toBe(true);
    }
  });

  it('abonnement echu ou boutique en lecture seule : garde aussi, le temps de regulariser', () => {
    expect(decideAfterFailure('PRODUCT_CREATE', ABONNEMENT).decision.action).toBe('KEEP_AND_BLOCK');
    expect(decideAfterFailure('PRODUCT_CREATE', LECTURE_SEULE).decision.action).toBe('KEEP_AND_BLOCK');
  });

  it('refus metier sur une commande : gardee, le serveur la dedoublonne', () => {
    const { decision, canRetry } = decideAfterFailure('ORDER_CREATE', VALIDATION);
    expect(decision.action).toBe('KEEP_AND_BLOCK');
    expect(canRetry).toBe(true);
  });

  it('refus metier sur une creation de produit ou de client : sortie de la file', () => {
    // Ni produit ni client n ont de garde-fou anti-doublon en base : la
    // creation a peut-etre abouti, la rejouer creerait un second exemplaire.
    for (const kind of ['PRODUCT_CREATE', 'CUSTOMER_CREATE'] as PendingKind[]) {
      const { decision, canRetry } = decideAfterFailure(kind, QUOTA);
      expect(decision.action).toBe('DROP');
      expect(canRetry).toBe(false);
    }
  });

  it('le bouton Reessayer n apparait jamais quand rejouer ferait un doublon', () => {
    expect(decideAfterFailure('PRODUCT_CREATE', VALIDATION).canRetry).toBe(false);
    expect(decideAfterFailure('PRODUCT_UPDATE', VALIDATION).canRetry).toBe(true);
  });

  it('les entites dedoublonnees en base sont bien celles qui portent un clientUuid unique', () => {
    expect(SERVER_DEDUPLICATED.ORDER_CREATE).toBe(true);
    expect(SERVER_DEDUPLICATED.EXPENSE_CREATE).toBe(true);
    expect(SERVER_DEDUPLICATED.PRODUCT_UPDATE).toBe(true);
    expect(SERVER_DEDUPLICATED.PRODUCT_CREATE).toBe(false);
    expect(SERVER_DEDUPLICATED.CUSTOMER_CREATE).toBe(false);
  });
});

describe('Hors ligne — cadence des tentatives', () => {
  it('le delai double a chaque essai', () => {
    expect(retryDelayMs(1)).toBe(2_000);
    expect(retryDelayMs(2)).toBe(4_000);
    expect(retryDelayMs(3)).toBe(8_000);
    expect(retryDelayMs(4)).toBe(16_000);
  });

  it('il est plafonne a une minute : une coupure d une heure ne repousse pas la reprise', () => {
    expect(retryDelayMs(10)).toBe(60_000);
    expect(retryDelayMs(100)).toBe(60_000);
  });

  it('un compteur a zero ou negatif ne produit jamais de delai nul ni negatif', () => {
    expect(retryDelayMs(0)).toBeGreaterThan(0);
    expect(retryDelayMs(-5)).toBeGreaterThan(0);
  });
});

describe('Hors ligne — ce qui reste a l ecran pendant la reprise', () => {
  const enAttente = new Set(['local-1']);

  it('une saisie non encore envoyee reste visible quand le serveur repond', () => {
    // Le cas qui faisait disparaitre un produit cree en mode avion au
    // redemarrage : l instantane local ne contient que la version serveur.
    const serveur = [{ id: 'srv-1', nom: 'Deja sur le serveur' }];
    const local = [
      { id: 'local-1', nom: 'Cree hors ligne' },
      { id: 'srv-1', nom: 'Deja sur le serveur' },
    ];
    const fusion = mergePending(serveur, local, enAttente);
    expect(fusion.map((r) => r.id)).toEqual(['local-1', 'srv-1']);
  });

  it('la saisie confirmee entre-temps n apparait pas deux fois', () => {
    const serveur = [{ id: 'local-1', nom: 'Confirme depuis' }];
    const local = [{ id: 'local-1', nom: 'Version locale' }];
    const fusion = mergePending(serveur, local, enAttente);
    expect(fusion).toHaveLength(1);
    expect(fusion[0].nom).toBe('Confirme depuis');
  });

  it('une ligne locale qui n est plus dans la file disparait au profit du serveur', () => {
    const serveur = [{ id: 'srv-1', nom: 'Serveur' }];
    const local = [{ id: 'orphelin', nom: 'Plus en file' }];
    expect(mergePending(serveur, local, enAttente).map((r) => r.id)).toEqual(['srv-1']);
  });

  it('file vide : l ecran suit exactement le serveur', () => {
    const serveur = [{ id: 'srv-1', nom: 'Serveur' }];
    const local = [{ id: 'local-1', nom: 'Vieux reste' }];
    expect(mergePending(serveur, local, new Set())).toEqual(serveur);
  });

  it('serveur vide : ce qui attend en file reste affiche', () => {
    const local = [{ id: 'local-1', nom: 'Cree hors ligne' }];
    expect(mergePending([], local, enAttente)).toEqual(local);
  });

  it('les saisies en attente passent devant, pour rester sous les yeux', () => {
    const serveur = [{ id: 'srv-1' }, { id: 'srv-2' }];
    const local = [{ id: 'srv-1' }, { id: 'local-1' }];
    expect(mergePending(serveur, local, enAttente)[0].id).toBe('local-1');
  });
});
