import { collectOrderPayment, versementSchema, type VersementInput } from '@/server/modules/payments/versements';

// Encaisser sur une commande précise : la règle vit dans payments/versements.ts,
// avec celle de l'encaissement depuis « Qui me doit ».
export const addOrderPaymentSchema = versementSchema;
export type AddOrderPaymentInput = VersementInput;
export const addOrderPayment = collectOrderPayment;
