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
  cible: 'TOUS' | 'BOUTIQUE';
  businessId: string | null;
  businessNom: string | null;
  appareils: number;
  envoyes: number;
  echecs: number;
  createdAt: string;
}

export interface AdminPushAudience {
  appareils: number;
  boutiques: number;
}
