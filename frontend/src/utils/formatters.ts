import { ActivityType } from '../types';

export function formatMoney(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '0 F';
  }
  const numeric = Math.round(Number(amount));
  // Format with French space thousand separators, no decimals, F currency
  const formatted = numeric.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${formatted} F`;
}

export const formatFCFA = formatMoney;

export function formatNumber(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '0';
  }
  return Math.round(Number(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (isToday) {
    return `Aujourd'hui à ${hours}:${minutes}`;
  }

  const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year} à ${hours}:${minutes}`;
}

export function formatShortDate(dateInput: string | Date | undefined): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateLocalSaleReference(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  return `CMD-${dateStr}-${randomSuffix}`;
}

export function generateServerSaleReference(index: number): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const paddedIndex = index.toString().padStart(4, '0');
  return `CMD-${dateStr}-${paddedIndex}`;
}

export interface Terminology {
  itemSingular: string;
  itemPlural: string;
  actionSell: string;
  stockVisible: boolean;
  stockLabel: string;
  lowStockLabel: string;
  catalogTitle: string;
}

export function getTerminology(activityType: ActivityType): Terminology {
  switch (activityType) {
    case 'SERVICES':
      return {
        itemSingular: 'Prestation',
        itemPlural: 'Prestations',
        actionSell: 'Nouvelle prestation',
        stockVisible: false,
        stockLabel: 'Disponibilité',
        lowStockLabel: 'Indisponible',
        catalogTitle: 'Services & Tarifs',
      };
    case 'MIXTE':
      return {
        itemSingular: 'Article / Prestation',
        itemPlural: 'Produits & Prestations',
        actionSell: 'Nouvelle commande',
        stockVisible: true,
        stockLabel: 'Stock',
        lowStockLabel: 'Stock bas',
        catalogTitle: 'Catalogue mixte',
      };
    case 'COMMERCE':
    default:
      return {
        itemSingular: 'Produit',
        itemPlural: 'Produits',
        actionSell: 'Nouvelle commande',
        stockVisible: true,
        stockLabel: 'Stock',
        lowStockLabel: 'Stock bas',
        catalogTitle: 'Produits & Stocks',
      };
  }
}

export function formatPaymentMethod(method: string | undefined): string {
  if (!method) return 'Espèces';
  switch (method.toUpperCase()) {
    case 'CASH':
    case 'ESPECES':
    case 'ESPÈCES':
      return 'Espèces';
    case 'WAVE':
      return 'Wave';
    case 'ORANGE_MONEY':
    case 'OM':
      return 'Orange Money';
    case 'MTN':
    case 'MTN_MONEY':
      return 'MTN';
    case 'MOOV':
    case 'MOOV_MONEY':
      return 'Moov';
    case 'VIREMENT':
      return 'Virement';
    default:
      return method;
  }
}
