import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { AppError } from '@/server/shared/errors';
import { requestOtp, confirmOtp, verifyOtp, type OtpTarget } from '@/server/modules/auth/otp';
import { hashPin } from '@/server/modules/auth/pin';
import { findAffiliateByEmail, findAffiliateByPhone, setAffiliatePin } from '@/server/repositories/affiliates';

/**
 * « Mot de passe oublié ? » de l'espace affilié : même code à 6 chiffres que
 * pour les boutiques (table OtpCode), envoyé au numéro WhatsApp du compte
 * affilié ou à l'e-mail qu'il a donné à l'inscription. Le code prouve la
 * possession du numéro ou de l'adresse, quel que soit l'espace qui l'a demandé.
 */
const targetSchema = z
  .object({
    canal: z.enum(['WHATSAPP', 'EMAIL']).default('WHATSAPP'),
    telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide').optional(),
    email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(180).optional(),
  })
  .refine((v) => (v.canal === 'EMAIL' ? !!v.email : !!v.telephone), {
    message: 'Indique ton numéro WhatsApp ou ton adresse e-mail.',
  });

const code = z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres');

export const affiliateResetRequestSchema = targetSchema;
export const affiliateResetVerifySchema = targetSchema.and(z.object({ code }));
export const affiliateResetConfirmSchema = targetSchema.and(
  z.object({
    code,
    newPin: z.string().regex(/^\d{6}$/, 'Le nouveau mot de passe doit comporter exactement 6 chiffres'),
  })
);

type TargetInput = z.infer<typeof targetSchema>;

function toTarget(input: TargetInput): OtpTarget {
  return input.canal === 'EMAIL'
    ? { canal: 'EMAIL', email: input.email! }
    : { canal: 'WHATSAPP', telephone: input.telephone! };
}

async function findAccount(target: OtpTarget) {
  const affiliate =
    target.canal === 'EMAIL' ? await findAffiliateByEmail(target.email) : await findAffiliateByPhone(target.telephone);
  return affiliate?.actif ? affiliate : null;
}

/** Réponse identique que le compte existe ou non. */
export async function requestAffiliatePinReset(input: TargetInput): Promise<void> {
  const target = toTarget(input);
  if (!(await findAccount(target))) return;
  try {
    await requestOtp(target);
  } catch (error) {
    console.error('[affiliate reset-code] envoi du code', { canal: target.canal, error });
    Sentry.captureException(error);
  }
}

/** Vérifie le code sans le consommer (écran suivant : le nouveau mot de passe). */
export async function verifyAffiliatePinReset(input: TargetInput & { code: string }): Promise<void> {
  await verifyOtp(toTarget(input), input.code);
}

export async function confirmAffiliatePinReset(input: TargetInput & { code: string; newPin: string }): Promise<void> {
  const target = toTarget(input);
  await confirmOtp(target, input.code);
  const affiliate = await findAccount(target);
  if (!affiliate) throw new AppError('AUTH_INVALID_PIN', 'Compte introuvable.');
  await setAffiliatePin(affiliate.id, await hashPin(input.newPin));
}
