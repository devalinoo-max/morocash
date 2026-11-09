import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { scoped } from '@/server/repositories/base';
import { checkQuota } from '@/server/guards';
import { AppError } from '@/server/shared/errors';
import { hashPin } from '@/server/modules/auth/pin';
import {
  EMPLOYEE_PERMISSIONS,
  defaultPermissionsForRole,
  type EmployeePermission,
} from './permissions';
import { runInTenantTransaction } from '@/server/repositories/base';
import { syncEmployeeCommercial } from '@/server/modules/commerciaux/service';

export const createEmployeeSchema = z.object({
  nom: z.string().trim().min(2).max(120),
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  pin: z.string().regex(/^\d{6}$/, 'Le mot de passe doit comporter exactement 6 chiffres'),
  role: z.enum(['SELLER', 'ACCOUNTANT']),
  /**
   * Les droits de cette personne. Liste absente = les cases cochées d'office
   * pour son rôle (voir defaultPermissionsForRole) ; une liste explicite, même
   * vide, est prise telle quelle, puisque le propriétaire a pu tout décocher.
   */
  permissions: z.array(z.enum(EMPLOYEE_PERMISSIONS)).optional(),
  // Case « Commercial » : ses ventes lui sont attribuées (suivi par commercial).
  estCommercial: z.boolean().default(false),
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
    const user = await repo.users.create({
      nom: input.nom,
      telephone: input.telephone,
      codeHash,
      role: input.role,
      // Le rôle choisi coche ses cases tout seul ; le propriétaire les ajuste
      // ensuite une par une depuis la fiche de l'employé.
      permissions: input.permissions ?? defaultPermissionsForRole(input.role),
      estCommercial: input.estCommercial,
    });
    if (user.estCommercial) {
      await runInTenantTransaction(businessId, (tx) => syncEmployeeCommercial(tx, businessId, user, true));
    }
    return user;
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
 * Désactivation, changement de rôle et cases à cocher — jamais de suppression
 * réelle (spec §0 règle 4, même politique que Product : l'historique des
 * ventes et des mouvements attaché à l'utilisateur ne doit pas se retrouver
 * orphelin). Un employé désactivé garde donc ses ventes passées dans tous les
 * totaux ; il ne peut simplement plus se connecter.
 *
 * Le propriétaire est intouchable : il ne peut ni être désactivé, ni changer de
 * rôle. Sinon une boutique peut se retrouver sans personne pour gérer les
 * employés ou l'abonnement, sans aucun moyen de revenir en arrière.
 */
export async function setEmployeeActive(
  businessId: string,
  id: string,
  input: {
    actif?: boolean;
    estCommercial?: boolean;
    role?: 'SELLER' | 'ACCOUNTANT';
    permissions?: EmployeePermission[];
  }
) {
  const repo = scoped(businessId);
  const existing = await repo.users.findById(id);
  if (!existing) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Employé introuvable.');
  }
  if (existing.role === 'OWNER') {
    if (input.actif === false) {
      throw new AppError('FORBIDDEN_ROLE', 'Le propriétaire ne peut pas être désactivé.');
    }
    if (input.role !== undefined) {
      throw new AppError('FORBIDDEN_ROLE', 'Le propriétaire ne peut pas changer son propre rôle.');
    }
    if (input.permissions !== undefined) {
      throw new AppError(
        'FORBIDDEN_ROLE',
        'Le propriétaire a tous les droits : ses permissions ne se modifient pas.'
      );
    }
  }
  // Changer le rôle sans préciser les cases recoche celles du nouveau rôle :
  // passer quelqu'un de vendeur à gestionnaire sans lui donner les droits qui
  // vont avec laisserait un gestionnaire qui ne peut rien faire.
  const permissions =
    input.permissions ?? (input.role !== undefined ? defaultPermissionsForRole(input.role) : undefined);

  await repo.users.update(id, {
    ...(input.actif !== undefined ? { actif: input.actif } : {}),
    ...(input.estCommercial !== undefined ? { estCommercial: input.estCommercial } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(permissions !== undefined ? { permissions } : {}),
  });
  const updated = await repo.users.findById(id);
  if (!updated) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Employé introuvable.');
  }
  // Fiche commercial : active seulement si l'employé est actif ET commercial.
  // Décocher ou désactiver la passe inactive, sans toucher à ses ventes.
  if (updated.estCommercial || existing.estCommercial) {
    await runInTenantTransaction(businessId, (tx) =>
      syncEmployeeCommercial(tx, businessId, updated, updated.actif && updated.estCommercial)
    );
  }
  // `avant` part avec la réponse pour le journal des actions sensibles : un
  // changement de droits doit garder la trace de ce qu'ils étaient.
  return { user: updated, avant: existing };
}

export const resetEmployeeCodeSchema = z.object({
  pin: z.string().regex(/^\d{6}$/, 'Le mot de passe doit comporter exactement 6 chiffres'),
});

/**
 * Redonne un code à un employé qui a oublié le sien.
 *
 * Le propriétaire le fait depuis la fiche de la personne, sans passer par un
 * SMS : dans une boutique, l'employé est devant lui. Son propre code ne se
 * réinitialise pas ici — il a « Mon compte » et la procédure par téléphone,
 * qui vérifie son identité au lieu de la supposer.
 */
export async function resetEmployeeCode(businessId: string, id: string, pin: string) {
  const repo = scoped(businessId);
  const existing = await repo.users.findById(id);
  if (!existing) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Employé introuvable.');
  }
  if (existing.role === 'OWNER') {
    throw new AppError(
      'FORBIDDEN_ROLE',
      'Le code du propriétaire se change depuis « Mon compte », pas depuis la liste des employés.'
    );
  }
  await repo.users.update(id, { codeHash: await hashPin(pin) });
  const updated = await repo.users.findById(id);
  if (!updated) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Employé introuvable.');
  }
  return updated;
}
