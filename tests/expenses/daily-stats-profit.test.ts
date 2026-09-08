import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '@/server/database/client';
import { setTenantContext } from '@/server/middleware/tenant';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { createReception } from '@/server/modules/stock/movements';
import { createExpense } from '@/server/modules/expenses/service';
import { createCategory, listCategories } from '@/server/modules/categories/service';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Critère de sortie de l'étape 7 (spec §13) : "Bénéfice vérifiable à la main."
 * Une dépense de catégorie système "Achat marchandise" compte dans `totalDepenses`
 * mais est exclue du calcul de `gagne` (spec §7.5).
 */
describe('Étape 7 — profit DailyStats vérifiable à la main', () => {
  it('gagne = margeBrute − dépenses hors "Achat marchandise", pour une journée mixte', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage7', telephone: uniquePhone('3'), pin: '123456' },
      {}
    );

    await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, business.id);
      await tx.cashRegister.create({
        data: { businessId: business.id, ouverteParId: owner.id, fondDepart: 0 },
      });
    });

    const product = await createProduct(business.id, {
      nom: 'Sac riz 25kg',
      type: 'PRODUIT',
      prixVente: 5000,
      prixAchat: 3000,
      stock: 0,
      seuilAlerte: 5,
      unite: 'sac',
    });

    // Le CMP n'est établi qu'à la réception de stock (spec §7.3) — jamais à la
    // création du produit, où `cmp` reste à 0.
    await createReception(business.id, owner.id, {
      clientUuid: randomUUID(),
      lignes: [{ productId: product.id, quantite: 100, prixAchatUnitaire: 3000 }],
    });

    const customer = await createCustomer(business.id, { nom: 'Client Stage7' });

    const ctx = { businessId: business.id, userId: owner.id, role: 'OWNER' as const, remiseMaxVendeur: 0 };

    // Commande payée intégralement : 2 x 5000 = 10000 vendu, coût 2 x 3000 = 6000.
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 2 }],
      montantRecu: 10000,
      methode: 'ESPECES',
    });

    // Dépense sur la catégorie système "Achat marchandise" — comptée dans
    // totalDepenses mais exclue de gagne.
    const [achatMarchandise] = await listCategories(business.id, { type: 'DEPENSE' });
    expect(achatMarchandise.nom).toBe('Achat marchandise');

    await createExpense(
      { businessId: business.id, userId: owner.id },
      { clientUuid: randomUUID(), montant: 1000, categoryId: achatMarchandise.id, methode: 'ESPECES', recurrente: false }
    );

    // Dépense sur une catégorie normale — comptée dans totalDepenses ET déduite de gagne.
    const loyer = await createCategory(business.id, { nom: 'Loyer', type: 'DEPENSE' });
    await createExpense(
      { businessId: business.id, userId: owner.id },
      { clientUuid: randomUUID(), montant: 1500, categoryId: loyer.id, methode: 'ESPECES', recurrente: false }
    );

    const date = startOfDay(new Date());
    const stats = await prisma.$transaction(async (tx) => {
      await setTenantContext(tx, business.id);
      return tx.dailyStats.findUnique({ where: { businessId_date: { businessId: business.id, date } } });
    });

    expect(stats).not.toBeNull();
    // Calcul manuel :
    // totalVendu = 10000, coutMarchandises = 6000 => margeBrute = 4000
    // totalDepenses = 1000 (Achat marchandise) + 1500 (Loyer) = 2500
    // gagne = margeBrute − dépenses hors "Achat marchandise" = 4000 − 1500 = 2500
    expect(stats!.totalVendu).toBe(10000);
    expect(stats!.coutMarchandises).toBe(6000);
    expect(stats!.margeBrute).toBe(4000);
    expect(stats!.totalDepenses).toBe(2500);
    expect(stats!.gagne).toBe(2500);
  });
});
