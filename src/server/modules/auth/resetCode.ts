import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { requestOtp, confirmOtp, verifyOtp, type OtpTarget } from './otp';
import { hashPin } from './pin';

/**
 * Canal du code : WhatsApp (numéro d'un compte) ou e-mail (celui de la
 * boutique, renseigné à l'inscription). Sans `canal`, WhatsApp, comme avant.
 */
const targetShape = {
  canal: z.enum(['WHATSAPP', 'EMAIL']).default('WHATSAPP'),
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide').optional(),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(180).optional(),
};

function hasTarget(v: { canal: 'WHATSAPP' | 'EMAIL'; telephone?: string; email?: string }): boolean {
  return v.canal === 'EMAIL' ? !!v.email : !!v.telephone;
}
const targetMessage = { message: 'Indique ton numéro WhatsApp ou ton adresse e-mail.' };

export const resetRequestSchema = z.object(targetShape).refine(hasTarget, targetMessage);

export const resetVerifySchema = z
  .object({ ...targetShape, code: z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres') })
  .refine(hasTarget, targetMessage);

export const resetConfirmSchema = z
  .object({
    ...targetShape,
    code: z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres'),
    // Facultatif : nécessaire seulement quand le numéro ouvre plusieurs
    // boutiques. Le parcours à l'écran le renseigne à partir de la liste renvoyée
    // par verifyPinReset.
    businessId: z.string().cuid().optional(),
    newPin: z.string().regex(/^\d{6}$/, 'Le nouveau mot de passe doit comporter exactement 6 chiffres'),
  })
  .refine(hasTarget, targetMessage);

type TargetInput = { canal: 'WHATSAPP' | 'EMAIL'; telephone?: string; email?: string };

function toTarget(input: TargetInput): OtpTarget {
  return input.canal === 'EMAIL'
    ? { canal: 'EMAIL', email: input.email! }
    : { canal: 'WHATSAPP', telephone: input.telephone! };
}

export interface ResetBusinessChoice {
  businessId: string;
  businessNom: string;
}

/** Réponse identique que le compte existe ou non : l'app ne révèle jamais un numéro ou un e-mail enregistré. */
export const RESET_REQUEST_MESSAGE = "Si ce compte existe, un code vient d'être envoyé.";

/**
 * Le code ne part que vers un compte existant (jamais vers un numéro ou une
 * adresse au hasard), mais la réponse ne le laisse pas deviner.
 */
export async function requestPinReset(input: TargetInput): Promise<void> {
  const target = toTarget(input);
  const accounts = await listResetAccounts(target);
  if (accounts.length === 0) return;
  try {
    await requestOtp(target);
  } catch (error) {
    // Un échec d'envoi (WhatsApp ou e-mail indisponible) ne doit pas se
    // distinguer d'un compte inexistant : on le signale, sans le montrer.
    console.error('[reset-code] envoi du code', { canal: target.canal, error });
    Sentry.captureException(error);
  }
}

/**
 * Écran 2 du parcours « PIN oublié » : le code reçu est vérifié SANS être
 * consommé, pour que l'écran 3 (choix du nouveau PIN) puisse encore s'en
 * servir. On renvoie les boutiques rattachées afin que l'utilisateur désigne
 * la bonne quand il en a plusieurs.
 */
export async function verifyPinReset(input: z.infer<typeof resetVerifySchema>): Promise<ResetBusinessChoice[]> {
  const target = toTarget(input);
  await verifyOtp(target, input.code);
  return (await listResetAccounts(target)).map(({ businessId, businessNom }) => ({ businessId, businessNom }));
}

export async function confirmPinReset(input: z.infer<typeof resetConfirmSchema>): Promise<void> {
  const target = toTarget(input);
  await confirmOtp(target, input.code);

  const accounts = await listResetAccounts(target);
  if (accounts.length === 0) {
    throw new AppError('AUTH_INVALID_PIN', 'Compte introuvable.');
  }

  const businessId = input.businessId ?? (accounts.length === 1 ? accounts[0].businessId : null);
  const account = accounts.find((a) => a.businessId === businessId);
  if (!account) {
    throw new AppError('VALIDATION_ERROR', 'Indique la boutique dont tu veux changer le code.');
  }

  const codeHash = await hashPin(input.newPin);
  await prisma.$transaction([
    prisma.user.update({ where: { id: account.userId }, data: { codeHash } }),
    prisma.auditLog.create({
      data: {
        businessId: account.businessId,
        userId: account.userId,
        action: 'USER_PASSWORD_RESET',
        entite: 'User',
        entiteId: account.userId,
        nouvellesValeurs: { canal: target.canal },
      },
    }),
  ]);
}

/**
 * Comptes concernés par une réinitialisation : par WhatsApp, chaque compte
 * actif sur ce numéro ; par e-mail, le propriétaire de la boutique qui a
 * renseigné cette adresse (l'e-mail appartient à la boutique, pas aux employés).
 */
async function listResetAccounts(
  target: OtpTarget
): Promise<{ userId: string; businessId: string; businessNom: string }[]> {
  const users = await prisma.user.findMany({
    where:
      target.canal === 'EMAIL'
        ? { actif: true, role: 'OWNER', business: { email: target.email } }
        : { actif: true, telephone: target.telephone },
    include: { business: { select: { nom: true } } },
  });
  return users.map((u) => ({ userId: u.id, businessId: u.businessId, businessNom: u.business.nom }));
}
