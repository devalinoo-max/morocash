import { z } from 'zod';
import { runInTenantTransaction } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const stockCountLineSchema = z.object({
  productId: z.string().cuid(),
  stockCompte: z.number().int(),
  /** Pourquoi cet écart, écrit pendant le comptage. Vide quand tout concorde. */
  motif: z.string().trim().max(300).optional(),
});

export const stockCountSchema = z.object({
  clientUuid: z.string().uuid(),
  perimetre: z.string().trim().max(100).default('TOUT'),
  commentaire: z.string().trim().max(1000).optional(),
  /** Jour du comptage physique. Absent, c'est l'instant de la saisie. */
  dateOperation: z.coerce.date().optional(),
  lignes: z.array(stockCountLineSchema).min(1),
});

export type StockCountInput = z.infer<typeof stockCountSchema>;

/**
 * Un comptage compare le stock physique (compté) au stock système. Chaque écart
 * crée un StockMovement de type INVENTAIRE, signé (positif si le compté dépasse
 * le système, négatif sinon) avec stockAvant/stockApres — jamais de suppression,
 * uniquement des mouvements tracés (spec §0 règle 4, §7.3).
 *
 * `lignes` ne contient que les articles RÉELLEMENT comptés. Un article qu'on
 * n'a pas vu n'y figure pas : son stock n'est pas touché et l'inventaire ne
 * prétend rien à son sujet. Avant, le frontend envoyait tout le périmètre en
 * repliant les articles non saisis sur leur stock théorique — un inventaire de
 * 40 articles sur 300 affirmait donc que les 300 avaient été vérifiés.
 *
 * Chaque ligne comptée est conservée (StockCountLine), écart ou non : c'est la
 * seule preuve qu'un article a été vérifié, puisqu'un article conforme ne
 * produit aucun mouvement.
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

    // Le comptage et les écarts qu'il produit portent la même date : un
    // inventaire fait dimanche et saisi lundi se range au dimanche, sinon ses
    // écarts flotteraient un jour plus loin que le comptage qui les constate.
    const dateOperation = input.dateOperation ?? new Date();

    const count = await tx.stockCount.create({
      data: {
        businessId,
        clientUuid: input.clientUuid,
        perimetre: input.perimetre,
        commentaire: input.commentaire,
        dateOperation,
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
    let ecartValeurNette = 0;
    let valeurStockComptee = 0;

    // Deux lignes du même article dans un même envoi violeraient la contrainte
    // d'unicité (countId, productId) et feraient échouer tout l'inventaire. La
    // dernière saisie gagne : c'est le dernier passage devant le rayon.
    const lignesUniques = [...new Map(input.lignes.map((l) => [l.productId, l])).values()];

    for (const ligne of lignesUniques) {
      const product = await tx.product.findFirst({ where: { id: ligne.productId, businessId } });
      if (!product) {
        throw new AppError('PRODUCT_NOT_FOUND', `Produit introuvable: ${ligne.productId}`);
      }

      const stockAvant = product.stock;
      const ecart = ligne.stockCompte - stockAvant;

      // Valeur du stock constatée de ses yeux, au coût moyen du moment :
      // c'est le chiffre qu'un inventaire est censé arrêter.
      valeurStockComptee += ligne.stockCompte * product.cmp;

      // La ligne est écrite même sans écart : « vérifié et conforme » est un
      // résultat d'inventaire, pas une absence de résultat.
      await tx.stockCountLine.create({
        data: {
          businessId,
          countId: count.id,
          productId: product.id,
          stockTheorique: stockAvant,
          stockCompte: ligne.stockCompte,
          ecart,
          coutUnitaire: product.cmp,
          valeurEcart: ecart * product.cmp,
          motif: ligne.motif,
        },
      });

      if (ecart === 0) continue;

      nbEcarts += 1;
      ecartUnites += Math.abs(ecart);
      ecartValeur += Math.abs(ecart) * product.cmp;
      ecartValeurNette += ecart * product.cmp;

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
          motif: ligne.motif,
          countId: count.id,
          dateOperation,
          userId,
        },
      });
    }

    const updated = await tx.stockCount.update({
      where: { id: count.id },
      data: {
        nbProduits: lignesUniques.length,
        nbEcarts,
        ecartUnites,
        ecartValeur,
        ecartValeurNette,
        valeurStockComptee,
      },
    });

    return { status: 'CREATED' as const, count: updated };
  });
}

/**
 * Le détail d'un inventaire, pour le relire ou l'exporter. Le nom du produit
 * accompagne chaque ligne : une feuille d'inventaire pleine d'identifiants ne
 * sert à personne, et le produit peut avoir été renommé depuis.
 */
export async function getStockCountDetail(businessId: string, countId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const count = await tx.stockCount.findFirst({ where: { id: countId, businessId } });
    if (!count) {
      throw new AppError('RESOURCE_NOT_OWNED', 'Inventaire introuvable.');
    }

    const lines = await tx.stockCountLine.findMany({
      where: { countId: count.id, businessId },
      include: { product: { select: { nom: true, unite: true } } },
    });

    return {
      count,
      lines: lines.map((l) => ({
        productId: l.productId,
        productName: l.product.nom,
        unite: l.product.unite,
        stockTheorique: l.stockTheorique,
        stockCompte: l.stockCompte,
        ecart: l.ecart,
        coutUnitaire: l.coutUnitaire,
        valeurEcart: l.valeurEcart,
        motif: l.motif,
      })),
    };
  });
}

export async function listCounts(businessId: string) {
  return runInTenantTransaction(businessId, (tx) =>
    tx.stockCount.findMany({
      where: { businessId },
      orderBy: [{ dateOperation: 'desc' }, { createdAt: 'desc' }],
    })
  );
}
