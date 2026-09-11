import { describe, it, expect } from 'vitest';
import {
  applySaleToStock,
  buildOptimisticSale,
  computeDiscount,
  paymentStatusFor,
  provisionalReference,
  revertSaleFromStock,
} from '../../frontend/src/offline/optimistic';
import { generateReceiptWhatsAppText } from '../../frontend/src/utils/receiptHelpers';
import { generateReceiptsPdfBuffer } from '../../frontend/server/receiptPdfGenerator';
import type { CartItem, Product, ShopSettings } from '../../frontend/src/types';

/**
 * Ce que l'ecran calcule au moment du clic, avant toute reponse du serveur.
 *
 * Ces valeurs sont celles imprimees sur le recu remis au client : si elles
 * divergent de ce que le serveur enregistre (voir sale-flow.test.ts), le
 * commercant remet un papier qui ne correspond pas a sa comptabilite. Les
 * deux suites doivent donc rester d'accord sur les memes regles de calcul.
 */

function produit(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Sac raphia',
    salePrice: 12_000,
    purchasePrice: 7_000,
    stock: 10,
    alertThreshold: 2,
    category: 'SAC',
    unit: 'piece',
    salesCount: 0,
    createdAt: '2026-09-01T10:00:00.000Z',
    ...over,
  } as Product;
}

function ligne(p: Product, quantity: number): CartItem {
  return { product: p, quantity, unitPrice: p.salePrice };
}

describe('Panier — remise', () => {
  it('pourcentage : arrondi a l unite, comme le serveur', () => {
    expect(computeDiscount(60_000, 'PERCENTAGE', 10)).toBe(6_000);
    // 12 345 * 7 % = 864,15 -> 864 (Math.round), identique cote serveur.
    expect(computeDiscount(12_345, 'PERCENTAGE', 7)).toBe(864);
  });

  it('montant : applique tel quel', () => {
    expect(computeDiscount(12_000, 'AMOUNT', 2_000)).toBe(2_000);
  });

  it('jamais superieure au sous-total', () => {
    expect(computeDiscount(12_000, 'AMOUNT', 999_999)).toBe(12_000);
    expect(computeDiscount(12_000, 'PERCENTAGE', 300)).toBe(12_000);
  });

  it('remise absente, nulle ou negative : sans effet', () => {
    expect(computeDiscount(12_000, undefined, 10)).toBe(0);
    expect(computeDiscount(12_000, 'AMOUNT', 0)).toBe(0);
    expect(computeDiscount(12_000, 'AMOUNT', -500)).toBe(0);
  });
});

describe('Panier — statut de paiement', () => {
  it('deduit du montant recu, jamais choisi', () => {
    expect(paymentStatusFor(10_000, 0)).toBe('CREDIT');
    expect(paymentStatusFor(10_000, 4_000)).toBe('PARTIAL');
    expect(paymentStatusFor(10_000, 10_000)).toBe('PAID');
    expect(paymentStatusFor(10_000, 15_000)).toBe('PAID');
  });

  it('commande a zero franc (remise totale) : consideree payee', () => {
    expect(paymentStatusFor(0, 0)).toBe('PAID');
  });
});

describe('Vente optimiste — ce qui s affiche avant la reponse du serveur', () => {
  it('totaux, reste du et statut sont coherents', () => {
    const sale = buildOptimisticSale({
      clientUuid: 'uuid-1',
      cart: [ligne(produit(), 2), ligne(produit({ id: 'p2', name: 'Tapis', salePrice: 45_000 }), 1)],
      paidAmount: 20_000,
      paymentMethod: 'CASH',
      discountMode: 'PERCENTAGE',
      discountValue: 10,
      customerId: 'c1',
      customerName: 'Mme Kone',
      sellerName: 'Vendeur',
    });

    expect(sale.subtotal).toBe(69_000);
    expect(sale.discount).toBe(6_900);
    expect(sale.totalAmount).toBe(62_100);
    expect(sale.paidAmount).toBe(20_000);
    expect(sale.remainingAmount).toBe(42_100);
    expect(sale.paymentStatus).toBe('PARTIAL');
    expect(sale.syncStatus).toBe('PENDING_SYNC');
    expect(sale.items).toHaveLength(2);
  });

  it('le montant paye ne depasse jamais le total : pas de rejet serveur au moment de l envoi', () => {
    const sale = buildOptimisticSale({
      clientUuid: 'uuid-2',
      cart: [ligne(produit(), 1)],
      paidAmount: 99_000,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Vendeur',
    });
    expect(sale.paidAmount).toBe(12_000);
    expect(sale.remainingAmount).toBe(0);
    expect(sale.paymentStatus).toBe('PAID');
  });

  it('le numero provisoire est reconnaissable comme provisoire', () => {
    expect(provisionalReference(new Date('2026-09-11T08:30:45.000Z'))).toMatch(/^EN-ATTENTE-\d{6}$/);
  });

  it('le stock baisse a l ecran des la validation, et remonte si le serveur refuse', () => {
    const catalogue = [produit(), produit({ id: 'p2', name: 'Service pose', stock: 0, isService: true })];
    const sale = buildOptimisticSale({
      clientUuid: 'uuid-3',
      cart: [ligne(catalogue[0], 3), ligne(catalogue[1], 1)],
      paidAmount: 0,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Vendeur',
    });

    const apres = applySaleToStock(catalogue, sale);
    expect(apres[0].stock).toBe(7);
    // Un service n a pas de stock : il ne doit jamais etre decremente.
    expect(apres[1].stock).toBe(0);

    const annule = revertSaleFromStock(apres, sale);
    expect(annule[0].stock).toBe(10);
    expect(annule[1].stock).toBe(0);
  });
});

describe('Recu — texte WhatsApp', () => {
  const settings = {
    shopName: 'Original Galerie',
    city: 'Abidjan',
    ownerPhone: '0546926879',
    showPhone: true,
    receiptMessage: 'Merci de ta confiance !',
  } as ShopSettings;

  const sale = buildOptimisticSale({
    clientUuid: 'uuid-4',
    cart: [ligne(produit(), 2)],
    paidAmount: 10_000,
    paymentMethod: 'CASH',
    discountMode: 'AMOUNT',
    discountValue: 4_000,
    customerId: 'c1',
    customerName: 'Mme Kone',
    sellerName: 'Awa',
  });

  it('contient boutique, client, lignes, remise, total et reste du', () => {
    const texte = generateReceiptWhatsAppText(sale, settings);
    expect(texte).toContain('ORIGINAL GALERIE');
    expect(texte).toContain('Abidjan');
    expect(texte).toContain('0546926879');
    expect(texte).toContain('Mme Kone');
    expect(texte).toContain('Sac raphia');
    expect(texte).toContain('Remise');
    expect(texte).toContain('Reste à payer');
    expect(texte).toContain('Merci de ta confiance !');
  });

  it('une vente soldee annonce le paiement integral, sans reste a payer', () => {
    const soldee = buildOptimisticSale({
      clientUuid: 'uuid-5',
      cart: [ligne(produit(), 1)],
      paidAmount: 12_000,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Awa',
    });
    const texte = generateReceiptWhatsAppText(soldee, settings);
    expect(texte).toContain('PAYÉ INTÉGRALEMENT');
    expect(texte).not.toContain('Reste à payer');
  });

  it('sans client nomme, le recu reste imprimable', () => {
    const passage = buildOptimisticSale({
      clientUuid: 'uuid-6',
      cart: [ligne(produit(), 1)],
      paidAmount: 0,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Awa',
    });
    expect(generateReceiptWhatsAppText(passage, settings)).toContain('Client de passage');
  });
});

describe('Recu — PDF a imprimer', () => {
  const settings = {
    shopName: 'Original Galerie',
    city: 'Abidjan',
    ownerPhone: '0546926879',
    showPhone: true,
  };

  const sale = {
    id: 's1',
    reference: 'CMD-20260911-0001',
    items: [
      { name: 'Sac raphia', unitPrice: 12_000, quantity: 2, total: 24_000 },
      { name: 'Tapis berbere tres long libelle qui doit passer a la ligne', unitPrice: 45_000, quantity: 1, total: 45_000 },
    ],
    subtotal: 69_000,
    discount: 6_900,
    totalAmount: 62_100,
    paidAmount: 20_000,
    remainingAmount: 42_100,
    paymentMethod: 'CASH',
    customerName: 'Mme Kone',
    customerPhone: '0700000000',
    createdAt: '2026-09-11T09:00:00.000Z',
    sellerName: 'Awa',
  };

  /**
   * Le papier de la boutique fait 105 mm de large au maximum : un recu plus
   * large sort rogne. La largeur est lue dans la MediaBox du PDF, c'est-a-dire
   * exactement ce que l'imprimante applique.
   */
  function largeurMm(pdf: Buffer): number {
    const box = /MediaBox\s*\[([^\]]+)\]/.exec(pdf.toString('latin1'));
    if (!box) throw new Error('PDF sans MediaBox');
    const [, , largeurPt] = box[1].trim().split(/\s+/).map(Number);
    return Number(((largeurPt * 25.4) / 72).toFixed(2));
  }

  it('copie client : 105 mm de large', async () => {
    const pdf = await generateReceiptsPdfBuffer({ sales: [sale], settings, isMerchantCopy: false });
    expect(largeurMm(pdf)).toBe(105);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('copie commercant : 105 mm de large aussi', async () => {
    const pdf = await generateReceiptsPdfBuffer({ sales: [sale], settings, isMerchantCopy: true });
    expect(largeurMm(pdf)).toBe(105);
  });

  it('impression groupee : une page par commande', async () => {
    const pdf = await generateReceiptsPdfBuffer({
      sales: [sale, { ...sale, id: 's2', reference: 'CMD-20260911-0002' }],
      settings,
      isMerchantCopy: false,
    });
    const pages = pdf.toString('latin1').match(/MediaBox/g) ?? [];
    expect(pages.length).toBeGreaterThanOrEqual(2);
  });
});
