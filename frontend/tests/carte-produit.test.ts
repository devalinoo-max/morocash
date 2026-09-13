import { describe, expect, it } from 'vitest';
import type { Product } from '../src/types';
import { stockLabel } from '../src/utils/stockLabel';
import { formatMoney, formatMoneyCompact } from '../src/utils/formatters';

const NBSP = ' ';

function produit(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'À lolo',
    salePrice: 1500,
    purchasePrice: 1000,
    stock: 10,
    alertThreshold: 3,
    category: 'Alimentation',
    unit: 'Unité',
    salesCount: 0,
    createdAt: '2026-09-11T08:00:00.000Z',
    ...overrides,
  };
}

describe('Libellé du stock sur la carte', () => {
  it('écrit « 10 en stock », sans préfixe ni unité au singulier', () => {
    const { text, color } = stockLabel(produit({ stock: 10 }));
    expect(text).toBe('10 en stock');
    expect(text).not.toContain('Stock :');
    expect(text).not.toContain('Unité');
    expect(color).toBe('#94A3B8');
  });

  it('passe en ambre sous le seuil d’alerte', () => {
    expect(stockLabel(produit({ stock: 3, alertThreshold: 5 }))).toEqual({
      text: '3 en stock',
      color: '#F59E0B',
    });
    // Pile sur le seuil : c'est déjà une alerte.
    expect(stockLabel(produit({ stock: 5, alertThreshold: 5 })).color).toBe('#F59E0B');
    expect(stockLabel(produit({ stock: 6, alertThreshold: 5 })).color).toBe('#94A3B8');
  });

  it('dit « Rupture » à zéro', () => {
    expect(stockLabel(produit({ stock: 0 }))).toEqual({ text: 'Rupture', color: '#DC2626' });
  });

  it('dit « Stock : −2 » en négatif, avec un vrai signe moins', () => {
    const { text, color } = stockLabel(produit({ stock: -2 }));
    expect(text).toBe('Stock : −2');
    expect(color).toBe('#DC2626');
  });

  it('dit « Prestation » pour un service, quel que soit le stock', () => {
    expect(stockLabel(produit({ isService: true, stock: 0 }))).toEqual({
      text: 'Prestation',
      color: '#94A3B8',
    });
  });

  it('groupe les milliers d’un gros stock', () => {
    expect(stockLabel(produit({ stock: 1500 })).text).toBe(`1${NBSP}500 en stock`);
  });
});

describe('Montants longs sur la carte', () => {
  it('affiche en entier jusqu’à sept chiffres', () => {
    expect(formatMoneyCompact(1234567)).toBe(`1${NBSP}234${NBSP}567${NBSP}F`);
    expect(formatMoneyCompact(9999999)).toBe(`9${NBSP}999${NBSP}999${NBSP}F`);
  });

  it('abrège à partir de huit chiffres', () => {
    // Le cas qui débordait de la carte.
    expect(formatMoneyCompact(111111111)).toBe(`111,1${NBSP}M${NBSP}F`);
    expect(formatMoneyCompact(10000000)).toBe(`10${NBSP}M${NBSP}F`);
  });

  it('bascule en milliards au-delà du milliard', () => {
    expect(formatMoneyCompact(1230000000)).toBe(`1,23${NBSP}Md${NBSP}F`);
    // 999 950 000 s'arrondirait à « 1000 M » : on passe en Md avant.
    expect(formatMoneyCompact(999950000)).toBe(`1${NBSP}Md${NBSP}F`);
  });

  it('n’abrège jamais dans la fiche, où la place existe', () => {
    expect(formatMoney(111111111)).toBe(`111${NBSP}111${NBSP}111${NBSP}F`);
  });

  it('sépare les milliers par une espace insécable, jamais par une coupure', () => {
    expect(formatMoneyCompact(1234567)).not.toContain(' ');
  });

  it('tient dans la largeur d’une carte de 320 px', () => {
    // Repère de largeur : au-delà de 14 caractères, le montant en 16px/800
    // déborde de la colonne de contenu d'une carte à 320 px.
    for (const montant of [0, 999, 1234567, 12345678, 111111111, 999950000, 987654321000]) {
      expect(formatMoneyCompact(montant).length).toBeLessThanOrEqual(14);
    }
  });
});
