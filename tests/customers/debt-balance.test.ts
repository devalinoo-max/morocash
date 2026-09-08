import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/server/database/client';
import { setTenantContext } from '@/server/middleware/tenant';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { getCustomerBalance, repayDebt } from '@/server/modules/customers/debt';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 6 (spec §13) : "Créances justes au franc près."
 * Nécessite une caisse ouverte pour les commandes payées et le remboursement —
 * ouverte ici directement en base (le module caisse applicatif arrive à l'étape 8).
 */
describe('Étape 6 — solde débiteur client', () => {
  it('le solde calculé correspond exactement au calcul manuel après commandes mixtes et remboursement partiel', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage6', telephone: uniquePhone('2'), pin: '123456' },
      {}
    );

    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, business.id);
      await tx.cashRegister.create({
        data: { businessId: business.id, ouverteParId: owner.id, fondDepart: 0 },
      });
    });

    const product = await createProduct(business.id, {
      nom: 'Bidon gaz 6kg',
      type: 'PRODUIT',
      prixVente: 5000,
      prixAchat: 3500,
      stock: 100,
      seuilAlerte: 5,
      unite: 'bidon',
    });

    const customer = await createCustomer(business.id, { nom: 'Client Débiteur Test' });

    const ctx = {
      businessId: business.id,
      userId: owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
      cashRegisterMode: business.cashRegisterMode,
    };

    // Commande 1 : payée intégralement (5000 FCFA reçus)
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 1 }],
      montantRecu: 5000,
      methode: 'ESPECES',
    });

    // Commande 2 : partielle (3000 reçus sur 5000)
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 1 }],
      montantRecu: 3000,
      methode: 'ESPECES',
    });

    // Commande 3 : entièrement à crédit
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });

    // Calcul manuel avant remboursement :
    // totalDu = 5000 + 5000 + 5000 = 15000
    // totalRecu = 5000 + 3000 + 0 = 8000
    // solde = 15000 - 8000 = 7000
    const beforeRepayment = await getCustomerBalance(business.id, customer.id);
    expect(beforeRepayment.totalDu).toBe(15000);
    expect(beforeRepayment.totalRecu).toBe(8000);
    expect(beforeRepayment.solde).toBe(7000);

    // Remboursement partiel de la dette : 2000 FCFA
    await repayDebt(ctx, customer.id, {
      clientUuid: randomUUID(),
      montant: 2000,
      methode: 'ESPECES',
    });

    // Un remboursement de dette augmente `recu` sans toucher `totalDu` (spec §7.5) :
    // totalRecu = 8000 + 2000 = 10000 ; solde = 15000 - 10000 = 5000
    const afterRepayment = await getCustomerBalance(business.id, customer.id);
    expect(afterRepayment.totalDu).toBe(15000);
    expect(afterRepayment.totalRecu).toBe(10000);
    expect(afterRepayment.solde).toBe(5000);
  });
});
