import { describe, expect, it } from 'vitest';
import { maskPhone, normalizePhone, phonesMatch } from '@/server/modules/auth/whatsapp/phone';

// Normalisation E.164 (sans « + ») et comparaison de comptes — sans base ni Meta.
// L'arrivée réelle du code et la connexion passent par l'envoi Meta : à tester à la main.

describe('normalizePhone', () => {
  it('numéro français +33 6 12 34 56 78', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('33612345678');
    expect(normalizePhone('06 12 34 56 78', 'FR')).toBe('33612345678');
  });

  it('numéro sénégalais +221 77 123 45 67', () => {
    expect(normalizePhone('+221 77 123 45 67')).toBe('221771234567');
    expect(normalizePhone('77 123 45 67', 'SN')).toBe('221771234567');
  });

  it('numéro ivoirien avec espaces, points, tirets, +225 ou 00225 : 10 chiffres, 0 de tête gardé', () => {
    for (const raw of ['01 70 34 58 08', '+225 01.70.34.58.08', '0170-34-58-08', '00225 0170345808', '2250170345808']) {
      expect(normalizePhone(raw.startsWith('225') ? `+${raw}` : raw)).toBe('2250170345808');
    }
  });

  it('numéro invalide pour son pays : refusé', () => {
    expect(normalizePhone('01703458')).toBeNull(); // 8 chiffres en Côte d'Ivoire
    expect(normalizePhone('12345', 'FR')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });
});

describe('phonesMatch', () => {
  const target = '2250170345808';

  it('deux saisies différentes du même numéro retrouvent le même compte', () => {
    for (const stored of ['0170345808', '01 70 34 58 08', '+225 0170345808', '2250170345808']) {
      expect(phonesMatch(stored, 'CI', target)).toBe(true);
    }
  });

  it('un autre numéro ne correspond pas', () => {
    expect(phonesMatch('0170345809', 'CI', target)).toBe(false);
    expect(phonesMatch('0612345678', 'FR', target)).toBe(false);
  });

  it('compte enregistré hors Côte d\'Ivoire', () => {
    expect(phonesMatch('771234567', 'SN', '221771234567')).toBe(true);
    expect(phonesMatch('0612345678', 'FR', '33612345678')).toBe(true);
  });
});

describe('maskPhone', () => {
  it('ne laisse voir que le début et les 2 derniers chiffres', () => {
    expect(maskPhone('2250170345808')).toBe('+225 01 XX XX XX 08');
  });
});
