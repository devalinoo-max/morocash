import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { scoped } from '@/server/repositories/base';
import { checkQuota } from '@/server/guards';
import { AppError } from '@/server/shared/errors';
import { generateInternalCode } from '@/server/integrations/qr';

export const createProductSchema = z.object({
  nom: z.string().trim().min(1).max(200),
  type: z.enum(['PRODUIT', 'SERVICE']).default('PRODUIT'),
  prixVente: z.number().int().nonnegative(),
  prixAchat: z.number().int().nonnegative().default(0),
  stock: z.number().int().default(0),
  seuilAlerte: z.number().int().nonnegative().default(0),
  unite: z.string().trim().min(1).max(30).default('pièce'),
  categoryId: z.string().cuid().optional(),
});

export const updateProductSchema = createProductSchema.partial().extend({
  actif: z.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/**
 * Crée un produit et lui attache automatiquement un code QR généré (spec §13,
 * critère de sortie étape 3 : "un produit créé a son QR").
 */
export async function createProduct(businessId: string, input: CreateProductInput) {
  await checkQuota(businessId, 'products');

  const repo = scoped(businessId);
  const product = await repo.products.create(input);

  const code = generateInternalCode();
  await repo.productCodes.create({
    productId: product.id,
    code,
    format: 'QR',
    origine: 'GENERE',
    estPrincipal: true,
  });

  return product;
}

/**
 * Les photos (ProductImage) font partie du produit pour le frontend : sans ce
 * `include`, un produit rechargé revenait sans image et la photo enregistrée
 * disparaissait de l'écran Produits.
 */
export const withImages = {
  images: { orderBy: { ordre: 'asc' } },
} satisfies Prisma.ProductInclude;

export async function listProducts(businessId: string, opts: { actif?: boolean } = {}) {
  const repo = scoped(businessId);
  return repo.products.findMany({
    where: opts.actif === undefined ? undefined : { actif: opts.actif },
    orderBy: { createdAt: 'desc' },
    include: withImages,
  });
}

export async function getProduct(businessId: string, id: string) {
  const repo = scoped(businessId);
  const product = await repo.products.findById(id, { include: withImages });
  if (!product) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }
  return product;
}

export async function updateProduct(businessId: string, id: string, input: UpdateProductInput) {
  const repo = scoped(businessId);
  const existing = await repo.products.findById(id);
  if (!existing) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }
  await repo.products.update(id, input);
  return repo.products.findById(id, { include: withImages });
}

/**
 * Suppression réelle uniquement si le produit n'a aucun historique (commandes,
 * mouvements de stock) — sinon PRODUCT_HAS_HISTORY : un produit qui a déjà servi
 * n'est jamais supprimé, seulement désactivé via PATCH (spec §0 règle 4).
 */
export async function deleteProduct(businessId: string, id: string) {
  const repo = scoped(businessId);
  const existing = await repo.products.findById(id);
  if (!existing) {
    throw new AppError('PRODUCT_NOT_FOUND', 'Produit introuvable.');
  }

  const hasHistory = await repo.products.hasHistory(id);
  if (hasHistory) {
    throw new AppError(
      'PRODUCT_HAS_HISTORY',
      'Ce produit a un historique de ventes ou de mouvements — désactivez-le plutôt (PATCH actif=false).'
    );
  }

  await repo.products.delete(id);
}
