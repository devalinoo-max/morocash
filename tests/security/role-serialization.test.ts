import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { getOrder } from '@/server/modules/orders/service';
import { createReception, listMovements } from '@/server/modules/stock/movements';
import { serializeProductList } from '@/server/serializers/product';
import { serializeOrder } from '@/server/serializers/order';
import { serializeStockMovementList } from '@/server/serializers/stockMovement';

/**
 * Test de sécurité obligatoire #2 (spec §12) : un SELLER ne reçoit jamais
 * prixAchat, cmp, ni marge dans le JSON brut. Étendu au fil des étapes suivantes
 * pour les dépenses et les écarts de caisse au fur et à mesure qu'ils existent.
 */
function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

describe('Sérialisation par rôle — produits', () => {
  it('le JSON pour un SELLER ne contient jamais prixAchat, cmp ni marge', async () => {
    const { business } = await registerBusiness(
      { businessNom: 'Test Serializer', telephone: uniquePhone('7'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Sac de riz 25kg',
      type: 'PRODUIT',
      prixVente: 15000,
      prixAchat: 11000,
      stock: 10,
      seuilAlerte: 2,
      unite: 'sac',
    });

    const [sellerView] = serializeProductList([product], 'SELLER');
    const [ownerView] = serializeProductList([product], 'OWNER');

    expect(sellerView).not.toHaveProperty('prixAchat');
    expect(sellerView).not.toHaveProperty('cmp');
    expect(sellerView).not.toHaveProperty('marge');
    expect(JSON.stringify(sellerView)).not.toMatch(/prixAchat|"cmp"|marge/);

    expect(ownerView).toHaveProperty('prixAchat', 11000);
    expect(ownerView).toHaveProperty('marge');
  });
});

/**
 * Extension du test de sécurité obligatoire #2 aux commandes (étape 13) :
 * GET /orders et /orders/:id renvoyaient jusqu'ici les enregistrements Prisma
 * bruts (coutTotal sur Order, coutUnitaire sur OrderItem) sans filtrage par
 * rôle, ce qui exposait le coût de revient à un SELLER — corrigé par
 * src/server/serializers/order.ts, verrouillé ici pour éviter une régression.
 */
describe('Sérialisation par rôle — commandes', () => {
  it('le JSON pour un SELLER ne contient jamais coutTotal ni coutUnitaire', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Test Serializer Orders', telephone: uniquePhone('9'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Stylo bleu',
      type: 'PRODUIT',
      prixVente: 500,
      prixAchat: 200,
      stock: 50,
      seuilAlerte: 5,
      unite: 'pièce',
    });

    const customer = await createCustomer(business.id, { nom: 'Client Test Orders' });

    const { order } = await createOrder(
      { businessId: business.id, userId: owner.id, role: 'SELLER', remiseMaxVendeur: 0 },
      {
        clientUuid: randomUUID(),
        customerId: customer.id,
        items: [{ productId: product.id, qte: 2 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }
    );

    const fullOrder = await getOrder(business.id, order.id);
    const sellerView = serializeOrder(fullOrder, 'SELLER');
    const ownerView = serializeOrder(fullOrder, 'OWNER');

    expect(sellerView).not.toHaveProperty('coutTotal');
    expect(sellerView.items.every((item) => !('coutUnitaire' in item))).toBe(true);
    expect(JSON.stringify(sellerView)).not.toMatch(/coutTotal|coutUnitaire/);

    expect(ownerView).toHaveProperty('coutTotal');
    expect(ownerView.items.every((item) => 'coutUnitaire' in item)).toBe(true);
  });
});

/**
 * Extension du test de sécurité obligatoire #2 aux mouvements de stock (étape
 * 13) : GET /stock/movements renvoyait coutUnitaire/prixAchatUnitaire à tous
 * les rôles sans filtrage — même classe de bug que pour les commandes,
 * corrigée par src/server/serializers/stockMovement.ts.
 */
describe('Sérialisation par rôle — mouvements de stock', () => {
  it('le JSON pour un SELLER ne contient jamais coutUnitaire ni prixAchatUnitaire', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Test Serializer Stock', telephone: uniquePhone('6'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Carton de savon',
      type: 'PRODUIT',
      prixVente: 3000,
      prixAchat: 2000,
      stock: 0,
      seuilAlerte: 5,
      unite: 'carton',
    });

    await createReception(business.id, owner.id, {
      clientUuid: randomUUID(),
      lignes: [{ productId: product.id, quantite: 10, prixAchatUnitaire: 2000 }],
    });

    const movements = await listMovements(business.id);
    const sellerView = serializeStockMovementList(movements, 'SELLER');
    const ownerView = serializeStockMovementList(movements, 'OWNER');

    expect(sellerView.every((m) => !('coutUnitaire' in m) && !('prixAchatUnitaire' in m))).toBe(true);
    expect(JSON.stringify(sellerView)).not.toMatch(/coutUnitaire|prixAchatUnitaire/);

    expect(ownerView.every((m) => 'coutUnitaire' in m)).toBe(true);
  });
});
