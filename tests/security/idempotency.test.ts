import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct, getProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { listOrders } from '@/server/modules/orders/service';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Test de sécurité obligatoire #4 (spec §12) : une commande envoyée 5 fois avec
 * le même clientUuid crée un seul enregistrement, sans effet de bord dupliqué
 * (pas de double décrément de stock).
 */
describe('Idempotence — commandes', () => {
  it('5 envois identiques (même clientUuid) créent exactement 1 commande', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Test Idempotence', telephone: uniquePhone('8'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Paquet de sucre 1kg',
      type: 'PRODUIT',
      prixVente: 700,
      prixAchat: 500,
      stock: 100,
      seuilAlerte: 10,
      unite: 'paquet',
    });

    const customer = await createCustomer(business.id, { nom: 'Client Test Idempotence' });

    const clientUuid = randomUUID();
    const orderInput = {
      clientUuid,
      customerId: customer.id,
      items: [{ productId: product.id, qte: 5 }],
      montantRecu: 0, // commande à crédit — pas de dépendance à une caisse ouverte
      methode: 'ESPECES' as const,
    };

    const ctx = {
      businessId: business.id,
      userId: owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
    };

    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(await createOrder(ctx, orderInput));
    }

    expect(results[0].status).toBe('CREATED');
    expect(results.slice(1).every((r) => r.status === 'DUPLICATE')).toBe(true);
    // Toutes les réponses pointent vers le même identifiant de commande.
    const orderIds = new Set(results.map((r) => r.order.id));
    expect(orderIds.size).toBe(1);

    const orders = await listOrders(business.id);
    expect(orders.filter((o) => o.clientUuid === clientUuid)).toHaveLength(1);

    // Le stock n'a été décrémenté qu'une seule fois (5 unités), pas 5 fois.
    const finalProduct = await getProduct(business.id, product.id);
    expect(finalProduct.stock).toBe(95);
  });
});
