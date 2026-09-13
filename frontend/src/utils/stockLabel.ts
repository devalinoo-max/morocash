import type { Product } from '../types';
import { formatNumber } from './formatters';

export interface StockLabel {
  /** Texte affiché tel quel, déjà accordé. */
  text: string;
  /** Couleur du texte (hex, pour rester hors du thème Tailwind). */
  color: string;
}

const GRIS = '#94A3B8';
const AMBRE = '#F59E0B';
const ROUGE = '#DC2626';

/**
 * Le stock, écrit comme on le dit.
 *
 * « Stock : 10 Unité » cumulait deux fautes : un préfixe que personne ne lit
 * (on est dans une liste de produits, la colonne ne peut parler que du stock)
 * et une unité au singulier derrière un nombre pluriel. On garde le nombre et
 * le mot qui le qualifie, rien d'autre — c'est la couleur qui porte l'alerte.
 */
export function stockLabel(product: Product): StockLabel {
  if (product.isService) {
    return { text: 'Prestation', color: GRIS };
  }
  if (product.stock < 0) {
    return { text: `Stock : −${formatNumber(Math.abs(product.stock))}`, color: ROUGE };
  }
  if (product.stock === 0) {
    return { text: 'Rupture', color: ROUGE };
  }
  if (product.stock <= product.alertThreshold) {
    return { text: `${formatNumber(product.stock)} en stock`, color: AMBRE };
  }
  return { text: `${formatNumber(product.stock)} en stock`, color: GRIS };
}
