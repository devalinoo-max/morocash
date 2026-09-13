import type { CartItem, Customer, PaymentMethod, PaymentStatus, Product, Sale, SaleItem } from '../types';

/**
 * Construction locale de ce que le serveur repondra.
 *
 * Le serveur reste seul juge (il recalcule tout et c'est sa version qui
 * remplacera celle-ci des qu'elle arrive), mais l'ecran ne peut pas l'attendre :
 * entre le clic sur "Valider la commande" et le recu, il doit s'ecouler moins
 * de 300 ms, meme en mode avion. On calcule donc ici la meme chose que lui.
 */

/** Vibration courte au clic sur une action finale. Silencieuse si non supportee. */
export function haptic(durationMs = 30): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(durationMs);
    }
  } catch {
    // iOS Safari n'expose pas vibrate : l'absence de retour haptique n'est pas une erreur.
  }
}

export function computeDiscount(
  subtotal: number,
  mode: 'PERCENTAGE' | 'AMOUNT' | undefined,
  value: number | undefined
): number {
  if (!mode || !value || value <= 0) return 0;
  if (mode === 'PERCENTAGE') return Math.min(subtotal, Math.round((subtotal * value) / 100));
  return Math.min(subtotal, Math.round(value));
}

export function paymentStatusFor(total: number, paid: number): PaymentStatus {
  if (paid >= total) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'CREDIT';
}

/**
 * Numero provisoire, visiblement provisoire : le vrai numero (CMD-AAAAMMJJ-NNNN)
 * est attribue par le serveur, qui seul connait le compteur de la boutique.
 * Prefixe "EN-ATTENTE" plutot qu'un faux CMD- : mieux vaut un numero que le
 * commercant reconnait comme temporaire qu'un numero qui changera en douce.
 */
export function provisionalReference(createdAt: Date = new Date()): string {
  const stamp = createdAt
    .toISOString()
    .slice(0, 19)
    .replace(/[-:T]/g, '')
    .slice(8);
  return `EN-ATTENTE-${stamp}`;
}

export function buildOptimisticSale(params: {
  clientUuid: string;
  cart: CartItem[];
  paidAmount: number;
  paymentMethod: PaymentMethod;
  discountMode?: 'PERCENTAGE' | 'AMOUNT';
  discountValue?: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  sellerName: string;
}): Sale {
  const items: SaleItem[] = params.cart.map((line) => ({
    productId: line.product.id,
    name: line.product.name,
    unitPrice: line.unitPrice,
    costPrice: line.product.purchasePrice,
    quantity: line.quantity,
    total: line.unitPrice * line.quantity,
  }));

  const subtotal = items.reduce((sum, it) => sum + it.total, 0);
  const discount = computeDiscount(subtotal, params.discountMode, params.discountValue);
  const totalAmount = Math.max(0, subtotal - discount);
  const paidAmount = Math.max(0, Math.min(Math.round(params.paidAmount), totalAmount));

  return {
    id: params.clientUuid,
    clientUuid: params.clientUuid,
    reference: provisionalReference(),
    items,
    subtotal,
    discount,
    discountMode: params.discountMode,
    discountValue: params.discountValue,
    totalAmount,
    paidAmount,
    remainingAmount: Math.max(0, totalAmount - paidAmount),
    paymentStatus: paymentStatusFor(totalAmount, paidAmount),
    paymentMethod: params.paymentMethod,
    customerId: params.customerId,
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    notes: params.notes,
    createdAt: new Date().toISOString(),
    sellerName: params.sellerName,
    syncStatus: 'PENDING_SYNC',
  };
}

/** Stock decremente a l'ecran des la validation, comme le fera le serveur. */
export function applySaleToStock(products: Product[], sale: Sale): Product[] {
  return products.map((product) => {
    const line = sale.items.find((it) => it.productId === product.id);
    if (!line || product.isService) return product;
    return { ...product, stock: product.stock - line.quantity };
  });
}

/**
 * La dette suit la vente a l'ecran, comme le stock : le reste a payer s'ajoute
 * tout de suite a la dette du client. Sans ca, accueil, « Qui me doit » et
 * caisse affichaient le client « a jour » jusqu'au rechargement complet.
 */
export function applySaleToCustomerDebt(customers: Customer[], sale: Sale): Customer[] {
  if (!sale.customerId || sale.remainingAmount <= 0) return customers;
  return customers.map((c) =>
    c.id === sale.customerId
      ? { ...c, totalDebt: (c.totalDebt || 0) + sale.remainingAmount, debtAgeDays: Math.max(c.debtAgeDays || 0, 1) }
      : c
  );
}

/**
 * Soldes relus du serveur. Un solde illisible (`null`) garde le dernier montant
 * connu du client : il ne devient JAMAIS 0, ce qui effacait autrefois toutes les
 * dettes de l'app au moindre appel en echec.
 */
export function reconcileCustomerBalances(
  serverCustomers: Customer[],
  balances: (number | null)[],
  previous: Customer[]
): Customer[] {
  const known = new Map(previous.map((p) => [p.id, p]));
  return serverCustomers.map((c, i) => {
    const prev = known.get(c.id);
    if (balances[i] !== null || !prev) return c;
    return { ...c, totalDebt: prev.totalDebt, debtAgeDays: prev.debtAgeDays };
  });
}

/** Annulation du decompte ci-dessus quand le serveur refuse la commande. */
export function revertSaleFromStock(products: Product[], sale: Sale): Product[] {
  return products.map((product) => {
    const line = sale.items.find((it) => it.productId === product.id);
    if (!line || product.isService) return product;
    return { ...product, stock: product.stock + line.quantity };
  });
}

export function buildOptimisticProduct(
  localId: string,
  data: Omit<Product, 'id' | 'salesCount' | 'createdAt'>
): Product {
  return {
    ...data,
    id: localId,
    salesCount: 0,
    createdAt: new Date().toISOString(),
    syncStatus: 'PENDING_SYNC',
  };
}
