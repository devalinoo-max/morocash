/**
 * src/data/plans.ts
 * Centralized Plans and Pricing Configuration for MoroCash
 *
 * All pricing, quotas, baselines, and savings are derived strictly from this source.
 * No price should be hardcoded anywhere else in the application.
 *
 * 3 formules : Essai (30 jours, limites de Solo), Solo, Business. Les prix
 * doivent rester alignés avec la table Plan (migration
 * 20260916180000_plans_durees_nouveaux_prix) : c'est elle qui fixe le montant
 * réellement demandé au paiement.
 */

/** Durée d'essai gratuit à l'inscription (voir register.ts côté serveur). */
export const TRIAL_DAYS = 30;

export type BillingPeriod = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

/** Durées proposées au paiement, dans l'ordre d'affichage. */
export const BILLING_PERIODS: { id: BillingPeriod; mois: number; label: string }[] = [
  { id: 'MENSUEL', mois: 1, label: '1 mois' },
  { id: 'TRIMESTRIEL', mois: 3, label: '3 mois' },
  { id: 'SEMESTRIEL', mois: 6, label: '6 mois' },
  { id: 'ANNUEL', mois: 12, label: '12 mois' },
];

export interface PlanDefinition {
  id: 'SOLO' | 'BUSINESS';
  nom: string;
  prixMensuel: number;
  /** Prix total payé pour chaque durée. */
  prix: Record<BillingPeriod, number>;
  maxUsers: number;
  maxProduits: number; // 0 = illimité
  maxCommandesMois: number; // 0 = illimité
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
    prixMensuel: 9900,
    prix: { MENSUEL: 9900, TRIMESTRIEL: 27600, SEMESTRIEL: 51700, ANNUEL: 99000 },
    maxUsers: 2,
    maxProduits: 1000,
    maxCommandesMois: 900,
    rapportsComparatifs: false,
    exportExcel: false,
    employesAutorises: true,
    actif: true,
    baseline: 'Si tu vends tout seul',
    aide: 'chat',
    description: 'Idéal si tu gères ton activité seul(e) ou à deux, de chez toi ou en boutique.',
    features: [
      '2 utilisateurs (le 2ᵉ ne voit pas tes marges)',
      '900 commandes par mois',
      'Jusqu’à 1 000 produits',
      'Stock complet : scan code-barres, coût moyen, mouvements',
      'Clients, dettes et relance WhatsApp',
      'Reçus texte, image et PDF',
      'Dépenses et rapports jour / mois',
      'Étiquettes imprimables et QR code',
      'Caisse : ouverture et fermeture',
      'Fonctionne hors ligne',
    ],
  },
  BUSINESS: {
    id: 'BUSINESS',
    nom: 'Formule Business',
    prixMensuel: 19900,
    prix: { MENSUEL: 19900, TRIMESTRIEL: 55500, SEMESTRIEL: 103900, ANNUEL: 199000 },
    maxUsers: 10,
    maxProduits: 0, // 0 = illimité
    maxCommandesMois: 0, // 0 = illimité
    rapportsComparatifs: true,
    exportExcel: true,
    employesAutorises: true,
    actif: true,
    baseline: 'Si tu as des vendeurs qui travaillent pour toi',
    aide: 'WhatsApp prioritaire',
    description: 'Gère ton équipe jusqu’à 10 personnes avec permissions avancées et protège tes bénéfices.',
    features: [
      'Tout ce qui est dans l’offre Solo +',
      'Jusqu’à 10 utilisateurs',
      'Commandes illimitées',
      'Produits illimités',
      'Employés et permissions avancées',
      'Caisse avec écarts par caissier',
      'Back-office de gestion',
    ],
  },
};

/** Prix « sans remise » d'une durée : le prix mensuel multiplié par le nombre de mois. */
export function getFullPrice(planId: 'SOLO' | 'BUSINESS', periode: BillingPeriod): number {
  const mois = BILLING_PERIODS.find((p) => p.id === periode)?.mois ?? 1;
  return PLANS[planId].prixMensuel * mois;
}

/**
 * Économie réalisée sur une durée par rapport au paiement mois par mois.
 * Sur 12 mois : Solo 118 800 − 99 000 = 19 800 F, Business 238 800 − 199 000 = 39 800 F,
 * soit 2 mois offerts.
 */
export function getSavings(planId: 'SOLO' | 'BUSINESS', periode: BillingPeriod): number {
  return Math.max(0, getFullPrice(planId, periode) - PLANS[planId].prix[periode]);
}

/**
 * Messages officiels de quota
 */
export const QUOTA_MESSAGES = {
  PRODUCT_LIMIT_REACHED:
    'Tu as atteint 1 000 produits. Passe en Business pour en ajouter sans limite.',
  ORDER_LIMIT_REACHED: (max: number) =>
    `Tu as atteint ${max.toLocaleString('fr-FR')} commandes ce mois-ci. Passe en Business pour vendre sans limite.`,
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
