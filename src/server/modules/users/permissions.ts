import type { UserRole } from '@prisma/client';
import { AppError } from '@/server/shared/errors';

/**
 * Les droits d'un employé, ligne par ligne.
 *
 * Le rôle dit ce que la personne FAIT (vendeur, gestionnaire) et pose les cases
 * cochées d'office ; la permission dit ce que le propriétaire l'autorise
 * réellement à voir ou à défaire. C'est la permission qui décide, jamais le
 * rôle seul : le propriétaire peut cocher « Voir le bénéfice » pour un vendeur,
 * et ce vendeur doit alors y avoir droit côté serveur aussi.
 *
 * Le propriétaire n'est jamais concerné — il a tout, sa liste reste vide.
 *
 * Les deux droits en gras du cahier des charges sont VOIR_PRIX_ACHAT et
 * VOIR_BENEFICE : un vendeur qui lit le prix d'achat connaît la marge du patron
 * et peut la porter à un concurrent. Ils ne sont donc pas seulement cachés dans
 * l'app, ils sont refusés ici, et les sérialiseurs retirent les montants des
 * réponses (voir marginViewRole).
 */
export const EMPLOYEE_PERMISSIONS = [
  // Le quotidien du comptoir — coché pour les trois rôles.
  'ENREGISTRER_VENTE',
  'ENCAISSER_VERSEMENT',
  'VOIR_SES_VENTES',
  // Ce qui engage la boutique — gestionnaire et propriétaire.
  'FAIRE_REMISE',
  'VENDRE_A_CREDIT',
  'ANNULER_COMMANDE',
  'GERER_PRODUITS',
  'GERER_STOCK',
  'VOIR_DETTES_CLIENTS',
  'VOIR_DEPENSES',
  'VOIR_PRIX_ACHAT',
  'VOIR_BENEFICE',
  'VOIR_VENTES_EQUIPE',
  'VOIR_RAPPORTS',
  'CLOTURE_CAISSE',
  // Le propriétaire seul, par défaut.
  'GERER_EMPLOYES',
  'GERER_ABONNEMENT',
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number];

/** Libellés affichés côté serveur (messages d'erreur) — l'UI a les siens. */
const LABELS: Record<EmployeePermission, string> = {
  ENREGISTRER_VENTE: 'enregistrer une vente',
  ENCAISSER_VERSEMENT: 'encaisser un versement',
  VOIR_SES_VENTES: 'voir ses propres ventes',
  FAIRE_REMISE: 'faire une remise',
  VENDRE_A_CREDIT: 'vendre à crédit',
  ANNULER_COMMANDE: 'annuler une vente',
  GERER_PRODUITS: 'ajouter ou modifier un produit',
  GERER_STOCK: 'ajuster le stock',
  VOIR_DETTES_CLIENTS: 'voir et relancer les dettes clients',
  VOIR_DEPENSES: 'noter une dépense',
  VOIR_PRIX_ACHAT: "voir les prix d'achat",
  VOIR_BENEFICE: 'voir le bénéfice',
  VOIR_VENTES_EQUIPE: 'voir les ventes de tous les employés',
  VOIR_RAPPORTS: 'voir les rapports',
  CLOTURE_CAISSE: 'faire la clôture de caisse',
  GERER_EMPLOYES: 'gérer les employés',
  GERER_ABONNEMENT: "gérer l'abonnement",
};

/**
 * Les cases cochées d'office à la création, selon le rôle choisi.
 *
 * Le propriétaire n'y figure pas vraiment : il a tout sans qu'aucune case soit
 * cochée. Le gestionnaire tient le quotidien et voit l'argent, mais ne touche
 * ni aux employés ni à l'abonnement. Le vendeur vend et encaisse, rien de plus
 * — et surtout ni prix d'achat ni bénéfice.
 */
const OWNER_ONLY: EmployeePermission[] = ['GERER_EMPLOYES', 'GERER_ABONNEMENT'];

const SELLER_DEFAULTS: EmployeePermission[] = [
  'ENREGISTRER_VENTE',
  'ENCAISSER_VERSEMENT',
  'VOIR_SES_VENTES',
];

export function defaultPermissionsForRole(role: UserRole): EmployeePermission[] {
  if (role === 'OWNER') return [...EMPLOYEE_PERMISSIONS];
  if (role === 'SELLER') return [...SELLER_DEFAULTS];
  // ACCOUNTANT — « Gestionnaire » dans l'app.
  return EMPLOYEE_PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p));
}

/**
 * Anciens codes encore présents en base, traduits à la lecture.
 *
 * Avant cette version, cinq droits seulement existaient. Deux ont disparu en se
 * scindant ou en se renommant ; les traduire ici évite une migration de la
 * colonne `User.permissions` et, surtout, évite qu'un employé perde du jour au
 * lendemain un droit que son patron lui avait accordé.
 *
 * Les trois autres (ANNULER_COMMANDE, GERER_STOCK, VOIR_DEPENSES) ont gardé
 * leur nom : rien à traduire.
 */
const LEGACY_EQUIVALENTS: Record<string, EmployeePermission[]> = {
  // « Voir les marges et bénéfices » couvrait les deux lignes en gras.
  VOIR_MARGES: ['VOIR_PRIX_ACHAT', 'VOIR_BENEFICE'],
  // Exporter, c'est lire ses rapports et les emporter.
  EXPORTER_DONNEES: ['VOIR_RAPPORTS'],
};

/** La liste stockée, anciens codes compris, dépliée en droits d'aujourd'hui. */
export function expandPermissions(stored: readonly string[]): Set<string> {
  const droits = new Set<string>();
  for (const code of stored) {
    droits.add(code);
    for (const equivalent of LEGACY_EQUIVALENTS[code] ?? []) {
      droits.add(equivalent);
    }
  }
  return droits;
}

export interface PermissionHolder {
  role: UserRole;
  permissions: string[];
}

/** Le propriétaire a tous les droits ; un employé n'a que ce qui est coché. */
export function hasPermission(holder: PermissionHolder, permission: EmployeePermission): boolean {
  if (holder.role === 'OWNER') return true;
  return expandPermissions(holder.permissions).has(permission);
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
 * marge partent dans la réponse. Sans la permission VOIR_PRIX_ACHAT, un employé
 * est servi comme un vendeur : les chiffres sensibles ne quittent pas le
 * serveur (spec §0 règle 7), quel que soit son rôle.
 */
export function marginViewRole(holder: PermissionHolder): UserRole {
  return hasPermission(holder, 'VOIR_PRIX_ACHAT') ? holder.role : 'SELLER';
}
