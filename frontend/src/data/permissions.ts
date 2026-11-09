/**
 * src/data/permissions.ts
 * Les droits d'un employé, ligne par ligne, tels que l'app les affiche.
 *
 * Doit rester aligné avec src/server/modules/users/permissions.ts côté backend :
 * c'est lui qui refuse réellement l'accès. Cette liste sert à afficher les cases
 * et, surtout, à CACHER ce à quoi la personne n'a pas droit — un bouton grisé
 * sur lequel on ne peut pas appuyer est une promesse non tenue, un bouton absent
 * ne pose aucune question.
 */

export const EMPLOYEE_PERMISSIONS = [
  'ENREGISTRER_VENTE',
  'ENCAISSER_VERSEMENT',
  'VOIR_SES_VENTES',
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
  'GERER_EMPLOYES',
  'GERER_ABONNEMENT',
] as const;

export type EmployeePermission = (typeof EMPLOYEE_PERMISSIONS)[number];

export type UserRoleCode = 'OWNER' | 'ACCOUNTANT' | 'SELLER';

export interface PermissionOption {
  code: EmployeePermission;
  label: string;
  aide: string;
  /** Les deux droits qui protègent la marge du patron : mis en avant. */
  sensible?: boolean;
}

/**
 * Les cases, dans l'ordre du cahier des charges : le quotidien du comptoir
 * d'abord, puis ce qui engage la boutique, puis ce qui n'appartient qu'au
 * patron. Un propriétaire qui relit cette liste doit la parcourir du plus
 * anodin au plus lourd.
 */
export const PERMISSION_OPTIONS: PermissionOption[] = [
  {
    code: 'ENREGISTRER_VENTE',
    label: 'Enregistrer une vente',
    aide: 'Encaisser au comptoir',
  },
  {
    code: 'ENCAISSER_VERSEMENT',
    label: 'Encaisser un versement',
    aide: 'Recevoir un paiement sur une vente déjà faite',
  },
  {
    code: 'VOIR_SES_VENTES',
    label: 'Voir ses propres ventes',
    aide: 'Son historique à lui, pas celui des autres',
  },
  {
    code: 'FAIRE_REMISE',
    label: 'Faire une remise',
    aide: 'Baisser un prix à la vente',
  },
  {
    code: 'VENDRE_A_CREDIT',
    label: 'Vendre à crédit',
    aide: 'Laisser partir la marchandise sans tout l’argent',
  },
  {
    code: 'ANNULER_COMMANDE',
    label: 'Annuler une vente',
    aide: 'Défaire une vente déjà enregistrée',
  },
  {
    code: 'GERER_PRODUITS',
    label: 'Ajouter ou modifier un produit',
    aide: 'Noms, prix de vente, photos',
  },
  {
    code: 'GERER_STOCK',
    label: 'Ajuster le stock',
    aide: 'Réceptions, ajustements et comptages',
  },
  {
    code: 'VOIR_DETTES_CLIENTS',
    label: 'Voir et relancer les dettes clients',
    aide: 'Qui doit quoi, et les relances WhatsApp',
  },
  {
    code: 'VOIR_DEPENSES',
    label: 'Noter une dépense',
    aide: 'Charges, factures et sorties de caisse',
  },
  {
    code: 'VOIR_PRIX_ACHAT',
    label: 'Voir les prix d’achat',
    aide: 'Il connaîtra ta marge sur chaque article',
    sensible: true,
  },
  {
    code: 'VOIR_BENEFICE',
    label: 'Voir le bénéfice',
    aide: 'Ce que la boutique gagne vraiment',
    sensible: true,
  },
  {
    code: 'VOIR_VENTES_EQUIPE',
    label: 'Voir les ventes de tous les employés',
    aide: 'L’historique de toute la boutique',
  },
  {
    code: 'VOIR_RAPPORTS',
    label: 'Voir les rapports',
    aide: 'Mes chiffres, et leur export',
  },
  {
    code: 'CLOTURE_CAISSE',
    label: 'Faire la clôture de caisse',
    aide: 'Arrêter la caisse du soir et constater l’écart',
  },
  {
    code: 'GERER_EMPLOYES',
    label: 'Gérer les employés',
    aide: 'Ajouter, désactiver, changer les droits',
  },
  {
    code: 'GERER_ABONNEMENT',
    label: 'Gérer l’abonnement',
    aide: 'Formule et paiements MoroCash',
  },
];

/** Les droits que le propriétaire seul possède par défaut. */
const OWNER_ONLY: EmployeePermission[] = ['GERER_EMPLOYES', 'GERER_ABONNEMENT'];

const SELLER_DEFAULTS: EmployeePermission[] = [
  'ENREGISTRER_VENTE',
  'ENCAISSER_VERSEMENT',
  'VOIR_SES_VENTES',
];

/**
 * Les cases cochées d'office quand on choisit un rôle. Même table que le
 * serveur (defaultPermissionsForRole) : si les deux divergent, l'app propose
 * des droits que le serveur refusera.
 */
export function defaultPermissionsForRole(role: UserRoleCode): EmployeePermission[] {
  if (role === 'OWNER') return [...EMPLOYEE_PERMISSIONS];
  if (role === 'SELLER') return [...SELLER_DEFAULTS];
  return EMPLOYEE_PERMISSIONS.filter((p) => !OWNER_ONLY.includes(p));
}

/** Les trois rôles, et comment les présenter. */
export const ROLE_LABELS: Record<UserRoleCode, string> = {
  OWNER: 'Propriétaire',
  ACCOUNTANT: 'Gestionnaire',
  SELLER: 'Vendeur',
};

export const ROLE_RESUMES: Record<UserRoleCode, string> = {
  OWNER: 'Tout, sans exception. Un seul par boutique',
  ACCOUNTANT: 'Gère le quotidien : stock, dettes, dépenses. Voit l’argent',
  SELLER: 'Vend et encaisse. Ne voit ni les prix d’achat, ni le bénéfice',
};

/** Couleur de la pastille de rôle : vert, indigo, gris. */
export const ROLE_PASTILLES: Record<UserRoleCode, { bg: string; fg: string }> = {
  OWNER: { bg: '#E8F8EE', fg: '#15803D' },
  ACCOUNTANT: { bg: '#EEF2FF', fg: '#4338CA' },
  SELLER: { bg: '#F3F4FA', fg: '#4B5169' },
};

/**
 * Anciens codes encore stockés en base, dépliés comme le fait le serveur.
 * Sans cette traduction, l'app cacherait un onglet auquel la personne a
 * pourtant droit alors que le serveur l'autoriserait : l'écran mentirait.
 */
const LEGACY_EQUIVALENTS: Record<string, EmployeePermission[]> = {
  VOIR_MARGES: ['VOIR_PRIX_ACHAT', 'VOIR_BENEFICE'],
  EXPORTER_DONNEES: ['VOIR_RAPPORTS'],
};

function expandPermissions(stored: readonly string[]): Set<string> {
  const droits = new Set<string>();
  for (const code of stored) {
    droits.add(code);
    for (const equivalent of LEGACY_EQUIVALENTS[code] ?? []) {
      droits.add(equivalent);
    }
  }
  return droits;
}

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
  return expandPermissions(user.permissions ?? []).has(permission);
}
