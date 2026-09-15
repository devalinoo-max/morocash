import { addMonths } from 'date-fns';
import type { PaymentMethod, Prisma, SubPayState, SubPeriod } from '@prisma/client';
import { prisma } from '@/server/database/client';

/**
 * Paiements d'abonnement. Hors de `scoped()` : le callback pawaPay arrive sans
 * session, et ne connaît la boutique qu'à travers le depositId
 * (SubscriptionPayment.referenceInterne). Ces tables ne sont pas sous RLS
 * (voir scripts/apply-rls.ts), les lectures côté boutique filtrent donc
 * explicitement sur businessId.
 */

const withPlan = { subscription: { include: { plan: true } } } as const;

export type SubscriptionPaymentWithPlan = Prisma.SubscriptionPaymentGetPayload<{ include: typeof withPlan }>;

export function findActivePlanByCode(code: string) {
  return prisma.plan.findFirst({ where: { code, actif: true } });
}

/**
 * Crée l'abonnement (encore inactif) et son paiement INITIE AVANT l'appel à
 * pawaPay : si l'appel échoue en route, le depositId est déjà connu et le
 * paiement reste retrouvable (recommandation de la doc pawaPay).
 */
export function createPendingSubscriptionPayment(input: {
  businessId: string;
  planId: string;
  periode: SubPeriod;
  montant: number;
  depositId: string;
}) {
  const now = new Date();
  return prisma.subscription.create({
    data: {
      businessId: input.businessId,
      planId: input.planId,
      periode: input.periode,
      // Dates provisoires : les vraies sont posées au paiement réussi.
      dateDebut: now,
      dateFin: now,
      montant: input.montant,
      actif: false,
      payments: {
        create: {
          businessId: input.businessId,
          montant: input.montant,
          methode: 'AUTRE',
          referenceInterne: input.depositId,
          statut: 'INITIE',
        },
      },
    },
  });
}

export function findPaymentByReference(depositId: string) {
  return prisma.subscriptionPayment.findUnique({ where: { referenceInterne: depositId }, include: withPlan });
}

export function findBusinessPaymentByReference(businessId: string, depositId: string) {
  return prisma.subscriptionPayment.findFirst({
    where: { referenceInterne: depositId, businessId },
    include: withPlan,
  });
}

export function findBusinessById(businessId: string) {
  return prisma.business.findUnique({ where: { id: businessId } });
}

/** Clôture un paiement encore INITIE (échec, expiration). Sans effet s'il a déjà été traité. */
export async function closePendingPayment(
  paymentId: string,
  statut: Exclude<SubPayState, 'INITIE' | 'REUSSI'>,
  payload?: unknown
): Promise<void> {
  await prisma.subscriptionPayment.updateMany({
    where: { id: paymentId, statut: 'INITIE' },
    data: { statut, ...(payload !== undefined ? { payloadWebhook: payload as Prisma.InputJsonValue } : {}) },
  });
}

/**
 * Paiement confirmé : le paiement passe REUSSI, l'abonnement devient actif et
 * la boutique passe sur la formule payée. Idempotent — pawaPay peut renvoyer
 * le même callback, et la page de retour interroge le statut en parallèle :
 * seul le premier passage INITIE → REUSSI prolonge l'abonnement.
 *
 * Les jours déjà payés ne sont pas perdus : la nouvelle période démarre à la
 * fin de l'abonnement en cours s'il court encore, sinon maintenant.
 */
export function activatePaidSubscription(input: {
  payment: SubscriptionPaymentWithPlan;
  methode: PaymentMethod;
  referencePasserelle: string | null;
  payload: unknown;
}) {
  const { payment } = input;
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.subscriptionPayment.updateMany({
      where: { id: payment.id, statut: 'INITIE' },
      data: {
        statut: 'REUSSI',
        methode: input.methode,
        referencePasserelle: input.referencePasserelle,
        payloadWebhook: input.payload as Prisma.InputJsonValue,
      },
    });
    if (claimed.count === 0 || !payment.subscription) return false;

    const business = await tx.business.findUniqueOrThrow({ where: { id: payment.businessId } });
    const now = new Date();
    const dateDebut =
      business.statut === 'ACTIF' && business.subscriptionEndsAt && business.subscriptionEndsAt > now
        ? business.subscriptionEndsAt
        : now;
    const dateFin = addMonths(dateDebut, payment.subscription.periode === 'ANNUEL' ? 12 : 1);

    await tx.subscription.update({
      where: { id: payment.subscription.id },
      data: { dateDebut, dateFin, actif: true },
    });

    // Une boutique suspendue ou résiliée entre-temps garde ce statut : c'est
    // une décision distincte du paiement, que seul le back-office lève.
    const administrativelyLocked = business.statut === 'SUSPENDU' || business.statut === 'RESILIE';
    await tx.business.update({
      where: { id: business.id },
      data: {
        planId: payment.subscription.planId,
        subscriptionEndsAt: dateFin,
        ...(administrativelyLocked ? {} : { statut: 'ACTIF' }),
      },
    });
    return true;
  });
}
