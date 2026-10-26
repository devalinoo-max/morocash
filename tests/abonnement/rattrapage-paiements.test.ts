import { randomUUID } from 'crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PawapayDeposit } from '@/server/integrations/pawapay';

/**
 * Rattrapage des paiements restés « en attente » : un paiement encaissé chez
 * pawaPay doit activer l'abonnement même si le callback de pawaPay n'arrive
 * jamais et que le client ne revient pas sur l'app (cas ORIGINAL GALERIE,
 * 22/10/2026 : 19 900 F payés, boutique restée expirée).
 *
 * pawaPay est simulé. Pour tout dépôt qui n'appartient pas à ce test, le faux
 * getDeposit lève une erreur : les vrais paiements en attente de la base
 * partagée ne sont donc jamais modifiés par ce fichier.
 */
const deposits = new Map<string, PawapayDeposit | null>();

vi.mock('@/server/integrations/pawapay', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/server/integrations/pawapay')>();
  return {
    ...original,
    getDeposit: vi.fn(async (depositId: string) => {
      if (!deposits.has(depositId)) throw new Error(`dépôt hors test : ${depositId}`);
      const value = deposits.get(depositId)!;
      if (value && value.status === ('ERREUR_RESEAU' as never)) throw new Error('pawaPay injoignable');
      return value;
    }),
  };
});

const { registerBusiness } = await import('@/server/modules/auth/register');
const { reconcilePendingPayments, handleDepositCallback } = await import('@/server/modules/subscriptions/service');
const { createPendingSubscriptionPayment, findActivePlanByCode } = await import('@/server/repositories/subscriptions');
const { ownerPrisma } = await import('../support/owner-prisma');

const MONTANT = 19900;

function completed(depositId: string, amount = MONTANT): PawapayDeposit {
  return {
    depositId,
    status: 'COMPLETED',
    amount: `${amount}.00`,
    currency: 'XOF',
    country: 'CIV',
    payer: { type: 'MMO', accountDetails: { provider: 'WAVE_CIV', phoneNumber: '2250700000000' } },
    providerTransactionId: `TEST-${depositId.slice(0, 8)}`,
  };
}

function withStatus(depositId: string, status: PawapayDeposit['status']): PawapayDeposit {
  return { ...completed(depositId), status, providerTransactionId: undefined };
}

let planId = '';
let seq = 0;

/** Boutique de test neuve (nettoyée par tests/global-teardown.ts) avec un paiement Business mensuel en attente. */
async function shopWithPendingPayment(options: { minutesAgo?: number } = {}) {
  seq += 1;
  const { business } = await registerBusiness(
    {
      businessNom: `Test Rattrapage Paiement ${seq}`,
      telephone: `05${(Date.now() + seq).toString().slice(-8)}`,
      pin: '654321',
      pays: 'CI',
    },
    {}
  );
  const depositId = randomUUID();
  await createPendingSubscriptionPayment({
    businessId: business.id,
    planId,
    periode: 'MENSUEL',
    montant: MONTANT,
    depositId,
  });
  if (options.minutesAgo) {
    await ownerPrisma.subscriptionPayment.update({
      where: { referenceInterne: depositId },
      data: { createdAt: new Date(Date.now() - options.minutesAgo * 60_000) },
    });
  }
  return { businessId: business.id, depositId };
}

const payment = (depositId: string) =>
  ownerPrisma.subscriptionPayment.findUniqueOrThrow({ where: { referenceInterne: depositId } });
const shop = (businessId: string) => ownerPrisma.business.findUniqueOrThrow({ where: { id: businessId } });

describe('rattrapage des paiements d’abonnement en attente', () => {
  beforeAll(async () => {
    const plan = await findActivePlanByCode('BUSINESS');
    planId = plan!.id;
  });

  beforeEach(() => {
    deposits.clear();
  });

  it('active l’abonnement d’un paiement encaissé dont le callback n’est jamais arrivé', async () => {
    const { businessId, depositId } = await shopWithPendingPayment({ minutesAgo: 13 });
    deposits.set(depositId, completed(depositId));

    const avant = Date.now();
    const result = await reconcilePendingPayments();

    expect(result.reussis).toBeGreaterThanOrEqual(1);
    const paid = await payment(depositId);
    expect(paid.statut).toBe('REUSSI');
    expect(paid.methode).toBe('WAVE');
    expect(paid.referencePasserelle).toBe(`TEST-${depositId.slice(0, 8)}`);

    const business = await shop(businessId);
    expect(business.statut).toBe('ACTIF');
    expect(business.planId).toBe(planId);
    // Un mois payé à partir du rattrapage.
    const min = new Date(avant);
    min.setMonth(min.getMonth() + 1);
    expect(business.subscriptionEndsAt!.getTime()).toBeGreaterThanOrEqual(min.getTime());
  });

  it('ne prolonge qu’une seule fois quand le rattrapage passe deux fois puis que le callback arrive', async () => {
    const { businessId, depositId } = await shopWithPendingPayment();
    deposits.set(depositId, completed(depositId));

    await reconcilePendingPayments();
    const finApresPremierPassage = (await shop(businessId)).subscriptionEndsAt!.getTime();

    await reconcilePendingPayments();
    await handleDepositCallback(depositId);

    expect((await shop(businessId)).subscriptionEndsAt!.getTime()).toBe(finApresPremierPassage);
    const audits = await ownerPrisma.auditLog.count({
      where: { businessId, entiteId: (await payment(depositId)).id, action: { in: ['SUBSCRIPTION_PAID', 'SUBSCRIPTION_RENEWED'] } },
    });
    expect(audits).toBe(1);
  });

  it('marque échoué un paiement refusé par pawaPay, sans activer la boutique', async () => {
    const { businessId, depositId } = await shopWithPendingPayment();
    deposits.set(depositId, withStatus(depositId, 'FAILED'));

    const result = await reconcilePendingPayments();

    expect(result.echoues).toBeGreaterThanOrEqual(1);
    expect((await payment(depositId)).statut).toBe('ECHOUE');
    expect((await shop(businessId)).statut).toBe('ESSAI');
  });

  it('laisse en attente un paiement encore en cours chez pawaPay', async () => {
    const { depositId } = await shopWithPendingPayment({ minutesAgo: 30 });
    deposits.set(depositId, withStatus(depositId, 'PROCESSING'));

    const result = await reconcilePendingPayments();

    expect(result.enAttente).toBeGreaterThanOrEqual(1);
    expect((await payment(depositId)).statut).toBe('INITIE');
  });

  it('expire une page de paiement abandonnée (inconnue de pawaPay après 20 minutes)', async () => {
    const { depositId } = await shopWithPendingPayment({ minutesAgo: 25 });
    deposits.set(depositId, null);

    const result = await reconcilePendingPayments();

    expect(result.expires).toBeGreaterThanOrEqual(1);
    expect((await payment(depositId)).statut).toBe('EXPIRE');
  });

  it('n’expire pas trop tôt une page encore ouverte (inconnue de pawaPay depuis 2 minutes)', async () => {
    const { depositId } = await shopWithPendingPayment({ minutesAgo: 2 });
    deposits.set(depositId, null);

    await reconcilePendingPayments();

    expect((await payment(depositId)).statut).toBe('INITIE');
  });

  it('n’active pas un dépôt dont le montant ne correspond pas à la commande', async () => {
    const { businessId, depositId } = await shopWithPendingPayment();
    deposits.set(depositId, completed(depositId, 300));

    await reconcilePendingPayments();

    expect((await payment(depositId)).statut).toBe('INITIE');
    expect((await shop(businessId)).statut).toBe('ESSAI');
  });

  it('continue avec les autres paiements quand pawaPay répond en erreur pour l’un d’eux', async () => {
    const enPanne = await shopWithPendingPayment();
    const ok = await shopWithPendingPayment();
    deposits.set(enPanne.depositId, { status: 'ERREUR_RESEAU' } as never);
    deposits.set(ok.depositId, completed(ok.depositId));

    const result = await reconcilePendingPayments();

    expect(result.erreurs).toBeGreaterThanOrEqual(1);
    expect((await payment(enPanne.depositId)).statut).toBe('INITIE');
    expect((await payment(ok.depositId)).statut).toBe('REUSSI');
  });

  it('ne touche pas aux paiements déjà réussis', async () => {
    const { businessId, depositId } = await shopWithPendingPayment();
    deposits.set(depositId, completed(depositId));
    await reconcilePendingPayments();
    const fin = (await shop(businessId)).subscriptionEndsAt!.getTime();

    // pawaPay changerait d'avis : un paiement réussi ne repasse jamais en échec.
    deposits.set(depositId, withStatus(depositId, 'FAILED'));
    await reconcilePendingPayments();

    expect((await payment(depositId)).statut).toBe('REUSSI');
    expect((await shop(businessId)).subscriptionEndsAt!.getTime()).toBe(fin);
  });
});
