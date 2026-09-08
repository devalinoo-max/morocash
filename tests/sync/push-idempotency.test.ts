import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { listOrders } from '@/server/modules/orders/service';
import { pushSyncOperations, type SyncOperation } from '@/server/modules/sync/push';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 10 (spec §13) : 20 commandes hors ligne simulées
 * (certaines avec un `clientUuid` dupliqué) poussées via /sync/push produisent
 * zéro doublon de `Order`, chaque doublon étant marqué `DUPLICATE` dans la
 * réponse par opération (spec §9).
 */
describe('Étape 10 — idempotence du push de synchronisation', () => {
  // 20 opérations traitées séquentiellement (spec §9 : chaque opération dans sa
  // propre transaction) — chacune fait plusieurs allers-retours réseau Neon,
  // dépassant largement le testTimeout global de 60s pour ce seul test.
  it('20 opérations (15 uniques + 5 doublons) créent exactement 15 commandes', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage10', telephone: uniquePhone('6'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Boîte allumettes',
      type: 'PRODUIT',
      prixVente: 100,
      prixAchat: 0,
      stock: 1000,
      seuilAlerte: 10,
      unite: 'boîte',
    });
    const customer = await createCustomer(business.id, { nom: 'Client Stage10' });

    const uniqueUuids: string[] = Array.from({ length: 15 }, () => randomUUID());
    // Les 5 dernières opérations rejouent les 5 premiers clientUuid déjà envoyés.
    const allUuids: string[] = [...uniqueUuids, ...uniqueUuids.slice(0, 5)];

    const operations: SyncOperation[] = allUuids.map((clientUuid) => ({
      clientUuid,
      deviceId: 'device-test-01',
      operationType: 'CREATE_SALE',
      payload: {
        clientUuid,
        customerId: customer.id,
        items: [{ productId: product.id, qte: 1 }],
        montantRecu: 0, // commande à crédit — aucune dépendance à une caisse ouverte
        methode: 'ESPECES',
      },
      createdAt: new Date(),
    }));

    const ctx = { businessId: business.id, userId: owner.id, role: 'OWNER' as const };
    const results = await pushSyncOperations(ctx, operations);

    expect(results).toHaveLength(20);
    expect(results.filter((r) => r.status === 'SYNCED')).toHaveLength(15);
    expect(results.filter((r) => r.status === 'DUPLICATE')).toHaveLength(5);
    expect(results.filter((r) => r.status === 'ERROR')).toHaveLength(0);

    const orders = await listOrders(business.id);
    const createdForThisTest = orders.filter((o) => allUuids.includes(o.clientUuid));
    expect(createdForThisTest).toHaveLength(15);
  }, 150_000);
});
