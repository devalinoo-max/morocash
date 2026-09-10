import { ActivityType } from '../types';

const THOUSANDS = /\B(?=(\d{3})+(?!\d))/g;
const TRAILING_ZEROS = /[.,]?0+$/;


// Espace insécable : un montant ne doit jamais se couper en fin de ligne
// ("555 577" d'un côté, "755 F" de l'autre).
const NBSP = '\u00A0';

function groupThousands(numeric: number): string {
  return Math.abs(numeric)
    .toString()
    .replace(THOUSANDS, NBSP);
}

export function formatMoney(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return `0${NBSP}F`;
  }
  const numeric = Math.round(Number(amount));
  const sign = numeric < 0 ? '-' : '';
  return `${sign}${groupThousands(numeric)}${NBSP}F`;
}

/** 1,25 → "1,3" ; 10,0 → "10" (jamais de décimale nulle affichée). */
function trimDecimals(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(TRAILING_ZEROS, '').replace('.', ',');
}

/**
 * Montant destiné à un emplacement contraint (tiroir panier, tuiles du tableau
 * de bord, caisse, rapports) : au-delà de 7 chiffres le nombre complet déborde
 * ou se fait tronquer, on l'abrège donc plutôt que de mentir sur sa largeur.
 * Le montant exact reste affiché là où la place existe (panier déplié, détail
 * d'une commande, reçu) : cette fonction ne remplace jamais formatMoney().
 */
export function formatMoneyCompact(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return `0${NBSP}F`;
  }
  const numeric = Math.round(Number(amount));
  const abs = Math.abs(numeric);

  // Jusqu'à 7 chiffres (9 999 999), l'affichage reste complet.
  if (abs < 10_000_000) return formatMoney(numeric);

  const sign = numeric < 0 ? '-' : '';
  // 999 950 000 s'arrondirait à "1000 M" : on bascule en milliards avant.
  if (abs >= 999_950_000) {
    return `${sign}${trimDecimals(abs / 1_000_000_000, 2)}${NBSP}Md${NBSP}F`;
  }
  return `${sign}${trimDecimals(abs / 1_000_000, 1)}${NBSP}M${NBSP}F`;
}

export const formatFCFA = formatMoney;

export function formatNumber(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(Number(amount))) {
    return '0';
  }
  const numeric = Math.round(Number(amount));
  return `${numeric < 0 ? '-' : ''}${groupThousands(numeric)}`;
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
