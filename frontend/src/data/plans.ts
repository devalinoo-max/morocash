/**
 * src/data/plans.ts
 * Centralized Plans and Pricing Configuration for MoroCash
 *
 * All pricing, quotas, baselines, and savings are derived strictly from this source.
 * No price should be hardcoded anywhere else in the application.
 */

export interface PlanDefinition {
  id: 'SOLO' | 'BUSINESS';
  nom: string;
  prixMensuel: number;
  prixAnnuel: number;
  maxUsers: number;
  maxProduits: number; // 0 = illimité
  rapportsComparatifs: boolean;
  exportExcel: boolean;
  employesAutorises: boolean;
  actif: boolean;
  baseline: string;
  aide: string;
  description: string;
  features: string[];
}

export const PLANS: Record<'SOLO' | 'BUSINESS', PlanDefinition> = {
  SOLO: {
    id: 'SOLO',
    nom: 'Formule Solo',
    prixMensuel: 15000,
    prixAnnuel: 150000, // 2 mois offerts (10 x 15 000 F = 150 000 F)
    maxUsers: 1,
    maxProduits: 1000,
    rapportsComparatifs: false,
    exportExcel: false,
    employesAutorises: false,
    actif: true,
    baseline: 'Si tu vends tout seul',
    aide: 'chat',
    description: 'Idéal si tu gères ton activité seul(e), de chez toi ou en boutique.',
    features: [
      '1 utilisateur unique (Propriétaire)',
      'Jusqu’à 1 000 produits enregistrés',
      'Ventes & commandes illimitées',
      'Clients & carnet de crédit illimités',
      'Historique illimité (jamais bridé)',
      'Ce que tu as gagné inclus',
      'Caisse, dépenses et reçus WhatsApp',
      'Impression d’étiquettes',
      'Support par chat en direct',
    ],
  },
  BUSINESS: {
    id: 'BUSINESS',
    nom: 'Formule Business',
    prixMensuel: 20000,
    prixAnnuel: 200000, // 2 mois offerts (10 x 20 000 F = 200 000 F)
    maxUsers: 5,
    maxProduits: 0, // 0 = illimité
    rapportsComparatifs: true,
    exportExcel: true,
    employesAutorises: true,
    actif: true,
    baseline: 'Si tu as des vendeurs qui travaillent pour toi',
    aide: 'WhatsApp prioritaire',
    description: 'Gère ton équipe jusqu’à 5 personnes avec permissions strictes et protège tes bénéfices.',
    features: [
      'Tout ce qui est dans l’offre Solo +',
      'Jusqu’à 5 employés et vendeurs autorisés',
      'Produits illimités (aucun plafond)',
      'Rapports comparatifs de périodes (hier / semaine / mois)',
      'Export des données sous Excel / CSV',
      'Permissions strictes (marges et bénéfices masqués)',
      'Suivi des caisses individuelles par vendeur',
      'Assistance WhatsApp prioritaire 7j/7',
    ],
  },
};

/**
 * Calcul du montant de l'économie annuelle réalisée par rapport à 12 mensualités.
 * Solo : (15 000 * 12) - 150 000 = 30 000 F
 * Business : (20 000 * 12) - 200 000 = 40 000 F
 */
export function getAnnualSavings(planId: 'SOLO' | 'BUSINESS'): number {
  const plan = PLANS[planId];
  return plan.prixMensuel * 12 - plan.prixAnnuel;
}

/**
 * Calcul du prorata lors d'un passage de Solo à Business en cours de mois :
 * montant = (20000 − 15000) × joursRestants / 30, arrondi au supérieur
 */
export function calculateProrataUpgrade(joursRestants: number): number {
  const diff = PLANS.BUSINESS.prixMensuel - PLANS.SOLO.prixMensuel;
  const jours = Math.max(0, Math.min(30, joursRestants));
  return Math.ceil((diff * jours) / 30);
}

/**
 * Messages officiels de quota
 */
export const QUOTA_MESSAGES = {
  PRODUCT_LIMIT_REACHED:
    'Tu as atteint 1 000 produits. Passe en Business pour en ajouter sans limite.',
  SOLO_NO_EMPLOYEES:
    'L’offre Solo est pour une seule personne. Passe en Business pour ajouter tes vendeurs.',
  SOLO_EMPLOYEES_EXPLANATION:
    'Avec l’offre Solo, tu es seul à utiliser MoroCash. Passe en Business pour ajouter jusqu’à 5 personnes, et décider de ce que chacune peut voir.',
  DOWNGRADE_DEACTIVATION_NOTICE: (count: number) =>
    `Tes ${count} vendeur${count > 1 ? 's' : ''} ne peu${count > 1 ? 'vent' : 't'} plus se connecter. Repasse en Business pour leur rendre l'accès.`,
};

/**
 * Justification du prix affichée sous les cartes
 */
export const PRICING_JUSTIFICATION = {
  quote:
    'Un seul client qui oublie de te payer, c’est souvent plus de 15 000 F perdus. Un sac de riz qui manque un samedi, c’est une journée de vente en moins. MoroCash se rembourse dès la première dette récupérée.',
  publicPromise:
    'Les commerçants qui utilisent MoroCash récupèrent en moyenne leurs dettes dès le premier mois d’utilisation.',
};
