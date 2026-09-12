import type { Sale } from '../types';

/**
 * Statut d'une commande, tel que le commerçant le lit.
 *
 * Le modèle porte deux informations séparées — annulée ou non, et l'état du
 * paiement — mais à l'écran il n'y en a qu'une : la commande est payée, payée
 * en partie, à crédit, ou annulée. Les couleurs sont figées ici pour que la
 * liste et le détail ne puissent jamais diverger.
 */
export type SaleStatusKey = 'PAID' | 'PARTIAL' | 'CREDIT' | 'CANCELLED';

export interface SaleStatusStyle {
  key: SaleStatusKey;
  /** Libellé court, celui de la pastille dans la liste. */
  label: string;
  /** Libellé du détail, plus explicite. */
  longLabel: string;
  /** Symbole affiché devant le libellé long. */
  symbol: string;
  bg: string;
  fg: string;
}

const STYLES: Record<SaleStatusKey, SaleStatusStyle> = {
  PAID: {
    key: 'PAID',
    label: 'Payée',
    longLabel: 'Payée',
    symbol: '✓',
    bg: '#DCFCE7',
    fg: '#166534',
  },
  PARTIAL: {
    key: 'PARTIAL',
    label: 'Partielle',
    longLabel: 'Payée en partie',
    symbol: '◷',
    bg: '#FFEDD5',
    fg: '#9A3412',
  },
  CREDIT: {
    key: 'CREDIT',
    label: 'À crédit',
    longLabel: 'À crédit',
    symbol: '⚠',
    bg: '#FEE2E2',
    fg: '#991B1B',
  },
  CANCELLED: {
    key: 'CANCELLED',
    label: 'Annulée',
    longLabel: 'Annulée',
    symbol: '✕',
    bg: '#F1F5F9',
    fg: '#94A3B8',
  },
};

export function saleStatusKey(sale: Sale): SaleStatusKey {
  if (sale.isCancelled) return 'CANCELLED';
  if (sale.paymentStatus === 'PARTIAL') return 'PARTIAL';
  if (sale.paymentStatus === 'CREDIT') return 'CREDIT';
  return 'PAID';
}

export function saleStatusStyle(sale: Sale): SaleStatusStyle {
  return STYLES[saleStatusKey(sale)];
}

/**
 * Une commande « à traiter » est une commande non annulée où il reste de
 * l'argent à recevoir. C'est la seule chose qui demande un geste au
 * commerçant — donc la seule chose que compte le badge de l'onglet.
 */
export function isUnpaid(sale: Sale): boolean {
  return !sale.isCancelled && sale.remainingAmount > 0;
}
