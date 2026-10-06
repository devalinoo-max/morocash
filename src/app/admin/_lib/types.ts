export type SubPeriod = 'MENSUEL' | 'TRIMESTRIEL' | 'SEMESTRIEL' | 'ANNUEL';

export type SubPayState = 'INITIE' | 'REUSSI' | 'ECHOUE' | 'EXPIRE';

export type BusinessStatus = 'ESSAI' | 'ACTIF' | 'IMPAYE' | 'SUSPENDU' | 'RESILIE';

export interface AdminPlan {
  id: string;
  code: string;
  nom: string;
  prixMensuel: number;
  prixAnnuel: number;
  maxUsers: number;
  maxProduits: number;
  rapportsComparatifs: boolean;
  exportExcel: boolean;
  actif: boolean;
}

export interface AdminBusiness {
  id: string;
  nom: string;
  typeActivite: string;
  ville: string | null;
  pays: string;
  devise: string;
  planId: string | null;
  plan: AdminPlan | null;
  statut: BusinessStatus;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  createdAt: string;
  /** Abonnement payé en cours (ou le dernier), null si la boutique n'a jamais payé. */
  abonnement: { formule: string; montant: number; periode: SubPeriod; dateFin: string } | null;
  /** Affilié dont le lien a amené l'inscription, null pour une inscription directe. */
  affiliate: { id: string; code: string; nom: string | null } | null;
}

export interface AdminBusinessUser {
  id: string;
  nom: string;
  telephone: string;
  role: 'OWNER' | 'SELLER' | 'ACCOUNTANT';
  actif: boolean;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  businessId: string | null;
  userId: string | null;
  adminUserId: string | null;
  action: string;
  entite: string;
  entiteId: string | null;
  motif: string | null;
  createdAt: string;
}

export interface AdminSubscriptionPayment {
  id: string;
  businessId: string;
  businessNom: string;
  montant: number;
  formule: string | null;
  periode: SubPeriod | null;
  methode: string;
  statut: SubPayState;
  referenceInterne: string;
  referencePasserelle: string | null;
  createdAt: string;
}

export interface AdminPushBroadcast {
  id: string;
  titre: string;
  message: string;
  lien: string | null;
  cible: 'TOUS' | 'BOUTIQUE' | 'RELANCE_INACTIF' | 'RELANCE_SANS_VENTE' | 'RELANCE_EXPIRE';
  businessId: string | null;
  businessNom: string | null;
  appareils: number;
  envoyes: number;
  echecs: number;
  statut: 'PROGRAMME' | 'EN_COURS' | 'ENVOYE' | 'ANNULE';
  programmeLe: string | null;
  envoyeLe: string | null;
  createdAt: string;
}

export interface AdminPushAudience {
  appareils: number;
  boutiques: number;
}

export interface AdminAffiliationSettings {
  seuilRetrait: number;
  plans: { id: string; code: string; nom: string; commissionAffilie: number }[];
}

export interface AdminAffiliate {
  id: string;
  code: string;
  nom: string | null;
  telephone: string;
  pays: string;
  createdAt: string;
  inscrits: number;
  payants: number;
  solde: number;
  /** Demande de retrait en attente de paiement, null s'il n'y en a pas. */
  retraitDemande: {
    id: string;
    montant: number;
    operateur: string | null;
    numeroReception: string | null;
    createdAt: string;
  } | null;
}

export interface AdminAffiliatesOverview {
  retraitsDemandes: number;
  totalAVerser: number;
  affiliates: AdminAffiliate[];
}

export type AffiliateAccountStatus = 'ESSAI' | 'ABONNE' | 'INACTIF';

export interface AdminAffiliateDetail {
  id: string;
  code: string;
  nom: string | null;
  telephone: string;
  pays: string;
  createdAt: string;
  inscrits: number;
  payants: number;
  solde: number;
  comptes: {
    id: string;
    nom: string;
    createdAt: string;
    statut: AffiliateAccountStatus;
    planCode: string | null;
    paiements: number;
    commission: number;
  }[];
}
