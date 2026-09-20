import type { UserRole } from '@prisma/client';
import { AppError } from '@/server/shared/errors';

/**
 * Droits accordés employé par employé, cochés à l'ajout de la personne.
 *
 * Le rôle dit ce que quelqu'un FAIT (vendeur, gestionnaire) ; la permission dit
 * ce que le propriétaire l'autorise à VOIR ou à défaire. Les deux se cumulent :
 * une route vérifie d'abord le rôle, ensuite la permission.
 *
 * Le propriétaire n'est jamais concerné — il a tout, sa liste reste vide.
 */
export const EMPLOYEE_PERMISSIONS = [
  'VOIR_MARGES',
  'VOIR_DEPENSES',
  'GERER_STOCK',
  'ANNULER_COMMANDE',
  'EXPORTER_DONNEES',
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number];

/** Libellés affichés côté serveur (messages d'erreur) — l'UI a les siens. */
const LABELS: Record<EmployeePermission, string> = {
  VOIR_MARGES: 'voir les marges et bénéfices',
  VOIR_DEPENSES: 'voir les dépenses',
  GERER_STOCK: 'gérer le stock',
  ANNULER_COMMANDE: 'annuler une commande',
  EXPORTER_DONNEES: 'exporter les données',
};

export interface PermissionHolder {
  role: UserRole;
  permissions: string[];
}

/** Le propriétaire a tous les droits ; un employé n'a que ce qui est coché. */
export function hasPermission(holder: PermissionHolder, permission: EmployeePermission): boolean {
  if (holder.role === 'OWNER') return true;
  return holder.permissions.includes(permission);
}

/**
 * Bloque une route quand la permission manque. FORBIDDEN_ROLE est le code de la
 * liste fixe (spec §8) le plus proche : l'action existe, c'est cette personne
 * qui n'y a pas droit.
 */
export function requirePermission(holder: PermissionHolder, permission: EmployeePermission): void {
  if (!hasPermission(holder, permission)) {
    throw new AppError(
      'FORBIDDEN_ROLE',
      `Ton compte n'a pas l'autorisation « ${LABELS[permission]} ». Demande-la au propriétaire de la boutique.`
    );
  }
}

/**
 * Rôle à passer aux sérialiseurs pour décider si prix d'achat, coût moyen et
 * marge partent dans la réponse. Sans la permission VOIR_MARGES, un employé est
 * servi comme un vendeur : les chiffres sensibles ne quittent pas le serveur
 * (spec §0 règle 7), quel que soit son rôle.
 */
export function marginViewRole(holder: PermissionHolder): UserRole {
  return hasPermission(holder, 'VOIR_MARGES') ? holder.role : 'SELLER';
}
