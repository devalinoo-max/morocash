import { api } from './client';

export interface UpdateBusinessSettingsInput {
  cashRegisterMode?: 'LIBRE' | 'STRICT';
}

export function updateBusinessSettings(input: UpdateBusinessSettingsInput) {
  return api
    .patch<{ business: { cashRegisterMode: 'LIBRE' | 'STRICT' } }>('/business', input)
    .then((d) => d.business);
}
