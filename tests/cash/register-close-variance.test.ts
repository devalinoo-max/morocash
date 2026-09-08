import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { openRegister, createManualMovement, closeRegister } from '@/server/modules/cash/service';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 8 (spec §13) : ouverture avec un fondDepart connu,
 * mélange de paiements espèces/mobile money plus un APPORT et un RETRAIT manuels,
 * fermeture avec un montantCompte compté à la main — attenduEnEspeces/ecart
 * calculés à la main doivent correspondre exactement à la sortie de l'API.
 */
describe('Étape 8 — clôture de caisse et écart', () => {
  it('attenduEnEspeces et ecart correspondent au calcul manuel', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage8', telephone: uniquePhone('4'), pin: '123456' },
      {}
    );

    const ctx = {
      businessId: business.id,
      userId: owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
      cashRegisterMode: business.cashRegisterMode,
    };

    const register = await openRegister(ctx, { clientUuid: randomUUID(), fondDepart: 5000 });

    const product = await createProduct(business.id, {
      nom: 'Bidon eau 5L',
      type: 'PRODUIT',
      prixVente: 1000,
      prixAchat: 0,
      stock: 100,
      seuilAlerte: 5,
      unite: 'bidon',
    });
    const customer = await createCustomer(business.id, { nom: 'Client Stage8' });

    // Commande payée en espèces : 3000 FCFA.
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 3 }],
      montantRecu: 3000,
      methode: 'ESPECES',
    });

    // Commande payée en mobile money : 2000 FCFA — n'affecte pas l'espèces.
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 2 }],
      montantRecu: 2000,
      methode: 'ORANGE_MONEY',
    });

    // Apport manuel en espèces.
    await createManualMovement(ctx, {
      clientUuid: randomUUID(),
      type: 'APPORT',
      montant: 1000,
      motif: 'Apport de fonds',
      methode: 'ESPECES',
    });

    // Retrait manuel en espèces.
    await createManualMovement(ctx, {
      clientUuid: randomUUID(),
      type: 'RETRAIT',
      montant: 500,
      motif: 'Retrait pour achat',
      methode: 'ESPECES',
    });

    // Calcul manuel :
    // entreesEspeces = 3000 (commande) + 1000 (apport) = 4000
    // sortiesEspeces = 500 (retrait)
    // attenduEnEspeces = 5000 + 4000 - 500 = 8500
    // entreesTotal = 3000 + 2000 + 1000 = 6000 ; sortiesTotal = 500
    // attenduTotal = 5000 + 6000 - 500 = 10500
    // montantCompte = 8300 (léger manquant) => ecart = 8300 - 8500 = -200
    const result = await closeRegister(ctx, { montantCompte: 8300 });

    expect(result.attenduEnEspeces).toBe(8500);
    expect(result.attenduTotal).toBe(10500);
    expect(result.ecart).toBe(-200);
    expect(result.register.id).toBe(register.id);
    expect(result.register.montantAttendu).toBe(8500);
    expect(result.register.montantCompte).toBe(8300);
    expect(result.register.ecart).toBe(-200);
    expect(result.register.statut).toBe('FERMEE');
  });
});
