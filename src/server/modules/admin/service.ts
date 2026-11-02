import { z } from 'zod';
import type { Business, Plan, Prisma, Subscription } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { PERIOD_MONTHS } from '@/server/shared/subscription';
import { AppError } from '@/server/shared/errors';
import { hashPin } from '@/server/modules/auth/pin';
import { setTenantContext } from '@/server/middleware/tenant';
import { deleteProductImage } from '@/server/integrations/cloudinary';

/**
 * Module admin — volontairement cross-tenant (spec : `AdminUser` est l'exception
 * scopée à la règle §0.1). Appelle `prisma` directement plutôt que `scoped()`,
 * puisque ses requêtes portent par nature sur plusieurs/toutes les boutiques.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

type PaidSubscription = Subscription & { plan: Plan };

/**
 * Abonnement payé en cours : celui qui couvre aujourd'hui, sinon le plus
 * récent (échu, ou prépayé pour plus tard). `subs` est trié par dateFin décroissante.
 */
function currentSubscription(subs: PaidSubscription[]): PaidSubscription | null {
  const now = Date.now();
  return subs.find((s) => s.dateDebut.getTime() <= now && s.dateFin.getTime() > now) ?? subs[0] ?? null;
}

/** Revenu mensuel d'une boutique active : montant réellement payé ramené au mois, à défaut le prix public mensuel. */
function monthlyRevenue(sub: PaidSubscription | null, plan: Plan | null): number {
  if (sub) return Math.round(sub.montant / PERIOD_MONTHS[sub.periode]);
  return plan?.prixMensuel ?? 0;
}

const paidSubscriptions = {
  where: { actif: true },
  include: { plan: true },
  orderBy: { dateFin: 'desc' },
} satisfies Prisma.Business$subscriptionsArgs;

export async function getMetrics() {
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * DAY_MS);
  const in7d = new Date(now.getTime() + 7 * DAY_MS);

  const [businessesByStatut, totalUsers, activeBusinesses, newBusinesses, expiringTrials, signups, payments, cancellations] =
    await Promise.all([
      prisma.business.groupBy({ by: ['statut'], _count: { _all: true } }),
      prisma.user.count({ where: { actif: true } }),
      prisma.business.findMany({
        where: { statut: 'ACTIF' },
        include: { plan: true, subscriptions: paidSubscriptions },
      }),
      prisma.business.findMany({
        where: { createdAt: { gte: since30d } },
        select: { id: true, subPayments: { where: { statut: 'REUSSI' }, select: { id: true }, take: 1 } },
      }),
      prisma.business.findMany({
        where: { statut: 'ESSAI', trialEndsAt: { gte: now, lte: in7d } },
        select: { id: true, nom: true, trialEndsAt: true },
        orderBy: { trialEndsAt: 'asc' },
      }),
      prisma.business.findMany({
        select: { id: true, nom: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.subscriptionPayment.findMany({
        where: { statut: { in: ['REUSSI', 'ECHOUE'] } },
        include: { business: { select: { nom: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.business.findMany({
        where: { statut: 'RESILIE', deletedAt: { not: null } },
        select: { id: true, nom: true, deletedAt: true },
        orderBy: { deletedAt: 'desc' },
        take: 10,
      }),
    ]);

  // Boutiques actives par formule (celle de la boutique), avec le MRR qu'elles représentent.
  const parFormule = new Map<string, { formule: string; boutiques: number; mrr: number }>();
  for (const b of activeBusinesses) {
    const sub = currentSubscription(b.subscriptions);
    const plan = sub?.plan ?? b.plan;
    const key = plan?.code ?? 'AUCUNE';
    const entry = parFormule.get(key) ?? { formule: plan ? shortPlanName(plan.nom) : 'Sans formule', boutiques: 0, mrr: 0 };
    entry.boutiques += 1;
    entry.mrr += monthlyRevenue(sub, plan);
    parFormule.set(key, entry);
  }
  const actifsParFormule = [...parFormule.values()].sort((a, b) => b.mrr - a.mrr);

  // Conversion essai → payant : boutiques inscrites ces 30 derniers jours qui ont déjà payé.
  const converties = newBusinesses.filter((b) => b.subPayments.length > 0).length;

  const activiteRecente: {
    type: 'INSCRIPTION' | 'PAIEMENT_REUSSI' | 'PAIEMENT_ECHOUE' | 'ANNULATION';
    date: Date;
    businessId: string;
    businessNom: string;
    montant: number | null;
  }[] = [
    ...signups.map((b) => ({ type: 'INSCRIPTION' as const, date: b.createdAt, businessId: b.id, businessNom: b.nom, montant: null })),
    ...payments.map((p) => ({
      type: p.statut === 'REUSSI' ? ('PAIEMENT_REUSSI' as const) : ('PAIEMENT_ECHOUE' as const),
      date: p.createdAt,
      businessId: p.businessId,
      businessNom: p.business.nom,
      montant: p.montant,
    })),
    ...cancellations.map((b) => ({ type: 'ANNULATION' as const, date: b.deletedAt!, businessId: b.id, businessNom: b.nom, montant: null })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  return {
    businessesParStatut: Object.fromEntries(businessesByStatut.map((b) => [b.statut, b._count._all])),
    totalUsersActifs: totalUsers,
    mrrEstime: actifsParFormule.reduce((acc, f) => acc + f.mrr, 0),
    actifsParFormule,
    conversion30j: {
      inscrites: newBusinesses.length,
      converties,
      taux: newBusinesses.length > 0 ? converties / newBusinesses.length : null,
    },
    essaisExpirant7j: expiringTrials.map((b) => ({
      businessId: b.id,
      nom: b.nom,
      trialEndsAt: b.trialEndsAt!,
      joursRestants: Math.max(0, Math.ceil((b.trialEndsAt!.getTime() - now.getTime()) / DAY_MS)),
    })),
    activiteRecente,
  };
}

export interface RecentBusiness {
  id: string;
  nom: string;
  ville: string | null;
  statut: Business['statut'];
  createdAt: Date;
  /** Volume saisi dans la boutique : à zéro partout, c'est une coquille vide. */
  produits: number;
  ventes: number;
  clients: number;
}

/**
 * Les dernières boutiques inscrites, avec ce qu'elles contiennent — de quoi
 * voir d'un coup d'œil, depuis la page d'accueil, si une boutique créée en
 * testant est restée vide.
 *
 * Les trois compteurs portent sur des tables sous RLS : chacun demande une
 * transaction avec son propre `app.business_id` (une variable de session ne
 * vaut que pour une boutique à la fois, voir §3.1). Ces transactions partent
 * donc en parallèle : en série, dix boutiques coûteraient dix allers-retours
 * enchaînés sur le pilote Neon, soit plusieurs secondes de page blanche.
 */
export async function listRecentBusinesses(limit = 10): Promise<RecentBusiness[]> {
  const businesses = await prisma.business.findMany({
    select: { id: true, nom: true, ville: true, statut: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return Promise.all(
    businesses.map(async (b) => {
      const volume = await prisma.$transaction(async (tx) => {
        await setTenantContext(tx, b.id);
        return {
          produits: await tx.product.count(),
          ventes: await tx.order.count(),
          clients: await tx.customer.count(),
        };
      });
      return { ...b, ...volume };
    })
  );
}

/** « Formule Business » → « Business ». */
function shortPlanName(nom: string): string {
  return nom.replace(/^Formule\s+/i, '');
}

export async function listBusinesses(
  opts: { statut?: string; pays?: string; affiliateId?: string; limit?: number; cursor?: string } = {}
) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const businesses = await prisma.business.findMany({
    where: {
      ...(opts.statut ? { statut: opts.statut as never } : {}),
      ...(opts.pays ? { pays: opts.pays } : {}),
      ...(opts.affiliateId ? { affiliateId: opts.affiliateId === 'DIRECT' ? null : opts.affiliateId } : {}),
    },
    include: {
      plan: true,
      subscriptions: paidSubscriptions,
      affiliate: { select: { id: true, code: true, nom: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  // Offre affichée = ce que la boutique a réellement payé (montant + durée), pas seulement le nom de la formule.
  return businesses.map(({ subscriptions, ...b }) => {
    const sub = currentSubscription(subscriptions);
    return {
      ...b,
      abonnement: sub
        ? { formule: shortPlanName(sub.plan.nom), montant: sub.montant, periode: sub.periode, dateFin: sub.dateFin }
        : null,
    };
  });
}

/** Page « Paiements » : chaque transaction d'abonnement, la plus récente d'abord. */
export async function listSubscriptionPayments(
  opts: { statut?: string; businessId?: string; limit?: number; cursor?: string } = {}
) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const payments = await prisma.subscriptionPayment.findMany({
    where: {
      ...(opts.statut ? { statut: opts.statut as never } : {}),
      ...(opts.businessId ? { businessId: opts.businessId } : {}),
    },
    include: { business: { select: { nom: true } }, subscription: { include: { plan: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  return payments.map((p) => ({
    id: p.id,
    businessId: p.businessId,
    businessNom: p.business.nom,
    montant: p.montant,
    formule: p.subscription ? shortPlanName(p.subscription.plan.nom) : null,
    periode: p.subscription?.periode ?? null,
    methode: p.methode,
    statut: p.statut,
    referenceInterne: p.referenceInterne,
    referencePasserelle: p.referencePasserelle,
    createdAt: p.createdAt,
  }));
}

export async function listAuditLogs(opts: { businessId?: string; limit?: number; cursor?: string } = {}) {
  const limit = Math.min(opts.limit ?? 50, 200);
  const logs = await prisma.auditLog.findMany({
    where: opts.businessId ? { businessId: opts.businessId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  return logs;
}

/** AuditLog d'une action admin — `adminUserId` peuplé, `userId` absent (spec : "Admin actions must write AuditLog with adminUserId populated"). */
export async function auditAdminAction(entry: {
  adminUserId: string;
  /** Absent pour une action qui vise toutes les boutiques (ex. notification à tous). */
  businessId?: string;
  action: string;
  entite: string;
  entiteId?: string;
  nouvellesValeurs?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      businessId: entry.businessId,
      adminUserId: entry.adminUserId,
      action: entry.action,
      entite: entry.entite,
      entiteId: entry.entiteId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nouvellesValeurs: entry.nouvellesValeurs as any,
    },
  });
}

// Nécessaire pour peupler le sélecteur "changer d'offre" de l'admin — sans
// cette liste, changePlan() n'est utilisable qu'en connaissant un planId à
// l'avance.
export async function listPlans() {
  return prisma.plan.findMany({ where: { actif: true }, orderBy: { prixMensuel: 'asc' } });
}

// Nécessaire pour peupler le sélecteur "réinitialiser le code" de l'admin —
// resetUserCode() exige un userId, cross-tenant donc pas via scoped().
export async function listBusinessUsers(businessId: string) {
  await findBusinessOrThrow(businessId);
  return prisma.user.findMany({ where: { businessId }, orderBy: { createdAt: 'asc' } });
}

async function findBusinessOrThrow(businessId: string) {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable.');
  }
  return business;
}

export const extendTrialSchema = z.object({ jours: z.number().int().positive() });

export async function extendTrial(businessId: string, input: z.infer<typeof extendTrialSchema>) {
  const business = await findBusinessOrThrow(businessId);
  const base = business.trialEndsAt && business.trialEndsAt > new Date() ? business.trialEndsAt : new Date();
  const trialEndsAt = new Date(base.getTime() + input.jours * 24 * 60 * 60 * 1000);
  return prisma.business.update({ where: { id: businessId }, data: { trialEndsAt } });
}

export const changePlanSchema = z.object({ planId: z.string().cuid() });

export async function changePlan(businessId: string, input: z.infer<typeof changePlanSchema>) {
  await findBusinessOrThrow(businessId);
  const plan = await prisma.plan.findUnique({ where: { id: input.planId } });
  if (!plan || !plan.actif) {
    throw new AppError('VALIDATION_ERROR', 'Offre introuvable ou inactive.');
  }
  return prisma.business.update({ where: { id: businessId }, data: { planId: plan.id } });
}

export async function suspendBusiness(businessId: string) {
  await findBusinessOrThrow(businessId);
  return prisma.business.update({ where: { id: businessId }, data: { statut: 'SUSPENDU' } });
}

export async function reactivateBusiness(businessId: string) {
  await findBusinessOrThrow(businessId);
  return prisma.business.update({ where: { id: businessId }, data: { statut: 'ACTIF' } });
}

export const resetUserCodeSchema = z.object({
  userId: z.string().cuid(),
  newPin: z.string().regex(/^\d{6}$/, 'Le mot de passe doit comporter exactement 6 chiffres'),
});

/**
 * Réinitialise directement le code PIN d'un utilisateur d'une boutique donnée
 * (critère de sortie étape 12 : "resets a user's PIN purely through the admin
 * API") — distinct du flux OTP en libre-service côté tenant (reset-code/request
 * + confirm, étape 2), qui reste inchangé pour les utilisateurs eux-mêmes.
 */
export async function resetUserCode(businessId: string, input: z.infer<typeof resetUserCodeSchema>) {
  await findBusinessOrThrow(businessId);
  const user = await prisma.user.findFirst({ where: { id: input.userId, businessId } });
  if (!user) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Utilisateur introuvable pour cette boutique.');
  }
  const codeHash = await hashPin(input.newPin);
  return prisma.user.update({ where: { id: user.id }, data: { codeHash } });
}

/**
 * Suppression définitive d'une boutique et de tout ce qui lui est rattaché —
 * destinée aux comptes de test et aux boutiques créées par erreur. Rien n'est
 * récupérable ensuite : la route exige le nom exact de la boutique en
 * confirmation (voir deleteBusinessSchema).
 *
 * Tout passe dans UNE transaction avec le contexte tenant posé : les tables à
 * businessId sont sous RLS FORCE et le rôle applicatif n'a pas BYPASSRLS — sans
 * `app.business_id`, chaque DELETE porterait sur zéro ligne sans lever d'erreur
 * (spec §3.1). L'ordre suit les clés étrangères, des feuilles vers la racine :
 * le schéma n'a presque aucun `onDelete: Cascade` côté boutique, donc une ligne
 * oubliée ferait échouer la transaction entière — jamais une suppression
 * partielle.
 */
export const deleteBusinessSchema = z.object({
  /** Nom exact de la boutique, retapé par l'admin : garde-fou contre le mauvais clic. */
  confirmation: z.string().min(1, 'Confirmation requise.'),
  motif: z.string().max(500).optional(),
});

export interface DeletedBusinessSummary {
  nom: string;
  lignes: Record<string, number>;
  total: number;
}

export async function deleteBusiness(
  businessId: string,
  input: z.infer<typeof deleteBusinessSchema>
): Promise<DeletedBusinessSummary> {
  const business = await findBusinessOrThrow(businessId);

  if (input.confirmation.trim() !== business.nom.trim()) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Le nom saisi ne correspond pas à celui de la boutique. Suppression annulée.'
    );
  }

  // Une commission déjà payée à un affilié ne peut pas disparaître : son
  // historique de retraits deviendrait faux. On bloque plutôt que de réécrire
  // la comptabilité du programme d'affiliation à son insu.
  const commissionPayee = await prisma.affiliateCommission.findFirst({
    where: { businessId, payout: { statut: 'PAYE' } },
    select: { id: true },
  });
  if (commissionPayee) {
    throw new AppError(
      'VALIDATION_ERROR',
      "Cette boutique a généré une commission d'affiliation déjà payée : elle ne peut pas être supprimée. Suspends-la à la place."
    );
  }

  const { lignes, imagesCloudinary } = await prisma.$transaction(
    async (tx) => {
      await setTenantContext(tx, businessId);

      // Récupérées avant la suppression pour nettoyer Cloudinary après coup.
      const images = await tx.productImage.findMany({
        where: { product: { businessId } },
        select: { cloudinaryPublicId: true },
      });

      const compte: Record<string, number> = {};
      const effacer = async (cle: string, suppression: () => Promise<{ count: number }>) => {
        const { count } = await suppression();
        if (count > 0) compte[cle] = count;
      };

      // Caisse d'abord : CashMovement cite Payment, CashRegister et User.
      await effacer('mouvementsCaisse', () => tx.cashMovement.deleteMany({ where: { businessId } }));
      await effacer('caisses', () => tx.cashRegister.deleteMany({ where: { businessId } }));
      // Stock : StockMovement cite produit, vente, réception et comptage.
      await effacer('mouvementsStock', () => tx.stockMovement.deleteMany({ where: { businessId } }));
      // Expense.receptionId est unique : la dépense part avant sa réception.
      await effacer('depenses', () => tx.expense.deleteMany({ where: { businessId } }));
      await effacer('receptions', () => tx.stockReception.deleteMany({ where: { businessId } }));
      await effacer('comptages', () => tx.stockCount.deleteMany({ where: { businessId } }));
      // Ventes : paiements, puis lignes (Cascade, comptées explicitement), puis ventes.
      await effacer('paiements', () => tx.payment.deleteMany({ where: { businessId } }));
      await effacer('lignesVente', () => tx.orderItem.deleteMany({ where: { order: { businessId } } }));
      await effacer('ventes', () => tx.order.deleteMany({ where: { businessId } }));
      await effacer('commerciaux', () => tx.commercial.deleteMany({ where: { businessId } }));
      // Catalogue : codes et images avant les produits.
      await effacer('codesBarres', () => tx.productCode.deleteMany({ where: { businessId } }));
      await effacer('imagesProduit', () => tx.productImage.deleteMany({ where: { product: { businessId } } }));
      await effacer('produits', () => tx.product.deleteMany({ where: { businessId } }));
      await effacer('clients', () => tx.customer.deleteMany({ where: { businessId } }));
      await effacer('categories', () => tx.category.deleteMany({ where: { businessId } }));
      await effacer('statsJour', () => tx.dailyStats.deleteMany({ where: { businessId } }));
      await effacer('notifications', () => tx.notification.deleteMany({ where: { businessId } }));
      // Abonnement : commissions, puis paiements (cités par les commissions),
      // puis factures et abonnements.
      await effacer('commissionsAffiliation', () =>
        tx.affiliateCommission.deleteMany({ where: { businessId } })
      );
      await effacer('paiementsAbonnement', () =>
        tx.subscriptionPayment.deleteMany({ where: { businessId } })
      );
      await effacer('factures', () => tx.invoice.deleteMany({ where: { businessId } }));
      await effacer('abonnements', () => tx.subscription.deleteMany({ where: { businessId } }));
      await effacer('abonnementsPush', () => tx.pushSubscription.deleteMany({ where: { businessId } }));
      // Le journal d'audit de la boutique part avec elle ; l'entrée qui trace
      // CETTE suppression est écrite après, sans businessId (il n'existe plus).
      await effacer('journalAudit', () => tx.auditLog.deleteMany({ where: { businessId } }));
      // Sessions et visite guidée tombent en cascade avec les comptes.
      await effacer('comptes', () => tx.user.deleteMany({ where: { businessId } }));

      await tx.business.delete({ where: { id: businessId } });

      return {
        lignes: compte,
        imagesCloudinary: images
          .map((i) => i.cloudinaryPublicId)
          .filter((id): id is string => Boolean(id)),
      };
    },
    // Une boutique chargée fait beaucoup d'allers-retours, et le pilote Neon
    // en fait un par requête : la marge par défaut (15 s) ne suffit pas.
    { timeout: 60_000, maxWait: 20_000 }
  );

  // Hors transaction : un échec Cloudinary ne doit pas rendre la boutique
  // à moitié supprimée en base. Au pire une image reste orpheline.
  for (const publicId of imagesCloudinary) {
    try {
      await deleteProductImage(publicId);
    } catch (error) {
      console.error(`Cloudinary : image ${publicId} non supprimée`, error);
    }
  }

  return {
    nom: business.nom,
    lignes,
    total: Object.values(lignes).reduce((a, n) => a + n, 0),
  };
}
