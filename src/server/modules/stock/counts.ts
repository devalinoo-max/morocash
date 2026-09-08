import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const stockCountLineSchema = z.object({
  productId: z.string().cuid(),
  stockCompte: z.number().int(),
});

export const stockCountSchema = z.object({
  clientUuid: z.string().uuid(),
  perimetre: z.string().trim().max(100).default('TOUT'),
  commentaire: z.string().trim().max(1000).optional(),
  lignes: z.array(stockCountLineSchema).min(1),
});

export type StockCountInput = z.infer<typeof stockCountSchema>;

/**
 * Un comptage compare le stock physique (compté) au stock système. Chaque écart
 * crée un StockMovement de type INVENTAIRE, signé (positif si le compté dépasse
 * le système, négatif sinon) avec stockAvant/stockApres — jamais de suppression,
 * uniquement des mouvements tracés (spec §0 règle 4, §7.3).
 */
export async function createStockCount(
  businessId: string,
  userId: string,
  input: StockCountInput
) {
  return runInTenantTransaction(businessId, async (tx) => {
    const existing = await tx.stockCount.findUnique({ where: { clientUuid: input.clientUuid } });
    if (existing) {
      return { status: 'DUPLICATE' as const, count: existing };
    }

    const count = await tx.stockCount.create({
      data: {
        businessId,
        clientUuid: input.clientUuid,
        perimetre: input.perimetre,
        commentaire: input.commentaire,
        nbProduits: input.lignes.length,
        nbEcarts: 0,
        ecartUnites: 0,
        ecartValeur: 0,
        userId,
      },
    });

    let nbEcarts = 0;
    let ecartUnites = 0;
    let ecartValeur = 0;

    for (const ligne of input.lignes) {
      const product = await tx.product.findFirst({ where: { id: ligne.productId, businessId } });
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Produit introuvable: ${ligne.productId}`);
      }

      const ecart = ligne.stockCompte - product.stock;
      if (ecart === 0) continue;

      nbEcarts += 1;
      ecartUnites += Math.abs(ecart);
      ecartValeur += Math.abs(ecart) * product.cmp;

      const stockAvant = product.stock;
      const stockApres = ligne.stockCompte;

      await tx.product.update({ where: { id: product.id }, data: { stock: stockApres } });

      await tx.stockMovement.create({
        data: {
          businessId,
          productId: product.id,
          clientUuid: `${input.clientUuid}:${product.id}`,
          type: 'INVENTAIRE',
          quantite: ecart,
          stockAvant,
          stockApres,
          coutUnitaire: product.cmp,
          countId: count.id,
          userId,
        },
      });
    }

    const updated = await tx.stockCount.update({
      where: { id: count.id },
      data: { nbEcarts, ecartUnites, ecartValeur },
    });

    return { status: 'CREATED' as const, count: updated };
  });
}

export async function listCounts(businessId: string) {
  return runInTenantTransaction(businessId, (tx) =>
    tx.stockCount.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' } })
  );
}
