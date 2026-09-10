import { z } from 'zod';
import { scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const createCategorySchema = z.object({
  nom: z.string().trim().min(1).max(200),
  type: z.enum(['PRODUIT', 'DEPENSE']),
});

export const renameCategorySchema = z.object({
  nom: z.string().trim().min(1).max(200),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

/**
 * Deux catégories ne peuvent pas porter « le même nom » du point de vue du
 * commerçant : « Boissons », « boisson » et « BOISSONS » n'en font qu'une.
 * On compare donc sur une forme normalisée — minuscules, sans accents, sans
 * espaces superflus — et non sur la chaîne brute (la contrainte d'unicité en
 * base, elle, est exacte : elle ne suffit pas).
 */
export function normalizeCategoryName(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function assertNameAvailable(
  businessId: string,
  nom: string,
  type: 'PRODUIT' | 'DEPENSE',
  exceptId?: string
) {
  const repo = scoped(businessId);
  const siblings = await repo.categories.findMany({ where: { type } });
  const normalized = normalizeCategoryName(nom);
  const clash = siblings.find(
    (c) => c.id !== exceptId && normalizeCategoryName(c.nom) === normalized
  );
  if (clash) {
    throw new AppError('VALIDATION_ERROR', `« ${clash.nom} » existe déjà.`);
  }
}

export async function createCategory(businessId: string, input: CreateCategoryInput) {
  await assertNameAvailable(businessId, input.nom, input.type);
  return scoped(businessId).categories.create(input);
}

/**
 * La liste porte le nombre d'éléments qui s'appuient sur chaque catégorie :
 * c'est ce qui permet à l'écran de gestion d'expliquer un refus de suppression
 * (« Utilisée par 14 produits ») au lieu d'un message générique.
 */
export async function listCategories(businessId: string, opts: { type?: 'PRODUIT' | 'DEPENSE' } = {}) {
  const repo = scoped(businessId);
  const [categories, counts] = await Promise.all([
    repo.categories.findMany({
      where: opts.type ? { type: opts.type } : undefined,
      orderBy: { nom: 'asc' },
    }),
    repo.categories.usageCounts(),
  ]);

  return categories.map((category) => ({
    ...category,
    usageCount: counts.get(category.id) ?? 0,
  }));
}

async function requireCategory(businessId: string, id: string) {
  const category = await scoped(businessId).categories.findById(id);
  if (!category) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Catégorie introuvable.');
  }
  return category;
}

/**
 * Renommer ne casse rien : les produits pointent sur l'identifiant, jamais sur
 * le nom. Ils suivent donc automatiquement.
 */
export async function renameCategory(businessId: string, id: string, nom: string) {
  const category = await requireCategory(businessId, id);
  await assertNameAvailable(businessId, nom, category.type, id);
  await scoped(businessId).categories.update(id, { nom });
  return { ...category, nom };
}

/**
 * Supprimer une catégorie encore utilisée est refusé, avec le motif écrit :
 * l'appelant reçoit le nombre exact d'éléments concernés pour pouvoir proposer
 * « Déplace-les d'abord ». Les catégories système (Achat marchandise) portent
 * un cadenas et ne se suppriment jamais.
 */
export async function deleteCategory(businessId: string, id: string) {
  const category = await requireCategory(businessId, id);

  if (category.systeme) {
    throw new AppError(
      'VALIDATION_ERROR',
      `« ${category.nom} » est une catégorie de MoroCash : elle ne peut pas être supprimée.`
    );
  }

  const counts = await scoped(businessId).categories.usageCounts();
  const usageCount = counts.get(id) ?? 0;
  if (usageCount > 0) {
    const noun = category.type === 'PRODUIT' ? 'produit' : 'dépense';
    throw new AppError(
      'CATEGORY_IN_USE',
      `Utilisée par ${usageCount} ${noun}${usageCount > 1 ? 's' : ''}. Déplace-les d'abord ou renomme-la.`,
      { usageCount, categoryId: id, type: category.type }
    );
  }

  await scoped(businessId).categories.delete(id);
  return { deleted: true as const };
}

/**
 * « Déplace ces 14 produits vers… » : la cible peut être une autre catégorie
 * ou aucune (le produit devient « Sans catégorie », ce qui reste vendable).
 */
export async function moveCategoryProducts(
  businessId: string,
  fromId: string,
  toId: string | null
) {
  const from = await requireCategory(businessId, fromId);
  if (from.type !== 'PRODUIT') {
    throw new AppError('VALIDATION_ERROR', 'Seules les catégories de produits se déplacent.');
  }
  if (toId) {
    const to = await requireCategory(businessId, toId);
    if (to.type !== 'PRODUIT') {
      throw new AppError('VALIDATION_ERROR', 'La catégorie de destination doit être une catégorie de produits.');
    }
  }
  const moved = await scoped(businessId).categories.moveProducts(fromId, toId);
  return { moved };
}
