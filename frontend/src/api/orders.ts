import { api, generateClientUuid } from './client';
import { toApiPaymentMethode, toFrontendPaymentMethod, toFrontendPaymentStatus } from './mappers';
import type { Sale, SaleItem, PaymentMethod } from '../types';

export interface ApiOrderItem {
  id: string;
  productId: string | null;
  libelle: string;
  qte: number;
  prixUnitaire: number;
  totalLigne: number;
  // Absent pour un SELLER (spec §0 règle 7).
  coutUnitaire?: number;
}

export interface ApiPayment {
  id: string;
  orderId: string | null;
  customerId: string;
  montant: number;
  methode: string;
  type: string;
  statut: string;
  createdAt: string;
}

export interface ApiOrder {
  id: string;
  clientUuid: string;
  numero: string;
  customerId: string;
  sousTotal: number;
  remiseMode?: 'POURCENTAGE' | 'MONTANT' | null;
  remiseValeur?: number | null;
  remiseMontant: number;
  total: number;
  statutPaiement: 'CREDIT' | 'PARTIELLE' | 'PAYEE';
  statut: 'VALIDEE' | 'ANNULEE';
  motifAnnulation?: string | null;
  createdAt: string;
  items: ApiOrderItem[];
  payments: ApiPayment[];
  // Absent pour un SELLER (spec §0 règle 7).
  coutTotal?: number;
}

export interface CreateOrderInput {
  clientUuid: string;
  customerId: string;
  items: { productId: string; qte: number }[];
  remiseMode?: 'POURCENTAGE' | 'MONTANT';
  remiseValeur?: number;
  montantRecu: number;
  methode: string;
}

export function listOrders() {
  return api.get<{ orders: ApiOrder[] }>('/orders').then((d) => d.orders);
}

export function createOrder(input: CreateOrderInput) {
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; order: ApiOrder }>('/orders', input)
    .then((d) => d.order);
}

export function cancelOrder(orderId: string, motif: string) {
  return api.post<{ order: ApiOrder }>(`/orders/${orderId}/cancel`, { motif }).then((d) => d.order);
}

function toSaleItem(item: ApiOrderItem): SaleItem {
  return {
    productId: item.productId ?? '',
    name: item.libelle,
    unitPrice: item.prixUnitaire,
    costPrice: item.coutUnitaire,
    quantity: item.qte,
    total: item.totalLigne,
  };
}

export function toFrontendSale(
  order: ApiOrder,
  opts: { customerName?: string; customerPhone?: string; sellerName?: string }
): Sale {
  const validPayments = order.payments.filter((p) => p.statut === 'VALIDE');
  const paidAmount = validPayments.reduce((acc, p) => acc + p.montant, 0);
  const lastMethode = validPayments.at(-1)?.methode;
  const paymentMethod: PaymentMethod = lastMethode ? toFrontendPaymentMethod(lastMethode) : 'CASH';

  return {
    id: order.id,
    clientUuid: order.clientUuid,
    reference: order.numero,
    items: order.items.map(toSaleItem),
    subtotal: order.sousTotal,
    discount: order.remiseMontant,
    discountMode: order.remiseMode === 'POURCENTAGE' ? 'PERCENTAGE' : order.remiseMode === 'MONTANT' ? 'AMOUNT' : undefined,
    discountValue: order.remiseValeur ?? undefined,
    totalAmount: order.total,
    paidAmount,
    remainingAmount: Math.max(0, order.total - paidAmount),
    paymentStatus: toFrontendPaymentStatus(order.statutPaiement),
    paymentMethod,
    customerId: order.customerId,
    customerName: opts.customerName,
    customerPhone: opts.customerPhone,
    createdAt: order.createdAt,
    sellerName: opts.sellerName ?? 'Vendeur',
    syncStatus: 'SYNCED',
    isCancelled: order.statut === 'ANNULEE',
    cancelReason: order.motifAnnulation ?? undefined,
  };
}

export function toCreateOrderInput(params: {
  clientUuid?: string;
  customerId: string;
  items: { productId: string; quantity: number }[];
  remiseMode?: 'PERCENTAGE' | 'AMOUNT';
  remiseValeur?: number;
  montantRecu: number;
  methode: PaymentMethod;
}): CreateOrderInput {
  return {
    clientUuid: params.clientUuid ?? generateClientUuid(),
    customerId: params.customerId,
    items: params.items.map((i) => ({ productId: i.productId, qte: i.quantity })),
    remiseMode: params.remiseMode
      ? params.remiseMode === 'PERCENTAGE'
        ? 'POURCENTAGE'
        : 'MONTANT'
      : undefined,
    remiseValeur: params.remiseValeur,
    montantRecu: params.montantRecu,
    methode: toApiPaymentMethode(params.methode),
  };
}
