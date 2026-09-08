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

export interface AdminMetrics {
  businessesParStatut: Record<string, number>;
  totalUsersActifs: number;
  mrrEstime: number;
}
