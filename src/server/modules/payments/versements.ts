import { z } from 'zod';
import type { CashRegisterMode, Prisma } from '@prisma/client';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';
import { applyDailyStatsDelta } from '@/server/modules/reports/dailyStats';
import { ensureOpenRegisterForPayment } from '@/server/modules/cash/service';

/**
 * Versements : la règle unique du paiement partiel.
 *
 * Une commande se paie en plusieurs fois, et chaque paiement est un versement
 * rattaché à SA commande. Le reste d'une commande, la dette d'un client et le
 * total vendu d'un jour se déduisent tous de ces lignes, ici, et nulle part
 * ailleurs : l'écran n'affiche que ce que ce module renvoie.
 *
 * Avant ce module, « Encaisser » depuis « Qui me doit » créait un paiement
 * sans commande. La dette baissait dans un agrégat, mais les commandes
 * restaient impayées, l'argent n'entrait dans aucun total de vente et aucun
 * reçu ne pouvait le montrer.
 */

export const versementSchema = z.object({
  clientUuid: z.string().uuid(),
  montant: z.number().int().positive(),
  methode: z
    .enum(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN', 'MOOV', 'VIREMENT', 'AUTRE'])
    .default('ESPECES'),
});

export type VersementInput = z.infer<typeof versementSchema>;

export const cancelVersementSchema = z.object({
  motif: z.string().trim().min(1, 'Le motif est obligatoire pour annuler un versement.').max(500),
});

type Ctx = { businessId: string; userId: string; cashRegisterMode: CashRegisterMode };

export const VERSEMENT_INCLUDE = {
  order: { select: { id: true, numero: true, createdAt: true, total: true, clientUuid: true } },
  customer: { select: { id: true, nom: true, telephone: true } },
  user: { select: { nom: true } },
} satisfies Prisma.PaymentInclude;

export type PaymentWithRelations = Prisma.PaymentGetPayload<{ include: typeof VERSEMENT_INCLUDE }>;

/** REC-20260320-0042-V2 : le numéro de la commande, puis le rang du versement. */
export function receiptNumber(orderNumero: string, numero: number): string {
  return `REC-${orderNumero.replace(/^CMD-/, '')}-V${numero}`;
}

/** Le paiement fait au moment de la commande (createOrder, étape 6). */
function isAtOrder(paymentClientUuid: string, orderClientUuid: string | undefined): boolean {
  return orderClientUuid !== undefined && paymentClientUuid === `${orderClientUuid}:payment`;
}

function fcfa(montant: number): string {
  return `${String(montant).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
}

/** Ce que l'écran reçoit pour un versement — aucun coût, aucune marge. */
export function serializeVersement(p: PaymentWithRelations) {
  return {
    id: p.id,
    clientUuid: p.clientUuid,
    numero: p.numero,
    aLaCommande: isAtOrder(p.clientUuid, p.order?.clientUuid),
    orderId: p.orderId,
    orderNumero: p.order?.numero ?? null,
    orderDate: p.order?.createdAt ?? null,
    orderTotal: p.order?.total ?? null,
    orderClientUuid: p.order?.clientUuid ?? null,
    customerId: p.customerId,
    customerNom: p.customer?.nom ?? null,
    customerTelephone: p.customer?.telephone ?? null,
    montant: p.montant,
    methode: p.methode,
    createdAt: p.createdAt,
    resteApres: p.resteApres,
    dejaPaye: p.order && p.resteApres !== null ? p.order.total - p.resteApres : null,
    numeroRecu: p.numeroRecu,
    statut: p.statut,
    motifAnnulation: p.motifAnnulation,
    encaissePar: p.user?.nom ?? null,
  };
}

export type Versement = ReturnType<typeof serializeVersement>;

function sumValid(payments: { montant: number; statut: string }[]): number {
  return payments.filter((p) => p.statut === 'VALIDE').reduce((acc, p) => acc + p.montant, 0);
}

function statutFor(total: number, paye: number): 'PAYEE' | 'PARTIELLE' | 'CREDIT' {
  if (paye <= 0) return 'CREDIT';
  return paye >= total ? 'PAYEE' : 'PARTIELLE';
}

/**
 * Écrit UN versement sur UNE commande : la ligne de paiement avec son rang et
 * son reste figés, sa ligne de caisse, et le statut de la commande.
 */
async function writeVersement(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  registerId: string,
  order: { id: string; numero: string; total: number; customerId: string },
  avant: { paye: number; nbPaiements: number },
  params: {
    clientUuid: string;
    montant: number;
    methode: VersementInput['methode'];
    type: 'COMMANDE' | 'REMBOURSEMENT_DETTE';
  }
) {
  const numero = avant.nbPaiements + 1;
  const paye = avant.paye + params.montant;

  const payment = await tx.payment.create({
    data: {
      businessId: ctx.businessId,
      orderId: order.id,
      customerId: order.customerId,
      clientUuid: params.clientUuid,
      montant: params.montant,
      methode: params.methode,
      type: params.type,
      numero,
      resteApres: Math.max(0, order.total - paye),
      numeroRecu: receiptNumber(order.numero, numero),
      userId: ctx.userId,
    },
    include: VERSEMENT_INCLUDE,
  });

  await tx.cashMovement.create({
    data: {
      businessId: ctx.businessId,
      cashRegisterId: registerId,
      clientUuid: `${params.clientUuid}:cash`,
      type: 'ENTREE',
      origine: params.type === 'COMMANDE' ? 'COMMANDE' : 'REMBOURSEMENT',
      paymentId: payment.id,
      // L'écran Caisse lit referenceId pour dire d'où vient l'argent : la
      // commande pour un encaissement fait dessus, le client pour un
      // remboursement de dette.
      referenceId: params.type === 'COMMANDE' ? order.id : order.customerId,
      montant: payment.montant,
      methode: payment.methode,
      userId: ctx.userId,
    },
  });

  await tx.order.update({
    where: { id: order.id },
    data: { statutPaiement: statutFor(order.total, paye) },
  });

  return payment;
}

/** Versements déjà créés par cet envoi (le premier porte le clientUuid tel quel). */
function findByRequest(tx: Prisma.TransactionClient, businessId: string, clientUuid: string) {
  return tx.payment.findMany({
    where: {
      businessId,
      OR: [{ clientUuid }, { clientUuid: { startsWith: `${clientUuid}:` } }],
    },
    include: VERSEMENT_INCLUDE,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
}

async function customerDebt(tx: Prisma.TransactionClient, businessId: string, customerId: string) {
  const orders = await tx.order.findMany({
    where: { businessId, customerId, statut: { not: 'ANNULEE' } },
    select: { total: true, payments: { select: { montant: true, statut: true } } },
  });
  return orders.reduce((acc, o) => acc + Math.max(0, o.total - sumValid(o.payments)), 0);
}

/**
 * « Encaisser » depuis « Qui me doit ».
 *
 * Le montant est réparti sur les commandes impayées du client, de la plus
 * ancienne à la plus récente. Chaque commande touchée reçoit son propre
 * versement, numéroté dans cette commande.
 */
export async function collectCustomerDebt(ctx: Ctx, customerId: string, input: VersementInput) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, businessId: ctx.businessId },
    });
    if (!customer) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
    }

    // Un seul encaissement à la fois par client : deux validations simultanées
    // (double tap, renvoi hors ligne pendant un envoi) liraient la même dette
    // et la solderaient deux fois. La seconde attend ici, puis voit la première.
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${customer.id} FOR UPDATE`;

    const existing = await findByRequest(tx, ctx.businessId, input.clientUuid);
    if (existing.length > 0) {
      return {
        status: 'DUPLICATE' as const,
        versements: existing.map(serializeVersement),
        dette: await customerDebt(tx, ctx.businessId, customer.id),
        customer: { id: customer.id, nom: customer.nom },
      };
    }

    const orders = await tx.order.findMany({
      where: { businessId: ctx.businessId, customerId: customer.id, statut: { not: 'ANNULEE' } },
      include: { payments: { select: { montant: true, statut: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const impayees = orders
      .map((o) => ({ order: o, paye: sumValid(o.payments) }))
      .filter((l) => l.order.total - l.paye > 0);
    const dette = impayees.reduce((acc, l) => acc + (l.order.total - l.paye), 0);

    if (input.montant > dette) {
      throw new AppError(
        'PAYMENT_EXCEEDS_REMAINING',
        `Le montant dépasse ce que ${customer.nom} te doit (${fcfa(dette)}).`
      );
    }

    const register = await ensureOpenRegisterForPayment(tx, ctx);

    const payments: PaymentWithRelations[] = [];
    let restant = input.montant;
    for (const ligne of impayees) {
      if (restant <= 0) break;
      const part = Math.min(restant, ligne.order.total - ligne.paye);
      payments.push(
        await writeVersement(
          tx,
          ctx,
          register.id,
          ligne.order,
          { paye: ligne.paye, nbPaiements: ligne.order.payments.length },
          {
            clientUuid:
              payments.length === 0 ? input.clientUuid : `${input.clientUuid}:${payments.length + 1}`,
            montant: part,
            methode: input.methode,
            type: 'REMBOURSEMENT_DETTE',
          }
        )
      );
      restant -= part;
    }

    // Reçu le jour de l'encaissement, pas le jour de la commande.
    await applyDailyStatsDelta(tx, ctx.businessId, { recu: input.montant });

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'DEBT_REPAYMENT',
        entite: 'Customer',
        entiteId: customer.id,
        nouvellesValeurs: { montant: input.montant, commandes: payments.map((p) => p.orderId) },
      },
    });

    return {
      status: 'CREATED' as const,
      versements: payments.map(serializeVersement),
      dette: dette - input.montant,
      customer: { id: customer.id, nom: customer.nom },
    };
  });
}

/** Encaisser sur une commande précise (« Encaisser le reste » d'une commande). */
export async function collectOrderPayment(ctx: Ctx, orderId: string, input: VersementInput) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const found = await tx.order.findFirst({
      where: { id: orderId, businessId: ctx.businessId },
      select: { id: true },
    });
    if (!found) {
      throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable.');
    }
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${found.id} FOR UPDATE`;

    const existing = await findByRequest(tx, ctx.businessId, input.clientUuid);
    if (existing.length > 0) {
      return { status: 'DUPLICATE' as const, versement: serializeVersement(existing[0]), payment: existing[0] };
    }

    const order = await tx.order.findFirstOrThrow({
      where: { id: found.id },
      include: { payments: { select: { montant: true, statut: true } }, customer: { select: { nom: true } } },
    });
    if (order.statut === 'ANNULEE') {
      throw new AppError('ORDER_IMMUTABLE', 'Cette commande est annulée et ne peut plus recevoir de paiement.');
    }

    const paye = sumValid(order.payments);
    const reste = order.total - paye;
    if (input.montant > reste) {
      throw new AppError(
        'PAYMENT_EXCEEDS_REMAINING',
        `Le montant dépasse le reste à payer de cette commande (${fcfa(Math.max(0, reste))}).`
      );
    }

    const register = await ensureOpenRegisterForPayment(tx, ctx);
    const payment = await writeVersement(
      tx,
      ctx,
      register.id,
      order,
      { paye, nbPaiements: order.payments.length },
      { clientUuid: input.clientUuid, montant: input.montant, methode: input.methode, type: 'COMMANDE' }
    );

    await applyDailyStatsDelta(tx, ctx.businessId, { recu: input.montant });

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'ORDER_PAYMENT_ADDED',
        entite: 'Order',
        entiteId: order.id,
        nouvellesValeurs: { montant: input.montant, numero: payment.numero },
      },
    });

    return { status: 'CREATED' as const, versement: serializeVersement(payment), payment };
  });
}

/**
 * Annule un versement — jamais de suppression. La ligne reste, barrée ; la
 * caisse reçoit la sortie inverse ; le reste de la commande et la dette du
 * client se recalculent d'eux-mêmes puisqu'ils ne comptent que les versements
 * valides.
 */
export async function cancelVersement(
  ctx: { businessId: string; userId: string },
  paymentId: string,
  motif: string
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const found = await tx.payment.findFirst({
      where: { id: paymentId, businessId: ctx.businessId },
      select: { id: true, orderId: true },
    });
    if (!found) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Versement introuvable.');
    }
    if (found.orderId) {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${found.orderId} FOR UPDATE`;
    }

    const payment = await tx.payment.findFirstOrThrow({ where: { id: found.id } });
    if (payment.statut === 'ANNULE') {
      throw new AppError('VALIDATION_ERROR', 'Ce versement est déjà annulé.');
    }

    const cancelled = await tx.payment.update({
      where: { id: payment.id },
      data: { statut: 'ANNULE', motifAnnulation: motif, annuleParId: ctx.userId, annuleLe: new Date() },
      include: VERSEMENT_INCLUDE,
    });

    const cashMovement = await tx.cashMovement.findUnique({ where: { paymentId: payment.id } });
    if (cashMovement) {
      await tx.cashMovement.create({
        data: {
          businessId: ctx.businessId,
          cashRegisterId: cashMovement.cashRegisterId,
          clientUuid: `cancel:${cashMovement.clientUuid}`,
          type: 'SORTIE',
          origine: cashMovement.origine,
          referenceId: cashMovement.referenceId,
          montant: cashMovement.montant,
          methode: cashMovement.methode,
          motif: `Versement annulé : ${motif}`,
          userId: ctx.userId,
        },
      });
    }

    if (payment.orderId) {
      const order = await tx.order.findFirstOrThrow({
        where: { id: payment.orderId },
        include: { payments: { select: { montant: true, statut: true } } },
      });
      if (order.statut !== 'ANNULEE') {
        await tx.order.update({
          where: { id: order.id },
          data: { statutPaiement: statutFor(order.total, sumValid(order.payments)) },
        });
      }
    }

    await applyDailyStatsDelta(tx, ctx.businessId, { recu: -payment.montant }, payment.createdAt);

    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'PAYMENT_CANCELLED',
        entite: 'Payment',
        entiteId: payment.id,
        motif,
        anciennesValeurs: { montant: payment.montant },
      },
    });

    return serializeVersement(cancelled);
  });
}

/** Tous les versements d'un client, toutes commandes confondues, du plus récent au plus ancien. */
export async function listCustomerVersements(businessId: string, customerId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: customerId, businessId } });
    if (!customer) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Client introuvable.');
    }
    const payments = await tx.payment.findMany({
      where: { businessId, customerId },
      include: VERSEMENT_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      customer: { id: customer.id, nom: customer.nom },
      dette: await customerDebt(tx, businessId, customer.id),
      versements: payments.map(serializeVersement),
    };
  });
}

/** Historique des paiements d'une commande, du 1er versement au dernier. */
export async function listOrderVersements(businessId: string, orderId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, businessId } });
    if (!order) {
      throw new AppError('ORDER_NOT_FOUND', 'Commande introuvable.');
    }
    const payments = await tx.payment.findMany({
      where: { businessId, orderId },
      include: VERSEMENT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    const paye = sumValid(payments);
    return {
      order: {
        id: order.id,
        numero: order.numero,
        createdAt: order.createdAt,
        total: order.total,
        paye,
        reste: order.statut === 'ANNULEE' ? 0 : Math.max(0, order.total - paye),
        statutPaiement: order.statutPaiement,
        statut: order.statut,
      },
      versements: payments.map(serializeVersement),
    };
  });
}

/** Données figées du reçu d'un versement. */
export async function getVersementReceipt(businessId: string, paymentId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const payment = await tx.payment.findFirst({
      where: { id: paymentId, businessId },
      include: VERSEMENT_INCLUDE,
    });
    if (!payment) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Versement introuvable.');
    }
    const business = await tx.business.findUnique({ where: { id: businessId } });
    return {
      boutique: { nom: business?.nom ?? '', ville: business?.ville ?? null },
      versement: serializeVersement(payment),
    };
  });
}

export type ActivityType = 'all' | 'orders' | 'payments';

/**
 * La liste du jour (ou de la période) et son total.
 *
 * Total vendu = somme des paiements valides REÇUS sur la période : ceux faits
 * à la commande et les versements sur d'anciennes commandes. La part non payée
 * d'une commande n'y entre que le jour où elle est payée — une vente n'est
 * donc jamais comptée deux fois, et le total d'un jour passé ne bouge plus.
 */
export async function getActivity(businessId: string, from: Date, to: Date, type: ActivityType = 'all') {
  return runInTenantTransaction(businessId, async (tx) => {
    const [orders, payments] = await Promise.all([
      tx.order.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        select: {
          id: true,
          total: true,
          statut: true,
          clientUuid: true,
          payments: { select: { montant: true, statut: true, clientUuid: true } },
        },
      }),
      tx.payment.findMany({
        where: { businessId, createdAt: { gte: from, lte: to } },
        include: VERSEMENT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);

    const actives = orders.filter((o) => o.statut !== 'ANNULEE');
    const commandes = orders.map((o) => {
      const paye = sumValid(o.payments);
      return {
        id: o.id,
        payeALaCommande: sumValid(o.payments.filter((p) => isAtOrder(p.clientUuid, o.clientUuid))),
        paye,
        reste: o.statut === 'ANNULEE' ? 0 : Math.max(0, o.total - paye),
      };
    });
    // Une ligne « versement » est tout paiement qui n'a pas été fait à la
    // création de la commande : c'est lui qui porte la pastille.
    const versements = payments.map(serializeVersement).filter((v) => !v.aLaCommande);

    return {
      from,
      to,
      totalVendu: sumValid(payments),
      nbCommandes: actives.length,
      nbVersements: versements.filter((v) => v.statut === 'VALIDE').length,
      resteSurCommandes: commandes.reduce((acc, c) => acc + c.reste, 0),
      commandes: type === 'payments' ? [] : commandes,
      versements: type === 'orders' ? [] : versements,
    };
  });
}

/** Dernier versement valide de chaque client, pour la liste « Qui me doit ». */
export async function getLastVersements(
  businessId: string
): Promise<Map<string, { date: Date; montant: number }>> {
  return runInTenantTransaction(businessId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: { businessId, statut: 'VALIDE', customerId: { not: null } },
      select: { customerId: true, montant: true, createdAt: true, clientUuid: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    // Un encaissement réparti sur plusieurs commandes fait plusieurs lignes,
    // mais le client n'a tendu qu'une somme : c'est elle qu'on affiche.
    const envoi = (clientUuid: string) => clientUuid.replace(/:\d+$/, '');
    const last = new Map<string, { date: Date; montant: number; envoi: string }>();
    for (const p of payments) {
      if (!p.customerId) continue;
      const known = last.get(p.customerId);
      if (!known) {
        last.set(p.customerId, { date: p.createdAt, montant: p.montant, envoi: envoi(p.clientUuid) });
      } else if (known.envoi === envoi(p.clientUuid)) {
        known.montant += p.montant;
      }
    }
    return new Map([...last].map(([id, v]) => [id, { date: v.date, montant: v.montant }]));
  });
}
