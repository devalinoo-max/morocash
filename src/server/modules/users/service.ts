import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { scoped } from '@/server/repositories/base';
import { checkQuota } from '@/server/guards';
import { AppError } from '@/server/shared/errors';
import { hashPin } from '@/server/modules/auth/pin';

export const createEmployeeSchema = z.object({
  nom: z.string().trim().min(2).max(120),
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  pin: z.string().regex(/^\d{6}$/, 'Le code doit comporter exactement 6 chiffres'),
  role: z.enum(['SELLER', 'ACCOUNTANT']),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export async function listEmployees(businessId: string) {
  const repo = scoped(businessId);
  return repo.users.findMany({ orderBy: { createdAt: 'asc' } });
}

export async function createEmployee(businessId: string, input: CreateEmployeeInput) {
  await checkQuota(businessId, 'users');

  const codeHash = await hashPin(input.pin);
  const repo = scoped(businessId);
  try {
    return await repo.users.create({
      nom: input.nom,
      telephone: input.telephone,
      codeHash,
      role: input.role,
    });
  } catch (error) {
    // Contrainte unique [businessId, telephone] — aucun code dédié dans la liste
    // fixe (spec §8) pour "téléphone déjà utilisé dans cette boutique" ;
    // VALIDATION_ERROR est repris comme pour requireExportExcelAllowed (guards).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError('VALIDATION_ERROR', 'Ce numéro de téléphone est déjà utilisé dans votre boutique.');
    }
    throw error;
  }
}

/**
 * Désactivation uniquement — jamais de suppression réelle (spec §0 règle 4,
 * même politique que Product : historique des ventes/mouvements attaché à
 * l'utilisateur ne doit pas se retrouver orphelin).
 */
export async function setEmployeeActive(businessId: string, id: string, actif: boolean) {
  const repo = scoped(businessId);
  const existing = await repo.users.findById(id);
  if (!existing) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Employé introuvable.');
  }
  if (existing.role === 'OWNER') {
    throw new AppError('FORBIDDEN_ROLE', 'Le propriétaire ne peut pas être désactivé.');
  }
  await repo.users.update(id, { actif });
  const updated = await repo.users.findById(id);
  if (!updated) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Employé introuvable.');
  }
  return updated;
}
