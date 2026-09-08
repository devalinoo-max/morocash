import { api, ApiError } from './client';
import type { UserRole } from '../types';

export interface ApiUser {
  id: string;
  nom: string;
  telephone: string;
  role: UserRole;
}

export type CountryCode = 'CI' | 'SN' | 'BJ' | 'TG' | 'ML' | 'BF';

export interface ApiBusiness {
  id: string;
  nom: string;
  statut: string;
  typeActivite?: string;
  devise?: string;
  ville?: string | null;
  pays?: string | null;
  email?: string | null;
  planCode?: 'SOLO' | 'BUSINESS' | null;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
  trialDaysLeft?: number | null;
  locked?: boolean;
}

export interface MeResponse {
  user: ApiUser;
  business: ApiBusiness;
}

export interface RegisterInput {
  businessNom: string;
  ville?: string;
  pays: CountryCode;
  email?: string;
  telephone: string;
  pin: string;
}

export interface LoginInput {
  telephone: string;
  pin: string;
  businessId?: string;
}

export type LoginResult =
  | { requiresBusinessSelection: true; businesses: { businessId: string; businessNom: string }[] }
  | { requiresBusinessSelection?: false; userId: string; businessId: string };

/** GET /auth/me — renvoie null si aucune session valide (401 AUTH_SESSION_EXPIRED). */
export async function fetchCurrentSession(): Promise<MeResponse | null> {
  try {
    return await api.get<MeResponse>('/auth/me');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'AUTH_SESSION_EXPIRED') {
      return null;
    }
    throw error;
  }
}

export function registerBusiness(input: RegisterInput) {
  return api.post<{ business: ApiBusiness; user: ApiUser }>('/auth/register', input);
}

export function login(input: LoginInput) {
  return api.post<LoginResult>('/auth/login', input);
}

export function logout() {
  return api.post<{ loggedOut: true }>('/auth/logout');
}

export function closeAccount() {
  return api.post<{ closed: true }>('/auth/close-account');
}

export interface ApiSession {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  isCurrent: boolean;
}

/** "Mes appareils connectés" (réglages > Mon compte). */
export function listMySessions() {
  return api.get<{ sessions: ApiSession[] }>('/auth/sessions').then((d) => d.sessions);
}

export function revokeSession(sessionId: string) {
  return api.delete<{ revoked: true }>(`/auth/sessions/${sessionId}`);
}

/** "Me déconnecter partout" : coupe toutes les autres sessions. */
export function revokeOtherSessions() {
  return api.delete<{ revoked: number }>('/auth/sessions').then((d) => d.revoked);
}
