import { describe, it, expect } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { openRegister } from '@/server/modules/cash/service';
import { getDailyReport, getRangeReport, resolvePeriodRange } from '@/server/modules/reports/queries';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 9 (spec §13) : "GET /reports/daily et
 * GET /dashboard?period= renvoient des totaux identiques pour la même période."
 * Les deux endpoints appellent la même fonction d'agrégation (reports/queries.ts)
 * — ce test vérifie l'égalité de bout en bout après une activité réelle.
 */
describe('Étape 9 — cohérence dashboard/reports daily', () => {
  it('getDailyReport(aujourd\'hui) === getRangeReport(period=today)', async () => {
    const { business, owner } = await registerBusiness(
      { businessNom: 'Verif Stage9', telephone: uniquePhone('5'), pin: '123456' },
      {}
    );

    await openRegister(
      { businessId: business.id, userId: owner.id },
      { clientUuid: randomUUID(), fondDepart: 0 }
    );

    const product = await createProduct(business.id, {
      nom: 'Savon',
      type: 'PRODUIT',
      prixVente: 500,
      prixAchat: 0,
      stock: 100,
      seuilAlerte: 5,
      unite: 'pièce',
    });
    const customer = await createCustomer(business.id, { nom: 'Client Stage9' });

    const ctx = {
      businessId: business.id,
      userId: owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
      cashRegisterMode: business.cashRegisterMode,
    };
    await createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: customer.id,
      items: [{ productId: product.id, qte: 4 }],
      montantRecu: 2000,
      methode: 'ESPECES',
    });

    const daily = await getDailyReport(business.id, new Date());
    const { from, to } = resolvePeriodRange('today');
    const dashboard = await getRangeReport(business.id, from, to);

    expect(daily).toEqual(dashboard);
    expect(daily.totalVendu).toBe(2000);
    expect(daily.nbCommandes).toBe(1);
  });
});
