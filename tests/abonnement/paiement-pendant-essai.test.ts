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
 * Ce qu'un commerçant obtient quand il paie AVANT la fin de son essai.
 *
 * L'application l'y pousse dès le 23ᵉ jour (bandeau orange, puis rouge). Tant
 * que la période payée démarrait au jour du paiement, répondre à cette
 * invitation coûtait les jours d'essai restants : payer tôt était puni.
 */
describe('paiement pendant la période d’essai', () => {
  let businessId = '';
  let trialEndsAt: Date;

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
    trialEndsAt = business.trialEndsAt!;
  });

  it('reporte l’abonnement à la fin de l’essai au lieu d’effacer les jours restants', async () => {
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
    const active = await activatePaidSubscription({
      payment: payment!,
      methode: 'WAVE',
      referencePasserelle: 'TEST-REF',
      payload: { status: 'COMPLETED' },
    });
    expect(active).toBe(true);

    const business = await ownerPrisma.business.findUniqueOrThrow({ where: { id: businessId } });
    const subscription = await ownerPrisma.subscription.findFirstOrThrow({ where: { businessId } });

    // Le mois payé commence à la fin de l'essai, pas au jour du paiement.
    expect(subscription.dateDebut.getTime()).toBe(trialEndsAt.getTime());

    // Donc l'accès court jusqu'à essai + 1 mois : les 30 jours offerts sont gardés.
    const attendu = new Date(trialEndsAt);
    attendu.setMonth(attendu.getMonth() + 1);
    expect(subscription.dateFin.getTime()).toBe(attendu.getTime());
    expect(business.subscriptionEndsAt?.getTime()).toBe(attendu.getTime());

    // Et la boutique bascule tout de suite sur la formule payée : l'interface
    // doit annoncer « Business », pas laisser le bandeau d'essai.
    expect(business.statut).toBe('ACTIF');
    expect(business.planId).toBe(plan!.id);
  });
});
