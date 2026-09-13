import { describe, expect, it } from 'vitest';
import { avatarColor, avatarInitials } from '../src/utils/avatar';

describe('Initiales de la vignette', () => {
  it('prend la première lettre du prénom et celle du nom', () => {
    expect(avatarInitials('Mamadou Koné')).toBe('MK');
    expect(avatarInitials('aïcha traoré')).toBe('AT');
  });

  it('rend deux lettres quand le nom ne tient qu’en un mot', () => {
    // « Allo » donnait « A » : une vignette d'une lettre ressemble à toutes
    // les autres du même rayon, elle ne distingue plus rien.
    expect(avatarInitials('Allo')).toBe('AL');
    expect(avatarInitials('Aaa')).toBe('AA');
  });

  it('n’affiche jamais de tiret ni de caractère de remplissage', () => {
    // Le cas d'où venait « A— » : à l'inscription, le propriétaire est nommé
    // « <Boutique> — Propriétaire » (src/server/modules/auth/register.ts), et
    // l'ancien calcul prenait la première lettre des deux premiers mots —
    // c'est-à-dire « A », puis le tiret cadratin.
    expect(avatarInitials('Allo — Propriétaire')).toBe('AP');
    expect(avatarInitials('Aaa — Propriétaire')).toBe('AP');
    expect(avatarInitials('A—')).toBe('A');
    expect(avatarInitials('—A')).toBe('A');
    expect(avatarInitials('-Yao')).toBe('YA');
    expect(avatarInitials('Jean-Pierre Dupont')).toBe('JD');
  });

  it('rend « ? » quand il n’y a rien à afficher', () => {
    expect(avatarInitials('')).toBe('?');
    expect(avatarInitials('   ')).toBe('?');
    expect(avatarInitials('—')).toBe('?');
    expect(avatarInitials(null)).toBe('?');
    expect(avatarInitials(undefined)).toBe('?');
  });

  it('ne dépasse jamais deux caractères', () => {
    const noms = [
      'Mamadou Koné',
      'Allo',
      'Jean Claude Van Damme',
      'Établissements Traoré et Fils',
      'A',
      '',
    ];
    for (const nom of noms) {
      expect(avatarInitials(nom).length).toBeLessThanOrEqual(2);
    }
  });

  it('garde les chiffres, qui font partie du nom', () => {
    expect(avatarInitials('2Fast')).toBe('2F');
  });
});

describe('Couleur de la vignette', () => {
  it('ne bouge pas pour un même nom', () => {
    expect(avatarColor('À lolo')).toBe(avatarColor('À lolo'));
  });

  it('sépare deux noms voisins', () => {
    // C'est tout l'intérêt : reconnaître une ligne sans la lire.
    expect(avatarColor('À lolo')).not.toBe(avatarColor('Alloco'));
  });

  it('rend toujours une couleur lisible sur blanc', () => {
    for (const nom of ['À lolo', 'Alloco', 'Attiéké', 'Bissap', '']) {
      expect(avatarColor(nom)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
