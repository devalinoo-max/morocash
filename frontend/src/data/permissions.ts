/**
 * src/data/permissions.ts
 * Droits accordés employé par employé, cochés à l'ajout de la personne.
 *
 * Doit rester aligné avec src/server/modules/users/permissions.ts côté backend :
 * c'est lui qui refuse réellement l'accès, cette liste ne sert qu'à afficher les
 * cases et leurs libellés.
 */

export const EMPLOYEE_PERMISSIONS = [
  'VOIR_MARGES',
  'VOIR_DEPENSES',
  'GERER_STOCK',
  'ANNULER_COMMANDE',
  'EXPORTER_DONNEES',
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number];

export interface PermissionOption {
  code: EmployeePermission;
  label: string;
  aide: string;
}

/** Ordre d'affichage des cases à cocher, du plus sensible au plus courant. */
export const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    code: 'VOIR_MARGES',
    label: 'Voir les marges et bénéfices',
    aide: 'Prix d’achat, coût moyen et « ce que tu as gagné »',
  },
  {
    code: 'VOIR_DEPENSES',
    label: 'Voir les dépenses',
    aide: 'Charges, factures et sorties de caisse',
  },
  {
    code: 'GERER_STOCK',
    label: 'Gérer le stock',
    aide: 'Réceptions, ajustements et comptages',
  },
  {
    code: 'ANNULER_COMMANDE',
    label: 'Annuler une commande',
    aide: 'Défaire une vente déjà enregistrée',
  },
  {
    code: 'EXPORTER_DONNEES',
    label: 'Exporter les données',
    aide: 'Fichiers Excel et PDF de la boutique',
  },
];

/**
 * Le propriétaire a tous les droits sans qu'aucun soit coché ; un employé n'a
 * que ce que le propriétaire lui a accordé.
 */
export function hasPermission(
  user: { role: string; permissions?: string[] } | null | undefined,
  permission: EmployeePermission
): boolean {
  if (!user) return false;
  if (user.role === 'OWNER') return true;
  return (user.permissions ?? []).includes(permission);
}
