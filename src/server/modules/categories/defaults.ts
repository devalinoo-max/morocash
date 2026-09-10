/**
 * Catégories proposées à l'inscription, selon l'activité déclarée.
 *
 * Elles ne sont qu'une avance sur le travail du commerçant : il peut toutes
 * les supprimer d'un geste depuis Réglages > Mes catégories, et créer un
 * produit sans catégorie du tout. Le but est qu'un débutant trouve son
 * catalogue déjà rangé le premier jour, pas de lui imposer un classement.
 */
export const BUSINESS_SECTORS = [
  'ALIMENTATION',
  'COSMETIQUES',
  'PRET_A_PORTER',
  'ELECTRONIQUE',
  'SERVICES',
  'AUTRE',
] as const;

export type BusinessSector = (typeof BUSINESS_SECTORS)[number];

const SECTOR_CATEGORIES: Record<BusinessSector, string[]> = {
  ALIMENTATION: [
    'Céréales',
    'Huiles',
    'Boissons',
    'Conserves',
    'Produits laitiers',
    'Épices',
    'Entretien',
    'Divers',
  ],
  COSMETIQUES: ['Soins visage', 'Soins corps', 'Cheveux', 'Parfums', 'Maquillage'],
  PRET_A_PORTER: ['Femme', 'Homme', 'Enfant', 'Chaussures', 'Accessoires'],
  ELECTRONIQUE: ['Téléphones', 'Accessoires', 'Chargeurs', 'Audio', 'Divers'],
  SERVICES: ['Prestations', 'Réparations', 'Livraison'],
  // Secteur non déclaré : une seule catégorie fourre-tout, on ne devine pas.
  AUTRE: ['Divers'],
};

export function starterProductCategories(secteur: BusinessSector = 'AUTRE'): string[] {
  return SECTOR_CATEGORIES[secteur] ?? SECTOR_CATEGORIES.AUTRE;
}

/**
 * Catégorie de dépense créée pour toute boutique : elle porte un cadenas
 * (systeme: true) car le module Réceptions s'appuie dessus.
 */
export const SYSTEM_EXPENSE_CATEGORY = 'Achat marchandise';
