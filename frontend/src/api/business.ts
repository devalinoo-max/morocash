import { api } from './client';

export interface UpdateBusinessSettingsInput {
  cashRegisterMode?: 'LIBRE' | 'STRICT';
  suiviCommercialActif?: boolean;
  /** Réglages partagés entre les appareils de la boutique, remplacés en bloc. */
  reglages?: Record<string, unknown>;
}

export function updateBusinessSettings(input: UpdateBusinessSettingsInput) {
  return api
    .patch<{
      business: {
        cashRegisterMode: 'LIBRE' | 'STRICT';
        suiviCommercialActif: boolean;
        reglages: Record<string, unknown> | null;
      };
    }>('/business', input)
    .then((d) => d.business);
}
