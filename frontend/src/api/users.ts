import { api } from './client';
import type { UserRole } from '../types';

export interface ApiEmployee {
  id: string;
  nom: string;
  telephone: string;
  role: UserRole;
  actif: boolean;
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
}) {
  return api.post<{ user: ApiEmployee }>('/users', input).then((d) => d.user);
}

export function setEmployeeActive(id: string, actif: boolean) {
  return api.patch<{ user: ApiEmployee }>(`/users/${id}`, { actif }).then((d) => d.user);
}
