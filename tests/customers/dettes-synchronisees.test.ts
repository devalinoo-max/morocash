import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { cancelOrder } from '@/server/modules/orders/cancelOrder';
import { getCustomerBalance, getCustomerBalances, repayDebt } from '@/server/modules/customers/debt';
import {
  applySaleToCustomerDebt,
  buildOptimisticSale,
  reconcileCustomerBalances,
} from '../../frontend/src/offline/optimistic';
import type { CartItem, Customer, Product } from '../../frontend/src/types';

/**
 * Accueil (« Reste à encaisser »), « Qui me doit », caisse et fiche client
 * lisent TOUS la même valeur : `customers[].totalDebt` du contexte. Si elle est
 * juste, toutes les pages le sont ; si elle tombe à 0, toutes affichent 0.
 * Ces tests verrouillent les trois endroits où elle se fabrique.
 */

function client(over: Partial<Customer> = {}): Customer {
  return {
    id: 'c1',
    name: 'Mme Koné',
    phone: '',
    totalDebt: 0,
    debtAgeDays: 0,
    lastActivity: '2026-09-01T10:00:00.000Z',
    ...over,
  } as Customer;
}

function panier(prix: number, qte: number): CartItem[] {
  const product = { id: 'p1', name: 'Riz 5kg', salePrice: prix, stock: 50 } as Product;
  return [{ product, quantity: qte, unitPrice: prix }];
}

describe('Dette à l écran, dès la validation de la commande', () => {
  it('paiement partiel : le reste s ajoute à la dette du bon client', () => {
    const sale = buildOptimisticSale({
      clientUuid: 'u1',
      cart: panier(5_000, 3),
      paidAmount: 4_000,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Vendeur',
    });
    const apres = applySaleToCustomerDebt([client({ totalDebt: 1_500 }), client({ id: 'c2' })], sale);
    expect(apres[0].totalDebt).toBe(1_500 + 11_000);
    expect(apres[0].debtAgeDays).toBeGreaterThan(0);
    expect(apres[1].totalDebt).toBe(0);
  });

  it('il paie plus tard : tout le total devient dette', () => {
    const sale = buildOptimisticSale({
      clientUuid: 'u2',
      cart: panier(5_000, 2),
      paidAmount: 0,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Vendeur',
    });
    expect(applySaleToCustomerDebt([client()], sale)[0].totalDebt).toBe(10_000);
  });

  it('il paie tout : la dette ne bouge pas', () => {
    const sale = buildOptimisticSale({
      clientUuid: 'u3',
      cart: panier(5_000, 2),
      paidAmount: 10_000,
      paymentMethod: 'CASH',
      customerId: 'c1',
      sellerName: 'Vendeur',
    });
    const avant = [client({ totalDebt: 700 })];
    expect(applySaleToCustomerDebt(avant, sale)).toBe(avant);
  });
});

describe('Dette relue du serveur', () => {
  it('un solde illisible garde le dernier montant connu, jamais 0', () => {
    const serveur = [client({ totalDebt: 0 }), client({ id: 'c2', totalDebt: 0 })];
    const avant = [client({ totalDebt: 11_000, debtAgeDays: 3 }), client({ id: 'c2', totalDebt: 9_000 })];
    const apres = reconcileCustomerBalances(serveur, [null, 0], avant);
    expect(apres[0].totalDebt).toBe(11_000);
    expect(apres[0].debtAgeDays).toBe(3);
    // Solde bien lu : la valeur du serveur l emporte, même si elle est 0
    // (dette remboursée depuis un autre appareil).
    expect(apres[1].totalDebt).toBe(0);
  });

  it('un solde lu remplace la valeur affichée', () => {
    const apres = reconcileCustomerBalances([client({ totalDebt: 25_000 })], [25_000], [client({ totalDebt: 11_000 })]);
    expect(apres[0].totalDebt).toBe(25_000);
  });
});

describe('GET /customers — soldes de tous les clients en un seul calcul', () => {
  it('chaque solde groupé est identique au solde détaillé du client', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Sync Dettes', telephone: `225${Date.now().toString().slice(-9)}7`, pin: '123456' },
      {}
    );
    const ctx = {
      businessId: business.id,
      userId: owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
      cashRegisterMode: business.cashRegisterMode,
    };
    const product = await createProduct(business.id, {
      nom: 'Riz 5kg', type: 'PRODUIT', prixVente: 5_000, prixAchat: 3_000, stock: 100, seuilAlerte: 0, unite: 'sac',
    });
    const endette = await createCustomer(business.id, { nom: 'Client partiel' });
    const aJour = await createCustomer(business.id, { nom: 'Client à jour' });
    const sansCommande = await createCustomer(business.id, { nom: 'Client sans commande' });

    const vendre = (customerId: string, qte: number, montantRecu: number) =>
      createOrder(ctx, { clientUuid: randomUUID(), customerId, items: [{ productId: product.id, qte }], montantRecu, methode: 'ESPECES' });

    await vendre(endette.id, 3, 4_000); // reste 11 000
    await vendre(endette.id, 1, 0); // +5 000 à crédit
    const annulee = await vendre(endette.id, 2, 0); // annulée : ne compte pas
    await cancelOrder(ctx, annulee.order.id, 'Erreur de saisie');
    await repayDebt(ctx, endette.id, { clientUuid: randomUUID(), montant: 6_000, methode: 'ESPECES' });
    await vendre(aJour.id, 2, 10_000);

    const soldes = await getCustomerBalances(business.id);

    expect(soldes.get(endette.id)).toBe(11_000 + 5_000 - 6_000);
    expect(soldes.get(aJour.id) ?? 0).toBe(0);
    expect(soldes.get(sansCommande.id) ?? 0).toBe(0);

    for (const c of [endette, aJour, sansCommande]) {
      const detail = await getCustomerBalance(business.id, c.id);
      expect(soldes.get(c.id) ?? 0).toBe(detail.solde);
    }
  });
});
