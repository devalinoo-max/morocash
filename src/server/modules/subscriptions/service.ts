import { randomUUID } from 'crypto';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import type { Business, PaymentMethod, SubPeriod } from '@prisma/client';
import { AppError } from '@/server/shared/errors';
import { businessPriceForPeriod, isAdministrativelyLocked, periodLabel } from '@/server/shared/subscription';
import { PAWAPAY_COUNTRY, createPaymentPage, getDeposit, type PawapayDeposit } from '@/server/integrations/pawapay';
import {
  activatePaidSubscription,
  closePendingPayment,
  createPendingSubscriptionPayment,
  findActivePlanByCode,
  findBusinessById,
  findBusinessPaymentByReference,
  findBusinessSubscriptionHistory,
  countActiveUsers,
  findPaymentByReference,
  type SubscriptionPaymentWithPlan,
} from '@/server/repositories/subscriptions';

/** La page de paiement pawaPay expire au bout de 15 minutes, sans callback. Marge pour un paiement validé à la dernière seconde. */
const PAYMENT_PAGE_EXPIRY_MS = 20 * 60 * 1000;

export const checkoutSchema = z.object({
  planCode: z.enum(['SOLO', 'BUSINESS']),
  periode: z.enum(['MENSUEL', 'TRIMESTRIEL', 'SEMESTRIEL', 'ANNUEL']),
});

export async function startCheckout(
  business: Business,
  input: z.infer<typeof checkoutSchema>,
  appBaseUrl: string
): Promise<{ paymentId: string; redirectUrl: string }> {
  if (isAdministrativelyLocked(business)) {
    throw new AppError('BUSINESS_READ_ONLY', 'Cette boutique est en lecture seule.');
  }

  const country = PAWAPAY_COUNTRY[business.pays];
  if (!country) {
    throw new AppError('VALIDATION_ERROR', "Le paiement en ligne n'est pas encore disponible dans ton pays.");
  }

  const plan = await findActivePlanByCode(input.planCode);
  if (!plan) {
    throw new AppError('VALIDATION_ERROR', 'Offre introuvable ou inactive.');
  }

  // Le montant vient toujours de la base, jamais du navigateur.
  const montant = businessPriceForPeriod(business, plan, input.periode);
  if (montant <= 0) {
    throw new AppError('VALIDATION_ERROR', "Cette durée n'est pas disponible pour cette offre.");
  }
  const depositId = randomUUID();
  const subscription = await createPendingSubscriptionPayment({
    businessId: business.id,
    planId: plan.id,
    periode: input.periode,
    montant,
    depositId,
  });

  try {
    const redirectUrl = await createPaymentPage({
      depositId,
      returnUrl: `${appBaseUrl}/abonnement?paiement=${depositId}`,
      amount: montant,
      currency: business.devise,
      country,
      reason: `Abonnement MoroCash ${plan.code === 'BUSINESS' ? 'Business' : 'Solo'} ${periodLabel(input.periode)}`,
      customerMessage: `MoroCash ${plan.code === 'BUSINESS' ? 'Business' : 'Solo'}`,
    });
    return { paymentId: depositId, redirectUrl };
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('[pawapay] ouverture de la page de paiement', { depositId, subscriptionId: subscription.id, error });
    Sentry.captureException(error);
    const payment = await findPaymentByReference(depositId);
    if (payment) await closePendingPayment(payment.id, 'ECHOUE');
    throw new AppError('SERVER_ERROR', "Impossible d'ouvrir la page de paiement. Réessaie dans un instant.");
  }
}

function methodFromProvider(provider: string | undefined): PaymentMethod {
  const p = (provider ?? '').toUpperCase();
  if (p.startsWith('ORANGE')) return 'ORANGE_MONEY';
  if (p.startsWith('MTN')) return 'MTN';
  if (p.startsWith('MOOV')) return 'MOOV';
  if (p.startsWith('WAVE')) return 'WAVE';
  return 'AUTRE';
}

/**
 * Met un paiement INITIE en accord avec pawaPay. Le statut est TOUJOURS relu
 * chez pawaPay (GET /v2/deposits/{id}, authentifié par notre jeton) : le corps
 * d'un callback, lui, peut être forgé par n'importe qui connaissant l'URL.
 */
async function reconcile(payment: SubscriptionPaymentWithPlan): Promise<SubscriptionPaymentWithPlan> {
  if (payment.statut !== 'INITIE') return payment;

  const deposit = await getDeposit(payment.referenceInterne);

  if (!deposit) {
    if (Date.now() - payment.createdAt.getTime() > PAYMENT_PAGE_EXPIRY_MS) {
      await closePendingPayment(payment.id, 'EXPIRE');
    }
  } else if (deposit.status === 'COMPLETED') {
    await handleCompleted(payment, deposit);
  } else if (deposit.status === 'FAILED') {
    await closePendingPayment(payment.id, 'ECHOUE', deposit);
  }
  // ACCEPTED / PROCESSING / IN_RECONCILIATION : pas encore final, on attend.

  return (await findPaymentByReference(payment.referenceInterne)) ?? payment;
}

async function handleCompleted(payment: SubscriptionPaymentWithPlan, deposit: PawapayDeposit) {
  const business = await findBusinessById(payment.businessId);
  const amountMatches = Number(deposit.amount) === payment.montant;
  const currencyMatches = !!business && deposit.currency === business.devise;

  if (!amountMatches || !currencyMatches) {
    // Argent encaissé mais qui ne correspond pas à la commande : ni activation
    // automatique, ni échec (le client a payé) — à régler à la main.
    const error = new Error('pawaPay: montant ou devise inattendus sur un dépôt COMPLETED');
    console.error('[pawapay]', error.message, { depositId: payment.referenceInterne, deposit, attendu: payment.montant });
    Sentry.captureException(error, { extra: { depositId: payment.referenceInterne, deposit } });
    return;
  }

  await activatePaidSubscription({
    payment,
    methode: methodFromProvider(deposit.payer?.accountDetails?.provider),
    referencePasserelle: deposit.providerTransactionId ?? null,
    payload: deposit,
  });
}

/** Callback pawaPay : le depositId suffit, le reste est relu chez pawaPay. */
export async function handleDepositCallback(depositId: string): Promise<void> {
  const payment = await findPaymentByReference(depositId);
  if (!payment) return; // dépôt qui ne concerne pas les abonnements
  await reconcile(payment);
}

export interface PaymentStatusView {
  paymentId: string;
  statut: 'EN_ATTENTE' | 'REUSSI' | 'ECHOUE' | 'EXPIRE';
  planCode: string | null;
  periode: SubPeriod | null;
  montant: number;
  subscriptionEndsAt: Date | null;
}

export interface SubscriptionOverview {
  statut: string;
  planCode: string | null;
  planNom: string | null;
  /** Période en cours (ou la dernière payée si tout est échu). Null pendant l'essai. */
  current: {
    periode: SubPeriod;
    dateDebut: Date;
    dateFin: Date;
  } | null;
  /** Fin de tout ce qui est déjà payé, périodes prépayées comprises. */
  subscriptionEndsAt: Date | null;
  joursRestants: number | null;
  trialEndsAt: Date | null;
  /** Comptes actifs de la boutique (propriétaire compris), face au quota de la formule. */
  utilisateurs: number;
  /**
   * Tarif annuel négocié pour la formule Business, propre à cette boutique.
   * null = prix public. L'écran d'abonnement affiche ce montant à la place des
   * 199 000 F, pour que le prix annoncé soit celui réellement demandé.
   */
  tarifAnnuelBusiness: number | null;
  payments: {
    paymentId: string;
    date: Date;
    montant: number;
    methode: PaymentMethod;
    referencePasserelle: string | null;
    planCode: string | null;
    periode: SubPeriod | null;
    dateDebut: Date | null;
    dateFin: Date | null;
  }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Page « Mon abonnement » : formule, dates, jours restants et paiements réussis. */
export async function getSubscriptionOverview(businessId: string): Promise<SubscriptionOverview> {
  const business = await findBusinessById(businessId);
  if (!business) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable.');
  }
  const [[subscriptions, payments], utilisateurs] = await Promise.all([
    findBusinessSubscriptionHistory(businessId),
    countActiveUsers(businessId),
  ]);

  const now = Date.now();
  // Périodes triées par fin décroissante : on cherche celle qui couvre
  // aujourd'hui ; à défaut (tout est échu), la plus récente.
  const current =
    subscriptions.find((s) => s.dateDebut.getTime() <= now && s.dateFin.getTime() > now) ?? subscriptions[0] ?? null;
  const plan = current?.plan ?? null;
  const endsAt = business.subscriptionEndsAt;

  return {
    statut: business.statut,
    planCode: plan?.code ?? null,
    planNom: plan?.nom ?? null,
    current: current ? { periode: current.periode, dateDebut: current.dateDebut, dateFin: current.dateFin } : null,
    subscriptionEndsAt: endsAt,
    joursRestants: endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - now) / DAY_MS)) : null,
    trialEndsAt: business.trialEndsAt,
    utilisateurs,
    tarifAnnuelBusiness: business.tarifAnnuelBusiness,
    payments: payments.map((p) => ({
      paymentId: p.referenceInterne,
      date: p.createdAt,
      montant: p.montant,
      methode: p.methode,
      referencePasserelle: p.referencePasserelle,
      planCode: p.subscription?.plan.code ?? null,
      periode: p.subscription?.periode ?? null,
      dateDebut: p.subscription?.dateDebut ?? null,
      dateFin: p.subscription?.dateFin ?? null,
    })),
  };
}

/** Page de retour : la boutique ne voit que ses propres paiements. */
export async function getPaymentStatus(businessId: string, depositId: string): Promise<PaymentStatusView> {
  const found = await findBusinessPaymentByReference(businessId, depositId);
  if (!found) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Paiement introuvable.');
  }

  const payment = await reconcile(found);
  const business = payment.statut === 'REUSSI' ? await findBusinessById(businessId) : null;

  return {
    paymentId: payment.referenceInterne,
    statut: payment.statut === 'INITIE' ? 'EN_ATTENTE' : payment.statut,
    planCode: payment.subscription?.plan.code ?? null,
    periode: payment.subscription?.periode ?? null,
    montant: payment.montant,
    subscriptionEndsAt: business?.subscriptionEndsAt ?? null,
  };
}
