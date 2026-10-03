import { api } from './client';

export interface UpdateBusinessSettingsInput {
  cashRegisterMode?: 'LIBRE' | 'STRICT';
  /** Réglages partagés entre les appareils de la boutique, remplacés en bloc. */
  reglages?: Record<string, unknown>;
}

export function updateBusinessSettings(input: UpdateBusinessSettingsInput) {
  return api
    .patch<{
      business: { cashRegisterMode: 'LIBRE' | 'STRICT'; reglages: Record<string, unknown> | null };
    }>('/business', input)
    .then((d) => d.business);
}
