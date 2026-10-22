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

export function setEmployeeActive(id: string, actif: boolean) {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { actif }).then((d) => d.user);
}

/** Coche ou décoche la case « Commercial » d'un employé. */
export function setEmployeeCommercial(id: string, estCommercial: boolean) {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { estCommercial }).then((d) => d.user);
}
