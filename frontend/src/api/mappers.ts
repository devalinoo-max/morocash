import type { PaymentMethod, PaymentStatus } from '../types';

// Le frontend utilise 'CASH', le backend utilise 'ESPECES' (spec) — seule
// différence de nommage entre les deux enums, sinon identiques.
export function toApiPaymentMethode(method: PaymentMethod): string {
  return method === 'CASH' ? 'ESPECES' : method;
}

export function toFrontendPaymentMethod(methode: string): PaymentMethod {
  if (methode === 'ESPECES' || methode === 'AUTRE') return 'CASH';
  return methode as PaymentMethod;
}

export function toFrontendPaymentStatus(statutPaiement: string): PaymentStatus {
  switch (statutPaiement) {
    case 'PAYEE':
      return 'PAID';
    case 'PARTIELLE':
      return 'PARTIAL';
    default:
      return 'CREDIT';
  }
}
