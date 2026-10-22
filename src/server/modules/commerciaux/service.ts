import { z } from 'zod';
import type { Prisma, UserRole } from '@prisma/client';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

/**
 * Suivi des ventes par commercial.
 *
 * Un commercial n'est jamais supprimé : un départ le passe inactif. Il sort
 * alors du sélecteur de vente, mais ses ventes passées restent attribuées et
 * comptées. Son id est un UUID tiré par l'appareil, pour qu'un commercial créé
 * hors ligne ait tout de suite son identifiant définitif.
 */

export const createCommercialSchema = z.object({
  id: z.string().uuid(),
  nom: z.string().trim().min(1).max(120),
  telephone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((v) => (v ? v : undefined)),
  // « Moi » dans le sélecteur : le commercial est la personne connectée.
  pourMoi: z.boolean().optional(),
});

export const updateCommercialSchema = z.object({
  nom: z.string().trim().min(1).max(120).optional(),
  telephone: z.string().trim().max(30).nullable().optional(),
  actif: z.boolean().optional(),
});

export function listCommerciaux(businessId: string) {
  return runInTenantTransaction(businessId, (tx) =>
    tx.commercial.findMany({ where: { businessId }, orderBy: [{ actif: 'desc' }, { nom: 'asc' }] })
  );
}

/**
 * Création idempotente : renvoyer le même id (double envoi, file hors ligne)
 * rend le commercial déjà créé au lieu d'un doublon.
 */
export function createCommercial(
  ctx: { businessId: string; userId: string },
  input: z.infer<typeof createCommercialSchema>
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const existing = await tx.commercial.findUnique({ where: { id: input.id } });
    if (existing) {
      if (existing.businessId !== ctx.businessId) {
        throw new AppError('VALIDATION_ERROR', 'Identifiant de commercial invalide.');
      }
      return existing;
    }
    if (input.pourMoi) {
      // La personne connectée a déjà sa fiche : on la réactive au besoin.
      const mine = await tx.commercial.findUnique({ where: { userId: ctx.userId } });
      if (mine) return mine.actif ? mine : tx.commercial.update({ where: { id: mine.id }, data: { actif: true } });
    }
    return tx.commercial.create({
      data: {
        id: input.id,
        businessId: ctx.businessId,
        nom: input.nom,
        telephone: input.telephone ?? null,
        userId: input.pourMoi ? ctx.userId : null,
      },
    });
  });
}

export function updateCommercial(businessId: string, id: string, input: z.infer<typeof updateCommercialSchema>) {
  return runInTenantTransaction(businessId, async (tx) => {
    const existing = await tx.commercial.findFirst({ where: { id, businessId } });
    if (!existing) throw new AppError('RESOURCE_NOT_OWNED', 'Commercial introuvable.');
    return tx.commercial.update({
      where: { id },
      data: {
        ...(input.nom !== undefined ? { nom: input.nom } : {}),
        ...(input.telephone !== undefined ? { telephone: input.telephone || null } : {}),
        ...(input.actif !== undefined ? { actif: input.actif } : {}),
      },
    });
  });
}

/**
 * Fiche commercial d'un employé (case « Commercial ») : créée ou réactivée
 * quand la case est cochée, désactivée quand elle est décochée ou que
 * l'employé est désactivé. Jamais supprimée.
 */
export async function syncEmployeeCommercial(
  tx: Prisma.TransactionClient,
  businessId: string,
  user: { id: string; nom: string; telephone: string },
  actif: boolean
) {
  const mine = await tx.commercial.findUnique({ where: { userId: user.id } });
  if (mine) {
    if (mine.actif !== actif) await tx.commercial.update({ where: { id: mine.id }, data: { actif } });
    return;
  }
  if (!actif) return;
  await tx.commercial.create({
    data: { id: crypto.randomUUID(), businessId, nom: user.nom, telephone: user.telephone, userId: user.id },
  });
}

/**
 * Commercial retenu pour une nouvelle vente, décidé par le serveur :
 * - une personne connectée qui est elle-même commercial (rôle vendeur) vend
 *   toujours pour elle-même, quoi que l'appareil envoie ;
 * - sinon, le commercial choisi. Inconnu du serveur (créé hors ligne, pas
 *   encore synchronisé) : il est créé ici avec le nom joint à la vente.
 * Mode désactivé : on garde seulement ce que l'appareil a envoyé (vente faite
 * hors ligne avant la coupure).
 */
export async function resolveOrderCommercial(
  tx: Prisma.TransactionClient,
  ctx: { businessId: string; userId: string; role: UserRole; suiviCommercialActif?: boolean },
  input: { commercialId?: string | null; commercialNom?: string }
): Promise<string | null> {
  if (ctx.suiviCommercialActif && ctx.role === 'SELLER') {
    const mine = await tx.commercial.findUnique({ where: { userId: ctx.userId } });
    if (mine?.actif) return mine.id;
  }
  if (!input.commercialId) return null;

  const found = await tx.commercial.findUnique({ where: { id: input.commercialId } });
  if (found) return found.businessId === ctx.businessId ? found.id : null;
  const nom = input.commercialNom?.trim();
  if (!nom) return null;
  const created = await tx.commercial.create({
    data: { id: input.commercialId, businessId: ctx.businessId, nom: nom.slice(0, 120) },
  });
  return created.id;
}

/** Correction après coup, réservée au propriétaire. Tracée : qui, quand, ancien, nouveau. */
export function changeOrderCommercial(
  ctx: { businessId: string; userId: string },
  orderId: string,
  commercialId: string | null
) {
  return runInTenantTransaction(ctx.businessId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, businessId: ctx.businessId },
      include: { commercial: true },
    });
    if (!order) throw new AppError('RESOURCE_NOT_OWNED', 'Commande introuvable.');

    const nouveau = commercialId
      ? await tx.commercial.findFirst({ where: { id: commercialId, businessId: ctx.businessId } })
      : null;
    if (commercialId && !nouveau) throw new AppError('RESOURCE_NOT_OWNED', 'Commercial introuvable.');
    if (order.commercialId === (nouveau?.id ?? null)) return order;

    const updated = await tx.order.update({ where: { id: order.id }, data: { commercialId: nouveau?.id ?? null } });
    await tx.auditLog.create({
      data: {
        businessId: ctx.businessId,
        userId: ctx.userId,
        action: 'ORDER_COMMERCIAL_CHANGED',
        entite: 'Order',
        entiteId: order.id,
        anciennesValeurs: { commercialId: order.commercialId, commercialNom: order.commercial?.nom ?? null },
        nouvellesValeurs: { commercialId: nouveau?.id ?? null, commercialNom: nouveau?.nom ?? null },
      },
    });
    return updated;
  });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextDay(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

/** Clé de regroupement des ventes sans commercial. */
export const NON_ATTRIBUE = 'NON_ATTRIBUE';

export interface CommercialRow {
  commercialId: string | null;
  nom: string;
  actif: boolean;
  ventes: number;
  chiffreAffaires: number;
  encaisse: number;
  resteDu: number;
  panierMoyen: number | null;
}

/**
 * Tableau de bord des commerciaux sur [from, to] (jours entiers, comme les
 * autres rapports).
 *
 * - Ventes, chiffre d'affaires, reste dû : commandes non annulées créées sur
 *   la période. Le reste dû est ce qu'elles doivent encore aujourd'hui.
 * - Encaissé : paiements valides reçus sur la période, rattachés au commercial
 *   de leur commande — même définition que l'encaissé du rapport général
 *   (somme des paiements valides reçus ce jour-là), donc la colonne totale lui
 *   est égale. Un remboursement de dette sans commande va sous « Non attribué ».
 * Une vente annulée sort des totaux : ses paiements sont annulés avec elle.
 */
export function getCommerciauxReport(businessId: string, from: Date, to: Date) {
  return runInTenantTransaction(businessId, async (tx) => {
    const debut = startOfDay(from);
    const fin = nextDay(to);
    const [commerciaux, orders, payments] = await Promise.all([
      tx.commercial.findMany({ where: { businessId } }),
      tx.order.findMany({
        where: { businessId, statut: { not: 'ANNULEE' }, createdAt: { gte: debut, lt: fin } },
        select: { commercialId: true, total: true, payments: { where: { statut: 'VALIDE' }, select: { montant: true } } },
      }),
      tx.payment.findMany({
        where: { businessId, statut: 'VALIDE', createdAt: { gte: debut, lt: fin } },
        select: { montant: true, order: { select: { commercialId: true } } },
      }),
    ]);

    const rows = new Map<string, CommercialRow>();
    const rowOf = (commercialId: string | null): CommercialRow => {
      const key = commercialId ?? NON_ATTRIBUE;
      let row = rows.get(key);
      if (!row) {
        const c = commercialId ? commerciaux.find((x) => x.id === commercialId) : null;
        row = {
          commercialId,
          nom: c?.nom ?? 'Non attribué',
          actif: c?.actif ?? true,
          ventes: 0,
          chiffreAffaires: 0,
          encaisse: 0,
          resteDu: 0,
          panierMoyen: null,
        };
        rows.set(key, row);
      }
      return row;
    };

    for (const c of commerciaux) if (c.actif) rowOf(c.id);
    rowOf(null);
    for (const o of orders) {
      const row = rowOf(o.commercialId);
      const paye = o.payments.reduce((acc, p) => acc + p.montant, 0);
      row.ventes += 1;
      row.chiffreAffaires += o.total;
      row.resteDu += Math.max(0, o.total - paye);
    }
    for (const p of payments) rowOf(p.order?.commercialId ?? null).encaisse += p.montant;

    const all = [...rows.values()].map((r) => ({
      ...r,
      panierMoyen: r.ventes > 0 ? Math.round(r.chiffreAffaires / r.ventes) : null,
    }));
    // Trié par encaissé décroissant : celui qui ramène l'argent passe devant
    // celui qui vend à crédit. « Non attribué » toujours en dernier.
    const commerciauxRows = all
      .filter((r) => r.commercialId !== null)
      .sort((a, b) => b.encaisse - a.encaisse || b.chiffreAffaires - a.chiffreAffaires || a.nom.localeCompare(b.nom));
    const nonAttribue = all.find((r) => r.commercialId === null)!;

    const total = all.reduce(
      (acc, r) => ({
        ventes: acc.ventes + r.ventes,
        chiffreAffaires: acc.chiffreAffaires + r.chiffreAffaires,
        encaisse: acc.encaisse + r.encaisse,
        resteDu: acc.resteDu + r.resteDu,
      }),
      { ventes: 0, chiffreAffaires: 0, encaisse: 0, resteDu: 0 }
    );

    return { rows: [...commerciauxRows, nonAttribue], total };
  });
}

/**
 * Ventes d'un commercial sur la période (« Non attribué » : commercialId
 * null). Les ventes annulées restent visibles, marquées comme telles ;
 * `encaisse` est l'argent reçu sur cette vente pendant la période.
 */
export function getCommercialSales(businessId: string, commercialId: string | null, from: Date, to: Date) {
  return runInTenantTransaction(businessId, async (tx) => {
    const debut = startOfDay(from);
    const fin = nextDay(to);
    const orders = await tx.order.findMany({
      where: {
        businessId,
        commercialId,
        OR: [
          { createdAt: { gte: debut, lt: fin } },
          { payments: { some: { statut: 'VALIDE', createdAt: { gte: debut, lt: fin } } } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        id: true,
        numero: true,
        createdAt: true,
        total: true,
        statut: true,
        customer: { select: { nom: true } },
        payments: { where: { statut: 'VALIDE' }, select: { montant: true, createdAt: true } },
      },
    });
    return orders.map((o) => ({
      orderId: o.id,
      numero: o.numero,
      date: o.createdAt,
      client: o.customer.nom,
      montant: o.total,
      encaisse: o.payments
        .filter((p) => p.createdAt >= debut && p.createdAt < fin)
        .reduce((acc, p) => acc + p.montant, 0),
      annulee: o.statut === 'ANNULEE',
    }));
  });
}
