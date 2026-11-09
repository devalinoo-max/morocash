import { api } from './client';
import type { UserRole } from '../types';
import type { EmployeePermission } from '../data/permissions';

export interface ApiEmployee {
  id: string;
  nom: string;
  telephone: string;
  role: UserRole;
  /** Droits accordés à cette personne — vide pour le propriétaire, qui a tout. */
  permissions: EmployeePermission[];
  actif: boolean;
  /** Case « Commercial » : ses ventes lui sont attribuées. */
  estCommercial?: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export function listEmployees() {
  return api.get<{ users: ApiEmployee[] }>('/users').then((d) => d.users);
}

export function createEmployee(input: {
  nom: string;
  telephone: string;
  pin: string;
  role: 'SELLER' | 'ACCOUNTANT';
  permissions: EmployeePermission[];
  estCommercial?: boolean;
}) {
  return api.post<{ user: ApiEmployee }>('/users', input).then((d) => d.user);
}

/**
 * Un employé n'est jamais supprimé, seulement désactivé : ses ventes passées
 * restent dans les totaux et dans l'historique.
 */
export function setEmployeeActive(id: string, actif: boolean) {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { actif }).then((d) => d.user);
}

/** Change le rôle d'un employé ; le serveur recoche les cases de ce rôle. */
export function setEmployeeRole(id: string, role: 'SELLER' | 'ACCOUNTANT') {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { role }).then((d) => d.user);
}

/**
 * Remplace la liste des droits d'un employé. Une liste vide est un choix
 * valable (tout décoché), pas une absence de choix.
 */
export function setEmployeePermissions(id: string, permissions: EmployeePermission[]) {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { permissions }).then((d) => d.user);
}

/**
 * Redonne un code à un employé qui a oublié le sien. Le code choisi n'est pas
 * renvoyé par le serveur : c'est au propriétaire de le lui dire.
 */
export function resetEmployeeCode(id: string, pin: string) {
  return api.post<{ user: ApiEmployee }>(`/users/${id}/reset-code`, { pin }).then((d) => d.user);
}

/** Coche ou décoche la case « Commercial » d'un employé. */
export function setEmployeeCommercial(id: string, estCommercial: boolean) {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { estCommercial }).then((d) => d.user);
}
