import { z } from 'zod';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { requestOtp, confirmOtp, verifyOtp } from './otp';
import { hashPin } from './pin';

export const resetRequestSchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
});

export const resetVerifySchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  code: z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres'),
});

export const resetConfirmSchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  code: z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres'),
  // Facultatif : nécessaire seulement quand le numéro ouvre plusieurs
  // boutiques. Le parcours à l'écran le renseigne à partir de la liste renvoyée
  // par verifyPinReset.
  businessId: z.string().cuid().optional(),
  newPin: z.string().regex(/^\d{6}$/, 'Le nouveau code doit comporter exactement 6 chiffres'),
});

export interface ResetBusinessChoice {
  businessId: string;
  businessNom: string;
}

export async function requestPinReset(telephone: string): Promise<void> {
  await requestOtp(telephone);
}

/**
 * Écran 2 du parcours « PIN oublié » : le code reçu par WhatsApp est vérifié
 * SANS être consommé, pour que l'écran 3 (choix du nouveau PIN) puisse encore
 * s'en servir. On renvoie les boutiques rattachées au numéro afin que
 * l'utilisateur désigne la bonne quand il en a plusieurs.
 */
export async function verifyPinReset(
  input: z.infer<typeof resetVerifySchema>
): Promise<ResetBusinessChoice[]> {
  await verifyOtp(input.telephone, input.code);
  return listResetTargets(input.telephone);
}

export async function confirmPinReset(input: z.infer<typeof resetConfirmSchema>): Promise<void> {
  await confirmOtp(input.telephone, input.code);

  const targets = await listResetTargets(input.telephone);
  if (targets.length === 0) {
    throw new AppError('AUTH_INVALID_PIN', 'Aucun compte MoroCash sur ce numéro.');
  }

  const businessId = input.businessId ?? (targets.length === 1 ? targets[0].businessId : null);
  if (!businessId || !targets.some((t) => t.businessId === businessId)) {
    throw new AppError('VALIDATION_ERROR', 'Indique la boutique dont tu veux changer le code.');
  }

  const user = await prisma.user.findUnique({
    where: { businessId_telephone: { businessId, telephone: input.telephone } },
  });
  if (!user) {
    throw new AppError('AUTH_INVALID_PIN', 'Compte introuvable pour cette boutique.');
  }

  const codeHash = await hashPin(input.newPin);
  await prisma.user.update({ where: { id: user.id }, data: { codeHash } });
}

async function listResetTargets(telephone: string): Promise<ResetBusinessChoice[]> {
  const users = await prisma.user.findMany({
    where: { telephone, actif: true },
    include: { business: { select: { nom: true } } },
  });
  return users.map((u) => ({ businessId: u.businessId, businessNom: u.business.nom }));
}
