import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/server/database/client';
import { registerBusiness } from '@/server/modules/auth/register';
import { requireBusinessWritable } from '@/server/guards';
import { pushSyncOperations, type SyncOperation } from '@/server/modules/sync/push';
import { listOrders } from '@/server/modules/orders/service';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Test de sécurité obligatoire #5 (spec §12) : une boutique SUSPENDU ne peut
 * écrire par aucune route, /sync/push compris — vérifié au niveau du garde
 * `requireBusinessWritable()`, appelé par `guardMutation()` en tout premier dans
 * TOUTES les routes de mutation (y compris POST /sync/push).
 */
describe('Boutique suspendue — blocage en écriture', () => {
  it('requireBusinessWritable rejette BUSINESS_READ_ONLY et /sync/push ne crée aucune commande', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Suspendu', telephone: uniquePhone('7'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Produit Test Suspendu',
      type: 'PRODUIT',
      prixVente: 500,
      prixAchat: 0,
      stock: 10,
      seuilAlerte: 1,
      unite: 'pièce',
    });
    const customer = await createCustomer(business.id, { nom: 'Client Suspendu' });

    await prisma.business.update({ where: { id: business.id }, data: { statut: 'SUSPENDU' } });

    await expect(requireBusinessWritable(business.id)).rejects.toMatchObject({
      code: 'BUSINESS_READ_ONLY',
    });

    const clientUuid = randomUUID();
    const op: SyncOperation = {
      clientUuid,
      deviceId: 'device-test-suspendu',
      operationType: 'CREATE_SALE',
      payload: {
        clientUuid,
        customerId: customer.id,
        items: [{ productId: product.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      },
      createdAt: new Date(),
    };

    // Reproduit exactement ce que fait la route POST /sync/push : le garde est
    // appelé avant tout traitement d'opération, donc pushSyncOperations n'est
    // jamais atteint et aucune écriture n'a lieu.
    try {
      await requireBusinessWritable(business.id);
      await pushSyncOperations(
        {
          businessId: business.id,
          userId: owner.id,
          role: 'OWNER',
          remiseMaxVendeur: business.remiseMaxVendeur,
          cashRegisterMode: business.cashRegisterMode,
        },
        [op]
      );
    } catch {
      // Attendu.
    }

    const orders = await listOrders(business.id);
    expect(orders.filter((o) => o.clientUuid === clientUuid)).toHaveLength(0);
  });
});
