import { beforeAll, describe, expect, it } from 'vitest';
import { registerBusiness } from '@/server/modules/auth/register';
import {
  activatePaidSubscription,
  createPendingSubscriptionPayment,
  findActivePlanByCode,
  findPaymentByReference,
} from '@/server/repositories/subscriptions';
import { ownerPrisma } from '../support/owner-prisma';

/**
 * Ce qu'un commerçant obtient quand il paie AVANT la fin de son essai : le
 * paiement met fin à l'essai et la période payée part du jour du paiement
 * (règle de renouvellement, computeRenewal). Les jours d'essai ne se reportent pas.
 */
describe('paiement pendant la période d’essai', () => {
  let businessId = '';

  beforeAll(async () => {
    const { business } = await registerBusiness(
      {
        businessNom: 'Test Paiement Pendant Essai',
        telephone: `07${Date.now().toString().slice(-8)}`,
        pin: '654321',
        pays: 'CI',
      },
      {}
    );
    businessId = business.id;
  });

  it('met fin à l’essai : le mois payé part du jour du paiement', async () => {
    const plan = await findActivePlanByCode('BUSINESS');
    const depositId = `test-essai-${Date.now()}`;

    await createPendingSubscriptionPayment({
      businessId,
      planId: plan!.id,
      periode: 'MENSUEL',
      montant: 19900,
      depositId,
    });

    const payment = await findPaymentByReference(depositId);
    const avant = Date.now();
    const active = await activatePaidSubscription({
      payment: payment!,
      methode: 'WAVE',
      referencePasserelle: 'TEST-REF',
      payload: { status: 'COMPLETED' },
    });
    expect(active).toBe(true);

    const business = await ownerPrisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const subscription = await ownerPrisma.subscription.findFirstOrThrow({ where: { businessId } });

    // Le mois payé commence au jour du paiement, pas à la fin de l'essai.
    expect(subscription.dateDebut.getTime()).toBeGreaterThanOrEqual(avant);
    expect(subscription.dateDebut.getTime()).toBeLessThanOrEqual(Date.now());

    // Donc l'accès court jusqu'au paiement + 1 mois.
    const attendu = new Date(subscription.dateDebut);
    attendu.setMonth(attendu.getMonth() + 1);
    expect(subscription.dateFin.getTime()).toBe(attendu.getTime());
    expect(business.subscriptionEndsAt?.getTime()).toBe(attendu.getTime());

    // Le paiement garde la trace de la fin avant/après.
    const paid = await ownerPrisma.subscriptionPayment.findUniqueOrThrow({ where: { referenceInterne: depositId } });
    expect(paid.dateFinApres?.getTime()).toBe(attendu.getTime());
    expect(paid.nombreMois).toBe(1);

    // Et la boutique bascule tout de suite sur la formule payée : l'interface
    // doit annoncer « Business », pas laisser le bandeau d'essai.
    expect(business.statut).toBe('ACTIF');
    expect(business.planId).toBe(plan!.id);
  });
});
