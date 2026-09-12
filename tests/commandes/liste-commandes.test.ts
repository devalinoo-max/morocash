import { describe, it, expect } from 'vitest';
import type { Sale } from '../../frontend/src/types';
import { plural, countLabel } from '../../frontend/src/utils/plural';
import { saleStatusKey, saleStatusStyle, isUnpaid } from '../../frontend/src/utils/saleStatus';
import { avatarInitials, avatarColor } from '../../frontend/src/utils/avatar';
import { paymentMethodColors } from '../../frontend/src/utils/paymentMethods';

/**
 * Ce que la liste « Mes commandes » affiche sur un telephone.
 *
 * Le commercant ouvre cet ecran pour deux informations : combien, et est-ce
 * paye. Les deux sortent des fonctions testees ici — si l'une se trompe, il
 * relance un client qui a deja paye, ou il oublie d'en relancer un qui doit.
 */

function commande(over: Partial<Sale> = {}): Sale {
  return {
    id: 'cmd1',
    clientUuid: 'uuid-1',
    reference: 'CMD-20260911-0004',
    items: [{ productId: 'p1', name: 'Riz', unitPrice: 4_800, quantity: 2, total: 9_600 }],
    subtotal: 9_600,
    discount: 0,
    totalAmount: 9_600,
    paidAmount: 9_600,
    remainingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    customerName: 'Aicha Traore',
    createdAt: '2026-09-11T14:32:00.000Z',
    sellerName: 'Mamadou',
    syncStatus: 'SYNCED',
    ...over,
  };
}

describe('Accord du pluriel', () => {
  it('zero et un restent au singulier, deux et plus s accordent', () => {
    expect(countLabel(0, 'commande')).toBe('0 commande');
    expect(countLabel(1, 'commande')).toBe('1 commande');
    expect(countLabel(2, 'commande')).toBe('2 commandes');
    expect(countLabel(4, 'commande')).toBe('4 commandes');
  });

  it('accepte un pluriel irregulier', () => {
    expect(countLabel(1, 'note de frais', 'notes de frais')).toBe('1 note de frais');
    expect(countLabel(3, 'note de frais', 'notes de frais')).toBe('3 notes de frais');
  });

  it('n ecrit jamais un « (s) » entre parentheses', () => {
    for (const n of [0, 1, 2, 17]) {
      expect(countLabel(n, 'article')).not.toContain('(s)');
    }
  });

  it('un nombre negatif s accorde sur sa valeur absolue', () => {
    // Un ecart de stock de -3 se lit « 3 produits », pas « 3 produit ».
    expect(plural(-3, 'produit')).toBe('produits');
    expect(plural(-1, 'produit')).toBe('produit');
  });
});

describe('Statut d une commande', () => {
  it('une commande soldee est payee', () => {
    expect(saleStatusKey(commande())).toBe('PAID');
    expect(saleStatusStyle(commande()).label).toBe('Payée');
  });

  it('une commande a moitie reglee est partielle', () => {
    const s = commande({ paymentStatus: 'PARTIAL', paidAmount: 5_000, remainingAmount: 7_500 });
    expect(saleStatusKey(s)).toBe('PARTIAL');
    expect(saleStatusStyle(s).label).toBe('Partielle');
  });

  it('une commande sans aucun paiement est a credit', () => {
    const s = commande({ paymentStatus: 'CREDIT', paidAmount: 0, remainingAmount: 9_600 });
    expect(saleStatusKey(s)).toBe('CREDIT');
  });

  it('l annulation l emporte sur l etat du paiement', () => {
    // Une commande annulee qui avait ete payee doit se lire « Annulee », pas
    // « Payee » : sinon elle continue de compter dans la tete du commercant.
    const s = commande({ isCancelled: true });
    expect(saleStatusKey(s)).toBe('CANCELLED');
    expect(saleStatusStyle(s).label).toBe('Annulée');
  });

  it('les couleurs sont figees, liste et detail ne peuvent pas diverger', () => {
    expect(saleStatusStyle(commande())).toMatchObject({ bg: '#DCFCE7', fg: '#166534' });
    expect(
      saleStatusStyle(commande({ paymentStatus: 'PARTIAL', remainingAmount: 1 }))
    ).toMatchObject({ bg: '#FFEDD5', fg: '#9A3412' });
    expect(
      saleStatusStyle(commande({ paymentStatus: 'CREDIT', paidAmount: 0, remainingAmount: 1 }))
    ).toMatchObject({ bg: '#FEE2E2', fg: '#991B1B' });
    expect(saleStatusStyle(commande({ isCancelled: true }))).toMatchObject({
      bg: '#F1F5F9',
      fg: '#94A3B8',
    });
  });
});

describe('Badge de l onglet Commandes', () => {
  it('ne compte que ce qui demande un geste', () => {
    const soldee = commande();
    const partielle = commande({ id: 'c2', paymentStatus: 'PARTIAL', remainingAmount: 7_500 });
    const credit = commande({ id: 'c3', paymentStatus: 'CREDIT', paidAmount: 0, remainingAmount: 9_600 });

    expect(isUnpaid(soldee)).toBe(false);
    expect(isUnpaid(partielle)).toBe(true);
    expect(isUnpaid(credit)).toBe(true);
  });

  it('une commande annulee ne demande plus rien, meme avec un reste', () => {
    // C'est le piege : le champ remainingAmount ne se remet pas a zero tout
    // seul. Un badge qui le lirait tel quel enverrait relancer un client pour
    // une commande qui n'existe plus.
    const annulee = commande({
      isCancelled: true,
      paymentStatus: 'CREDIT',
      paidAmount: 0,
      remainingAmount: 9_600,
    });
    expect(isUnpaid(annulee)).toBe(false);
  });

  it('sans rien a encaisser, le compte tombe a zero (donc pas de badge)', () => {
    const ventes = [commande(), commande({ id: 'c2' })];
    expect(ventes.filter(isUnpaid)).toHaveLength(0);
  });
});

describe('Vignette a initiales', () => {
  it('prend l initiale des deux premiers mots du nom', () => {
    expect(avatarInitials('Aicha Traore')).toBe('AT');
    expect(avatarInitials('Yao Kouassi Bernard')).toBe('YK');
  });

  it('un nom en un seul mot rend deux lettres, pas une', () => {
    // Une vignette d'une seule lettre se confond avec toutes celles du meme
    // rayon : « Yao » et « Yacouba » donneraient le meme rond.
    expect(avatarInitials('Yao')).toBe('YA');
    expect(avatarInitials('A')).toBe('A');
  });

  it('ecarte la ponctuation avant de decouper', () => {
    // Des noms comme « A— » existent vraiment dans la base : sans nettoyage,
    // la vignette affiche le tiret et se lit comme un bug.
    expect(avatarInitials('A—')).toBe('A');
    expect(avatarInitials('-Yao')).toBe('YA');
  });

  it('ne casse pas sur un nom vide ou absent', () => {
    expect(avatarInitials('')).toBe('?');
    expect(avatarInitials('   ')).toBe('?');
    expect(avatarInitials(undefined)).toBe('?');
    expect(avatarInitials(null)).toBe('?');
  });

  it('la couleur ne bouge jamais pour un meme client', () => {
    expect(avatarColor('Aicha Traore')).toBe(avatarColor('Aicha Traore'));
  });
});

describe('Couleurs des moyens de paiement', () => {
  it('reprennent celles des operateurs', () => {
    expect(paymentMethodColors('WAVE').bg).toBe('#00C3F7');
    expect(paymentMethodColors('ORANGE_MONEY').bg).toBe('#FF6600');
    expect(paymentMethodColors('MTN').bg).toBe('#FFCC00');
  });

  it('Moov et le virement restent gris, faute de couleur reconnue', () => {
    expect(paymentMethodColors('MOOV').bg).toBe(paymentMethodColors('VIREMENT').bg);
  });
});
