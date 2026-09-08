import { describe, it, expect } from 'vitest';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct, getProduct } from '@/server/modules/products/service';
import { createReception, createAdjustment, listMovements } from '@/server/modules/stock/movements';
import { createStockCount } from '@/server/modules/stock/counts';
import { randomUUID } from 'crypto';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 4 (spec §13) :
 * "Σ des mouvements = stock actuel"
 */
describe('Étape 4 — cohérence des mouvements de stock', () => {
  it('la somme signée des mouvements non annulés égale le stock actuel du produit', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage4', telephone: uniquePhone('1'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Carton de savon',
      type: 'PRODUIT',
      prixVente: 2000,
      prixAchat: 1200,
      stock: 0,
      seuilAlerte: 5,
      unite: 'carton',
    });

    // Réception : +50
    await createReception(business.id, owner.id, {
      clientUuid: randomUUID(),
      fournisseur: 'Fournisseur Test',
      lignes: [{ productId: product.id, quantite: 50, prixAchatUnitaire: 1200 }],
    });

    // Casse : -3
    await createAdjustment(business.id, owner.id, {
      clientUuid: randomUUID(),
      productId: product.id,
      type: 'CASSE',
      quantite: 3,
      motif: 'Carton endommagé en réception',
    });

    // Perte : -2
    await createAdjustment(business.id, owner.id, {
      clientUuid: randomUUID(),
      productId: product.id,
      type: 'PERTE',
      quantite: 2,
      motif: 'Disparu lors de l’inventaire',
    });

    // Comptage : le compté est 44 (au lieu de 45 attendu), écart de -1
    await createStockCount(business.id, owner.id, {
      clientUuid: randomUUID(),
      perimetre: 'TOUT',
      lignes: [{ productId: product.id, stockCompte: 44 }],
    });

    const finalProduct = await getProduct(business.id, product.id);
    const movements = await listMovements(business.id, { productId: product.id });

    const sumSigned = movements
      .filter((m) => !m.annule)
      .reduce((acc, m) => acc + m.quantite, 0);

    expect(finalProduct.stock).toBe(44);
    expect(sumSigned).toBe(finalProduct.stock);
  });
});
