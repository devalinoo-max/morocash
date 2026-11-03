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
  dateOperation: string;
  datePeremption: string | null;
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
  dateOperation: string;
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
  ecartValeurNette: number;
  valeurStockComptee: number;
  userId: string;
  dateOperation: string;
  createdAt: string;
}

/** Une ligne d'inventaire telle que la renvoie GET /stock/counts/:id. */
export interface ApiStockCountLine {
  productId: string;
  productName: string;
  unite: string;
  stockTheorique: number;
  stockCompte: number;
  ecart: number;
  coutUnitaire: number;
  valeurEcart: number;
  motif: string | null;
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

/**
 * `dateOperation` et `expiryDate` arrivent en AAAA-MM-JJ depuis les champs de
 * date du navigateur : `jourEnIso` les ramène à midi heure locale avant
 * l'envoi. Une date nue est lue par le serveur comme minuit UTC, ce qui place
 * l'opération la veille pour toute boutique à l'ouest de Greenwich — nos
 * utilisateurs y sont tous.
 */
function jourEnIso(jour?: string): string | undefined {
  if (!jour) return undefined;
  const [annee, mois, jourDuMois] = jour.split('-').map(Number);
  if (!annee || !mois || !jourDuMois) return undefined;
  return new Date(annee, mois - 1, jourDuMois, 12, 0, 0).toISOString();
}

export function createReception(input: {
  fournisseur?: string;
  note?: string;
  dateOperation?: string;
  lines: StockReceptionLine[];
}) {
  const clientUuid = generateClientUuid();
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; reception: ApiStockReception }>('/stock/receptions', {
      clientUuid,
      fournisseur: input.fournisseur,
      note: input.note,
      dateOperation: jourEnIso(input.dateOperation),
      lignes: input.lines.map((l) => ({
        productId: l.productId,
        quantite: l.quantity,
        prixAchatUnitaire: l.purchasePrice,
        datePeremption: jourEnIso(l.expiryDate),
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
  dateOperation?: string;
}) {
  const { dateOperation, ...reste } = input;
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; movement: ApiStockMovement }>('/stock/adjustments', {
      clientUuid: generateClientUuid(),
      ...reste,
      dateOperation: jourEnIso(dateOperation),
    })
    .then((d) => d.movement);
}

/**
 * Le détail d'un inventaire : ce qui a été compté, article par article.
 * Réservé au propriétaire et au comptable côté serveur (coûts unitaires).
 */
export function getCountDetail(countId: string) {
  return api.get<{ count: ApiStockCount; lines: ApiStockCountLine[] }>(
    `/stock/counts/${countId}`
  );
}

export function createStockCount(input: {
  perimetre?: string;
  commentaire?: string;
  dateOperation?: string;
  lines: { productId: string; countedQty: number; motif?: string }[];
}) {
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; count: ApiStockCount }>('/stock/counts', {
      clientUuid: generateClientUuid(),
      perimetre: input.perimetre,
      commentaire: input.commentaire,
      dateOperation: jourEnIso(input.dateOperation),
      lignes: input.lines.map((l) => ({
        productId: l.productId,
        stockCompte: l.countedQty,
        motif: l.motif,
      })),
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
    date_operation: m.dateOperation,
    date_peremption: m.datePeremption ?? undefined,
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
    date_operation: r.dateOperation,
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
    ecart_valeur_nette: c.ecartValeurNette,
    valeur_stock_comptee: c.valeurStockComptee,
    user_id: c.userId,
    user_name: userName,
    date_operation: c.dateOperation,
    created_at: c.createdAt,
  };
}
