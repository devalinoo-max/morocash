import { describe, it, expect } from 'vitest';
import { findProductByCode, productMatchesCode } from '../../frontend/src/utils/productCodeLookup';
import {
  computePeriodInterval,
  countByStatus,
  filterSales,
  sumSales,
} from '../../frontend/src/utils/salesFilters';
import { toFrontendProduct } from '../../frontend/src/api/products';
import type { Product, Sale } from '../../frontend/src/types';

/**
 * Les deux actions de l'ecran de vente qui ne touchent pas la base : scanner un
 * article pour le mettre au panier, et retrouver une commande dans l'historique.
 */

function produit(over: Partial<Product> = {}): Product {
  return {
    id: 'cmtprod0001',
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

describe('Scan — reconnaissance du code', () => {
  const catalogue = [
    produit({ id: 'cmtA', name: 'Sac raphia', internalCode: 'INT-612332909' }),
    produit({ id: 'cmtB', name: 'Lait concentre', barcode: '3017620422003' }),
    produit({
      id: 'cmtC',
      name: 'Tapis berbere',
      productCodes: [
        {
          id: 'code-1',
          business_id: 'b1',
          product_id: 'cmtC',
          code: 'INT-409664751',
          format: 'QR',
          origine: 'GENERE',
          est_principal: true,
          created_at: '2026-09-01T10:00:00.000Z',
        },
      ],
    }),
    produit({ id: 'cmtD', name: 'Chandelier sans code' }),
  ];

  it('le QR interne genere par le serveur ramene le bon produit', () => {
    expect(findProductByCode(catalogue, 'INT-612332909')?.name).toBe('Sac raphia');
  });

  it('le code-barres du fabricant fonctionne aussi', () => {
    expect(findProductByCode(catalogue, '3017620422003')?.name).toBe('Lait concentre');
  });

  it('un code enregistre dans productCodes est reconnu', () => {
    expect(findProductByCode(catalogue, 'INT-409664751')?.name).toBe('Tapis berbere');
  });

  it('les etiquettes anciennes, qui portent l identifiant du produit, scannent encore', () => {
    expect(findProductByCode(catalogue, 'cmtD')?.name).toBe('Chandelier sans code');
  });

  it('casse et espaces parasites du scanner sont ignores', () => {
    expect(findProductByCode(catalogue, '  int-612332909  ')?.name).toBe('Sac raphia');
  });

  it('un code inconnu ne ramene rien, et un code vide non plus', () => {
    expect(findProductByCode(catalogue, 'INT-000000000')).toBeUndefined();
    expect(findProductByCode(catalogue, '   ')).toBeUndefined();
    expect(productMatchesCode(catalogue[0], '')).toBe(false);
  });

  /**
   * Le bug de fond : le serveur genere le code, le frontend doit le recevoir.
   * Sans ce mapping, l'etiquette portait un code que le catalogue ignorait et
   * TOUS les scans repondaient "produit introuvable".
   */
  it('le produit renvoye par l API arrive au catalogue avec son code, et se scanne', () => {
    const duServeur = toFrontendProduct(
      {
        id: 'cmtE',
        nom: 'Objet deco',
        type: 'PRODUIT',
        prixVente: 8_500,
        stock: 4,
        seuilAlerte: 1,
        unite: 'piece',
        categoryId: null,
        actif: true,
        createdAt: '2026-09-08T10:00:00.000Z',
        codes: [
          {
            id: 'c1',
            code: 'INT-747408112',
            format: 'QR',
            origine: 'GENERE',
            estPrincipal: true,
            createdAt: '2026-09-08T10:00:00.000Z',
          },
        ],
      },
      'DECORATION'
    );

    expect(duServeur.internalCode).toBe('INT-747408112');
    expect(duServeur.productCodes).toHaveLength(1);
    expect(findProductByCode([duServeur], 'INT-747408112')?.name).toBe('Objet deco');
  });
});

function vente(over: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    reference: 'CMD-20260910-0001',
    items: [{ productId: 'p1', name: 'Sac raphia', unitPrice: 12_000, costPrice: 0, quantity: 1, total: 12_000 }],
    subtotal: 12_000,
    discount: 0,
    totalAmount: 12_000,
    paidAmount: 12_000,
    remainingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    customerName: 'Mme Kone',
    customerPhone: '0700000000',
    createdAt: '2026-09-10T10:00:00.000Z',
    sellerName: 'Awa',
    ...over,
  } as Sale;
}

describe('Historique — periodes', () => {
  const maintenant = new Date(2026, 8, 11, 14, 0, 0); // 11 septembre 2026

  it('aujourd hui couvre la journee entiere', () => {
    const { start, end } = computePeriodInterval('today', '', '', maintenant);
    expect(start.getDate()).toBe(11);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(11);
    expect(end.getHours()).toBe(23);
  });

  it('7 jours inclut aujourd hui, soit du 5 au 11', () => {
    const { start, end } = computePeriodInterval('7days', '', '', maintenant);
    expect(start.getDate()).toBe(5);
    expect(end.getDate()).toBe(11);
  });

  it('ce mois-ci va du 1er au dernier jour du mois', () => {
    const { start, end } = computePeriodInterval('thisMonth', '', '', maintenant);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(8);
    expect(end.getDate()).toBe(30); // septembre
  });

  it('periode personnalisee : bornes incluses', () => {
    const { start, end } = computePeriodInterval('custom', '2026-09-01', '2026-09-05', maintenant);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(5);
    expect(end.getHours()).toBe(23);
  });

  it('champ de date vide : on retombe sur aujourd hui au lieu de vider l ecran', () => {
    const { start, end } = computePeriodInterval('custom', '', '', maintenant);
    expect(Number.isNaN(start.getTime())).toBe(false);
    expect(Number.isNaN(end.getTime())).toBe(false);
    expect(start.getDate()).toBe(11);
  });

  it('bornes inversees : remises dans l ordre', () => {
    const { start, end } = computePeriodInterval('custom', '2026-09-10', '2026-09-02', maintenant);
    expect(start.getDate()).toBe(2);
    expect(end.getDate()).toBe(10);
  });
});

describe('Historique — filtres et total', () => {
  const interval = computePeriodInterval('custom', '2026-09-01', '2026-09-30', new Date(2026, 8, 11));

  const ventes: Sale[] = [
    vente({ id: 'a', reference: 'CMD-20260910-0001', paymentStatus: 'PAID', totalAmount: 12_000 }),
    vente({
      id: 'b',
      reference: 'CMD-20260910-0002',
      paymentStatus: 'CREDIT',
      totalAmount: 45_000,
      paidAmount: 0,
      remainingAmount: 45_000,
      customerName: 'Mr Adou',
      sellerName: 'Ibrahim',
    }),
    vente({
      id: 'c',
      reference: 'CMD-20260910-0003',
      paymentStatus: 'PARTIAL',
      totalAmount: 30_000,
      paidAmount: 10_000,
      remainingAmount: 20_000,
    }),
    vente({
      id: 'd',
      reference: 'CMD-20260910-0004',
      paymentStatus: 'PAID',
      totalAmount: 99_000,
      isCancelled: true,
    }),
    vente({ id: 'e', reference: 'CMD-20260801-0009', createdAt: '2026-08-01T10:00:00.000Z' }),
  ];

  const tout = { interval, status: 'ALL' as const, seller: 'ALL', query: '' };

  it('la periode exclut ce qui est hors bornes', () => {
    const res = filterSales(ventes, tout);
    expect(res.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('filtre payees : ni credit, ni partielle, ni annulee', () => {
    const res = filterSales(ventes, { ...tout, status: 'PAID' });
    expect(res.map((s) => s.id)).toEqual(['a']);
  });

  it('une commande annulee n apparait que dans le filtre Annulees', () => {
    expect(filterSales(ventes, { ...tout, status: 'CANCELLED' }).map((s) => s.id)).toEqual(['d']);
    expect(filterSales(ventes, { ...tout, status: 'CREDIT' }).map((s) => s.id)).toEqual(['b']);
  });

  it('filtre par vendeur', () => {
    expect(filterSales(ventes, { ...tout, seller: 'Ibrahim' }).map((s) => s.id)).toEqual(['b']);
  });

  it('recherche par numero, client, vendeur, telephone ou article', () => {
    expect(filterSales(ventes, { ...tout, query: '0002' }).map((s) => s.id)).toEqual(['b']);
    expect(filterSales(ventes, { ...tout, query: 'adou' }).map((s) => s.id)).toEqual(['b']);
    expect(filterSales(ventes, { ...tout, query: 'ibrahim' }).map((s) => s.id)).toEqual(['b']);
    expect(filterSales(ventes, { ...tout, query: '0700000000' }).map((s) => s.id)).toHaveLength(4);
    expect(filterSales(ventes, { ...tout, query: 'raphia' })).toHaveLength(4);
    expect(filterSales(ventes, { ...tout, query: 'introuvable' })).toHaveLength(0);
  });

  it('les compteurs par statut correspondent aux listes filtrees', () => {
    const compteurs = countByStatus(ventes, interval);
    expect(compteurs.ALL).toBe(4);
    expect(compteurs.PAID).toBe(1);
    expect(compteurs.PARTIAL).toBe(1);
    expect(compteurs.CREDIT).toBe(1);
    expect(compteurs.CANCELLED).toBe(1);
    expect(compteurs.PAID + compteurs.PARTIAL + compteurs.CREDIT + compteurs.CANCELLED).toBe(
      compteurs.ALL
    );
  });

  it('le total affiche ignore les commandes annulees', () => {
    expect(sumSales(filterSales(ventes, tout))).toBe(12_000 + 45_000 + 30_000);
  });
});
