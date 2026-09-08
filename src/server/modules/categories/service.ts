import { z } from 'zod';
import { scoped } from '@/server/repositories/base';
import { AppError } from '@/server/shared/errors';

export const createCategorySchema = z.object({
  nom: z.string().trim().min(1).max(200),
  type: z.enum(['PRODUIT', 'DEPENSE']),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export async function createCategory(businessId: string, input: CreateCategoryInput) {
  const repo = scoped(businessId);
  const existing = await repo.categories.findMany({ where: { nom: input.nom, type: input.type } });
  if (existing.length > 0) {
    throw new AppError('VALIDATION_ERROR', 'Cette catégorie existe déjà.');
  }
  return repo.categories.create(input);
}

export async function listCategories(businessId: string, opts: { type?: 'PRODUIT' | 'DEPENSE' } = {}) {
  const repo = scoped(businessId);
  return repo.categories.findMany({
    where: opts.type ? { type: opts.type } : undefined,
    orderBy: { nom: 'asc' },
  });
}
