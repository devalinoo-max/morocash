import { api, generateClientUuid } from './client';
import type { StockMovement, StockReception, StockCount, StockReceptionLine } from '../types';
import type { ApiOrder } from './orders';

export interface ApiStockMovement {
  id: string;
  productId: string;
  clientUuid: string;
  type: 'ENTREE' | 'SORTIE' | 'RETOUR' | 'CASSE' | 'PERTE' | 'INVENTAIRE';
  quantite: number;
  stockAvant: number;
  stockApres: number;
  motif: string | null;
  fournisseur: string | null;
  note: string | null;
  justificatifUrl: string | null;
  orderId: string | null;
  receptionId: string | null;
  countId: string | null;
  annule: boolean;
  mouvementInverseId: string | null;
  userId: string;
  createdAt: string;
  // Absents pour un SELLER (spec §0 règle 7).
  prixAchatUnitaire?: number;
  coutUnitaire?: number;
}

export interface ApiStockReception {
  id: string;
  clientUuid: string;
  fournisseur: string | null;
  note: string | null;
  justificatifUrl: string | null;
  totalArticles: number;
  totalMontant: number;
  userId: string;
  createdAt: string;
}

export interface ApiStockCount {
  id: string;
  clientUuid: string;
  perimetre: string;
  nbProduits: number;
  nbEcarts: number;
  ecartUnites: number;
  ecartValeur: number;
  commentaire: string | null;
  userId: string;
  createdAt: string;
}

export function listMovements(productId?: string) {
  const query = productId ? `?productId=${productId}` : '';
  return api.get<{ movements: ApiStockMovement[] }>(`/stock/movements${query}`).then((d) => d.movements);
}

/** Réservé OWNER/ACCOUNTANT côté backend (totalMontant = coût d'achat). */
export function listReceptions() {
  return api.get<{ receptions: ApiStockReception[] }>('/stock/receptions').then((d) => d.receptions);
}

/** Réservé OWNER/ACCOUNTANT côté backend (ecartValeur = donnée financière). */
export function listCounts() {
  return api.get<{ counts: ApiStockCount[] }>('/stock/counts').then((d) => d.counts);
}

export function createReception(input: {
  fournisseur?: string;
  note?: string;
  lines: StockReceptionLine[];
}) {
  const clientUuid = generateClientUuid();
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; reception: ApiStockReception }>('/stock/receptions', {
      clientUuid,
      fournisseur: input.fournisseur,
      note: input.note,
      lignes: input.lines.map((l) => ({
        productId: l.productId,
        quantite: l.quantity,
        prixAchatUnitaire: l.purchasePrice,
      })),
    })
    .then((d) => d.reception);
}

export function createAdjustment(input: {
  productId: string;
  type: 'CASSE' | 'PERTE';
  quantite: number;
  motif: string;
  note?: string;
}) {
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; movement: ApiStockMovement }>('/stock/adjustments', {
      clientUuid: generateClientUuid(),
      ...input,
    })
    .then((d) => d.movement);
}

export function createStockCount(input: {
  perimetre?: string;
  commentaire?: string;
  lines: { productId: string; countedQty: number }[];
}) {
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; count: ApiStockCount }>('/stock/counts', {
      clientUuid: generateClientUuid(),
      perimetre: input.perimetre,
      commentaire: input.commentaire,
      lignes: input.lines.map((l) => ({ productId: l.productId, stockCompte: l.countedQty })),
    })
    .then((d) => d.count);
}

export function cancelMovement(movementId: string) {
  return api.post<{ inverse: ApiStockMovement }>(`/stock/movements/${movementId}/cancel`).then((d) => d.inverse);
}

/**
 * Le backend ne renseigne pas `motif` pour les mouvements ENTREE (réception),
 * SORTIE (vente) ni INVENTAIRE (comptage) — contrairement à l'ancien prototype
 * mock qui le générait localement. On le reconstruit ici à l'affichage à partir
 * des listes déjà chargées (commandes, réceptions) plutôt que de le stocker.
 */
export function toFrontendStockMovement(
  m: ApiStockMovement,
  ctx: {
    productName?: string;
    userName: string;
    orders?: ApiOrder[];
    receptions?: ApiStockReception[];
  }
): StockMovement {
  let motif = m.motif ?? undefined;
  let orderReference: string | undefined;
  let fournisseur = m.fournisseur ?? undefined;

  if (m.type === 'SORTIE' && m.orderId && ctx.orders) {
    const order = ctx.orders.find((o) => o.id === m.orderId);
    if (order) {
      orderReference = order.numero;
      motif = `Commande ${order.numero}`;
    }
  } else if (m.type === 'ENTREE' && m.receptionId && ctx.receptions) {
    const reception = ctx.receptions.find((r) => r.id === m.receptionId);
    if (reception) {
      fournisseur = reception.fournisseur ?? undefined;
      motif = reception.fournisseur ? `Réception — ${reception.fournisseur}` : 'Réception de stock';
    }
  } else if (m.type === 'INVENTAIRE' && !motif) {
    motif = 'Écart de comptage';
  }

  return {
    id: m.id,
    business_id: '',
    product_id: m.productId,
    product_name: ctx.productName,
    client_uuid: m.clientUuid,
    type: m.type,
    quantite: m.quantite,
    stock_avant: m.stockAvant,
    stock_apres: m.stockApres,
    prix_achat_unitaire: m.prixAchatUnitaire,
    cout_unitaire: m.coutUnitaire ?? 0,
    motif,
    fournisseur,
    note: m.note ?? undefined,
    justificatif_url: m.justificatifUrl ?? undefined,
    order_id: m.orderId ?? undefined,
    order_reference: orderReference,
    stock_reception_id: m.receptionId ?? undefined,
    annule: m.annule,
    mouvement_inverse_id: m.mouvementInverseId ?? undefined,
    user_id: m.userId,
    user_name: ctx.userName,
    created_at: m.createdAt,
  };
}

export function toFrontendStockReception(r: ApiStockReception, userName: string): StockReception {
  return {
    id: r.id,
    business_id: '',
    fournisseur: r.fournisseur ?? undefined,
    note: r.note ?? undefined,
    justificatif_url: r.justificatifUrl ?? undefined,
    total_articles: r.totalArticles,
    total_montant: r.totalMontant,
    expense_id: '',
    user_id: r.userId,
    user_name: userName,
    created_at: r.createdAt,
  };
}

export function toFrontendStockCount(c: ApiStockCount, userName: string): StockCount {
  return {
    id: c.id,
    business_id: '',
    perimetre: c.perimetre,
    nb_produits: c.nbProduits,
    nb_ecarts: c.nbEcarts,
    ecart_unites: c.ecartUnites,
    ecart_valeur: c.ecartValeur,
    commentaire: c.commentaire ?? undefined,
    user_id: c.userId,
    user_name: userName,
    created_at: c.createdAt,
  };
}
