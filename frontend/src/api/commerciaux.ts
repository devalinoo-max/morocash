import { api } from './client';

export interface ApiCommercial {
  /** UUID tiré par l'appareil : définitif dès la création, même hors ligne. */
  id: string;
  nom: string;
  telephone: string | null;
  actif: boolean;
  /** Compte de connexion lié (employé commercial, ou « Moi »). */
  userId: string | null;
}

export interface CommercialRow {
  commercialId: string | null;
  nom: string;
  actif: boolean;
  ventes: number;
  chiffreAffaires: number;
  encaisse: number;
  resteDu: number;
  panierMoyen: number | null;
}

export interface CommerciauxReport {
  rows: CommercialRow[];
  total: { ventes: number; chiffreAffaires: number; encaisse: number; resteDu: number };
}

export interface CommercialSale {
  orderId: string;
  numero: string;
  date: string;
  client: string;
  montant: number;
  encaisse: number;
  annulee: boolean;
}

/** Clé de la ligne « Non attribué » côté serveur. */
export const NON_ATTRIBUE = 'NON_ATTRIBUE';

export function listCommerciaux() {
  return api.get<{ commerciaux: ApiCommercial[] }>('/commerciaux').then((d) => d.commerciaux);
}

export function createCommercial(input: { id: string; nom: string; telephone?: string; pourMoi?: boolean }) {
  return api.post<{ commercial: ApiCommercial }>('/commerciaux', input).then((d) => d.commercial);
}

export function updateCommercial(id: string, input: { nom?: string; telephone?: string | null; actif?: boolean }) {
  return api.patch<{ commercial: ApiCommercial }>('/commerciaux/' + id, input).then((d) => d.commercial);
}

/** Correction du commercial d'une vente (propriétaire seulement, tracée côté serveur). */
export function changeOrderCommercial(orderId: string, commercialId: string | null) {
  return api
    .patch<{ order: { id: string; commercialId: string | null } }>('/orders/' + orderId + '/commercial', { commercialId })
    .then((d) => d.order);
}

/** Totaux par commercial, calculés par le serveur. Dates au format AAAA-MM-JJ. */
export function fetchCommerciauxReport(from: string, to: string) {
  return api.get<CommerciauxReport>('/reports/commerciaux?from=' + from + '&to=' + to);
}

export function fetchCommercialSales(commercialId: string | null, from: string, to: string) {
  const id = encodeURIComponent(commercialId ?? NON_ATTRIBUE);
  return api
    .get<{ ventes: CommercialSale[] }>('/reports/commerciaux/ventes?commercialId=' + id + '&from=' + from + '&to=' + to)
    .then((d) => d.ventes);
}
