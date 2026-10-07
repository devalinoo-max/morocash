import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { sendWhatsApp } from '@/server/integrations/whatsapp';
import { sendEmail } from '@/server/integrations/email';

// Code de réinitialisation, par WhatsApp (repli SMS si l'API WhatsApp n'est
// pas configurée) ou par e-mail : 6 chiffres, hashé, valable 10 minutes,
// utilisable une fois, 3 tentatives, 3 demandes par compte et par heure.
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const OTP_MAX_REQUESTS_PER_HOUR = 3;
const OTP_HASH_COST = 12;

/** Où part le code : le numéro WhatsApp d'un compte, ou l'e-mail d'une boutique. */
export type OtpTarget = { canal: 'WHATSAPP'; telephone: string } | { canal: 'EMAIL'; email: string };

function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function whereTarget(target: OtpTarget): Prisma.OtpCodeWhereInput {
  return target.canal === 'EMAIL'
    ? { canal: 'EMAIL', email: target.email }
    : { canal: 'WHATSAPP', telephone: target.telephone };
}

/**
 * Envoie un code. Au-delà de 3 demandes dans l'heure, rien ne part, sans
 * erreur : la réponse à l'écran reste la même dans tous les cas.
 */
export async function requestOtp(target: OtpTarget): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: { ...whereTarget(target), createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= OTP_MAX_REQUESTS_PER_HOUR) return;

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, OTP_HASH_COST);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.otpCode.create({
    data: {
      canal: target.canal,
      telephone: target.canal === 'WHATSAPP' ? target.telephone : null,
      email: target.canal === 'EMAIL' ? target.email : null,
      codeHash,
      expiresAt,
    },
  });

  if (target.canal === 'EMAIL') {
    // Le code et sa durée de validité, rien d'autre.
    await sendEmail({
      to: target.email,
      subject: 'Ton code MoroCash',
      text: `Ton code MoroCash : ${code}\nIl est valable ${OTP_TTL_MINUTES} minutes.`,
    });
    return;
  }
  await sendWhatsApp(
    target.telephone,
    `Votre code MoroCash : ${code} (valable ${OTP_TTL_MINUTES} min). Ne le communiquez à personne.`
  );
}

/**
 * Vérifie un code sans le marquer comme utilisé.
 *
 * Le parcours « PIN oublié » se fait en deux écrans : on valide d'abord le code
 * reçu, on demande ensuite le nouveau PIN. Sans cette vérification à blanc, un
 * code correct serait consommé à l'écran 2 et le choix du PIN à l'écran 3
 * échouerait. Les tentatives ratées comptent malgré tout : la vérification à
 * blanc n'est pas un oracle gratuit.
 */
export async function verifyOtp(target: OtpTarget, code: string): Promise<void> {
  await checkOtp(target, code, { consume: false });
}

export async function confirmOtp(target: OtpTarget, code: string): Promise<void> {
  await checkOtp(target, code, { consume: true });
}

async function checkOtp(target: OtpTarget, code: string, { consume }: { consume: boolean }): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { ...whereTarget(target), usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) {
    throw new AppError('AUTH_INVALID_PIN', 'Code invalide ou expiré.');
  }
  if (otp.tentatives >= OTP_MAX_ATTEMPTS) {
    throw new AppError('AUTH_TOO_MANY_ATTEMPTS', 'Trop de tentatives pour ce code.');
  }

  const valid = await bcrypt.compare(code, otp.codeHash);
  if (!valid) {
    await prisma.otpCode.update({ where: { id: otp.id }, data: { tentatives: { increment: 1 } } });
    throw new AppError('AUTH_INVALID_PIN', 'Code invalide.');
  }

  if (consume) {
    // Usage unique, même si deux confirmations arrivent en même temps.
    const used = await prisma.otpCode.updateMany({ where: { id: otp.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count === 0) throw new AppError('AUTH_INVALID_PIN', 'Code invalide ou expiré.');
  }
}
