import type { PaymentMethod } from '../types';

/**
 * Couleurs des moyens de paiement.
 *
 * Ce sont celles des opérateurs eux-mêmes : le commerçant reconnaît le bleu
 * de Wave ou l'orange d'Orange Money avant d'avoir lu le mot. Moov et le
 * virement restent gris, faute d'une couleur que tout le monde associe.
 */
const COULEURS: Record<PaymentMethod, { bg: string; fg: string }> = {
  CASH: { bg: '#DCFCE7', fg: '#166534' },
  WAVE: { bg: '#00C3F7', fg: '#FFFFFF' },
  ORANGE_MONEY: { bg: '#FF6600', fg: '#FFFFFF' },
  MTN: { bg: '#FFCC00', fg: '#3F2D00' },
  MOOV: { bg: '#E2E8F0', fg: '#475569' },
  VIREMENT: { bg: '#E2E8F0', fg: '#475569' },
};

export function paymentMethodColors(method: PaymentMethod) {
  return COULEURS[method] ?? COULEURS.CASH;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'WAVE',
  'ORANGE_MONEY',
  'MTN',
  'MOOV',
  'VIREMENT',
];
