import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

/**
 * Toute variation de stock crée un StockMovement avec stockAvant/stockApres (spec §7.3).
 * Le CMP n'est recalculé que sur ENTREE :
 *   nouveauCmp = round((stock*cmp + qteEntree*prixAchat) / (stock + qteEntree))
 * Le stock peut devenir négatif — jamais de garde-fou contre ça.
 *
 * Dans chaque transaction : le contexte tenant (`setTenantContext`, posé par
 * `runInTenantTransaction`) doit être actif AVANT toute lecture, y compris la
 * vérification d'idempotence par clientUuid — sinon la RLS masquerait aussi les
 * vrais doublons de la boutique courante, pas seulement les données d'autrui.
 */

export const receptionLineSchema = z.object({
  productId: z.string().cuid(),
  quantite: z.number().int().positive(),
  prixAchatUnitaire: z.number().int().nonnegative(),
});

export const receptionSchema = z.object({
  clientUuid: z.string().uuid(),
  fournisseur: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  justificatifUrl: z.string().url().optional(),
  lignes: z.array(receptionLineSchema).min(1),
});

export type ReceptionInput = z.infer<typeof receptionSchema>;

export const adjustmentSchema = z.object({
  clientUuid: z.string().uuid(),
  productId: z.string().cuid(),
  type: z.enum(['CASSE', 'PERTE']),
  quantite: z.number().int().positive(),
  motif: z.string().trim().min(1, 'Un motif est obligatoire pour un ajustement manuel.'),
  note: z.string().trim().max(1000).optional(),
  justificatifUrl: z.string().url().optional(),
});

export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export async function createReception(
  businessId: string,
  userId: string,
  input: ReceptionInput
) {
  return runInTenantTransaction(businessId, async (tx) => {
    const existing = await tx.stockReception.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, reception: existing };
    }

    let totalArticles = 0;
    let totalMontant = 0;

    const reception = await tx.stockReception.create({
      data: {
        businessId,
        clientUuid: input.clientUuid,
        fournisseur: input.fournisseur,
        note: input.note,
        justificatifUrl: input.justificatifUrl,
        totalArticles: 0,
        totalMontant: 0,
        userId,
      },
    });

    // Deux lignes du même produit sont fusionnées, au prix d'achat moyen des
    // deux. Le mouvement de stock porte un clientUuid dérivé du produit : deux
    // lignes du même produit violaient sa contrainte d'unicité et faisaient
    // échouer TOUTE la réception, la transaction étant annulée. Or saisir deux
    // fois le même article dans un bon de livraison est courant.
    const lignesFusionnees = [...
      input.lignes
        .reduce((acc, ligne) => {
          const cumul = acc.get(ligne.productId) ?? { quantite: 0, montant: 0 };
          acc.set(ligne.productId, {
            quantite: cumul.quantite + ligne.quantite,
            montant: cumul.montant + ligne.quantite * ligne.prixAchatUnitaire,
          });
          return acc;
        }, new Map<string, { quantite: number; montant: number }>())
    ].map(([productId, { quantite, montant }]) => ({
      productId,
      quantite,
      prixAchatUnitaire: Math.round(montant / quantite),
    }));

    for (const ligne of lignesFusionnees) {
      const product = await tx.product.findFirst({ where: { id: ligne.productId, businessId } });
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Produit introuvable: ${ligne.productId}`);
      }

      const stockAvant = product.stock;
      const stockApres = stockAvant + ligne.quantite;
      const nouveauCmp =
        stockApres === 0
          ? product.cmp
          : Math.round(
              (stockAvant * product.cmp + ligne.quantite * ligne.prixAchatUnitaire) / stockApres
            );

      await tx.product.update({
        where: { id: product.id },
        data: { stock: stockApres, cmp: nouveauCmp, prixAchat: ligne.prixAchatUnitaire },
      });

      await tx.stockMovement.create({
        data: {
          businessId,
          productId: product.id,
          clientUuid: `${input.clientUuid}:${product.id}`,
          type: 'ENTREE',
          quantite: ligne.quantite,
          stockAvant,
          stockApres,
          prixAchatUnitaire: ligne.prixAchatUnitaire,
          coutUnitaire: nouveauCmp,
          receptionId: reception.id,
          userId,
        },
      });

      totalArticles += ligne.quantite;
      totalMontant += ligne.quantite * ligne.prixAchatUnitaire;
    }

    const updatedReception = await tx.stockReception.update({
      where: { id: reception.id },
      data: { totalArticles, totalMontant },
    });

    return { status: 'CREATED' as const, reception: updatedReception };
  });
}

export async function createAdjustment(
  businessId: string,
  userId: string,
  input: AdjustmentInput
) {
  return runInTenantTransaction(businessId, async (tx) => {
    const existing = await tx.stockMovement.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, movement: existing };
    }

    const product = await tx.product.findFirst({ where: { id: input.productId, businessId } });
    if (!product) {
      throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
    }

    const stockAvant = product.stock;
    const stockApres = stockAvant - input.quantite;

    await tx.product.update({ where: { id: product.id }, data: { stock: stockApres } });

    const movement = await tx.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        clientUuid: input.clientUuid,
        type: input.type,
        quantite: -input.quantite,
        stockAvant,
        stockApres,
        coutUnitaire: product.cmp,
        motif: input.motif,
        note: input.note,
        justificatifUrl: input.justificatifUrl,
        userId,
      },
    });

    return { status: 'CREATED' as const, movement };
  });
}

/**
 * Annule un mouvement : crée un mouvement inverse, ne supprime jamais l'original
 * (spec §0 règle 4). Le mouvement d'origine est marqué `annule`.
 */
export async function cancelMovement(businessId: string, userId: string, movementId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const original = await tx.stockMovement.findFirst({ where: { id: movementId, businessId } });
    if (!original) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Mouvement introuvable.');
    }
    if (original.annule) {
      throw new AppError('ORDER_ALREADY_CANCELLED', 'Ce mouvement est déjà annulé.');
    }
    // Un mouvement né d'une vente n'a pas d'existence propre : le rendre au
    // stock ici laissait la commande intacte (articles toujours vendus,
    // paiement toujours encaissé) avec un stock déjà rendu — puis annuler la
    // commande le rendait une seconde fois. On renvoie donc vers l'annulation
    // de commande, qui défait l'ensemble de façon cohérente (spec §7.2).
    if (original.orderId) {
      throw new AppError(
        'ORDER_IMMUTABLE',
        "Ce mouvement vient d'une vente : annule la commande, pas le mouvement."
      );
    }

    const product = await tx.product.findFirst({ where: { id: original.productId, businessId } });
    if (!product) {
      throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
    }

    const stockAvant = product.stock;
    const stockApres = stockAvant - original.quantite; // inverse le signe d'origine
    await tx.product.update({ where: { id: product.id }, data: { stock: stockApres } });

    const inverse = await tx.stockMovement.create({
      data: {
        businessId,
        productId: product.id,
        clientUuid: `cancel:${original.clientUuid}`,
        type: 'INVENTAIRE',
        quantite: -original.quantite,
        stockAvant,
        stockApres,
        coutUnitaire: product.cmp,
        motif: `Annulation du mouvement ${original.id}`,
        mouvementInverseId: original.id,
        userId,
      },
    });

    await tx.stockMovement.update({
      where: { id: original.id },
      data: { annule: true, mouvementInverseId: inverse.id },
    });

    return inverse;
  });
}

export async function listReceptions(businessId: string) {
  return runInTenantTransaction(businessId, (tx) =>
    tx.stockReception.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } })
  );
}

export async function listMovements(businessId: string, filters: { productId?: string } = {}) {
  return runInTenantTransaction(businessId, (tx) =>
    tx.stockMovement.findMany({
      where: { businessId, ...(filters.productId ? { productId: filters.productId } : {}) },
      orderBy: { createdAt: 'desc' },
    })
  );
}
