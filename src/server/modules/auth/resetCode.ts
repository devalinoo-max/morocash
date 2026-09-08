import { z } from 'zod';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { requestOtp, confirmOtp } from './otp';
import { hashPin } from './pin';

export const resetRequestSchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
});

export const resetConfirmSchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  code: z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres'),
  businessId: z.string().cuid(),
  newPin: z.string().regex(/^\d{6}$/, 'Le nouveau code doit comporter exactement 6 chiffres'),
});

export async function requestPinReset(telephone: string): Promise<void> {
  await requestOtp(telephone);
}

export async function confirmPinReset(input: z.infer<typeof resetConfirmSchema>): Promise<void> {
  await confirmOtp(input.telephone, input.code);

  const user = await prisma.user.findUnique({
    where: { businessId_telephone: { businessId: input.businessId, telephone: input.telephone } },
  });
  if (!user) {
    throw new AppError('AUTH_INVALID_PIN', 'Compte introuvable pour cette boutique.');
  }

  const codeHash = await hashPin(input.newPin);
  await prisma.user.update({ where: { id: user.id }, data: { codeHash } });
}
