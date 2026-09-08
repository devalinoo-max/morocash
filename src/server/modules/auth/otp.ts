import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { sendSms } from '@/server/integrations/sms';

// OTP par SMS, 6 chiffres, hashé, valable 10 minutes, 3 tentatives,
// 3 demandes par numéro et par heure (spec §5).
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 3;
const OTP_MAX_REQUESTS_PER_HOUR = 3;
const OTP_HASH_COST = 12;

function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function requestOtp(telephone: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.otpCode.count({
    where: { telephone, createdAt: { gte: oneHourAgo } },
  });
  if (recentCount >= OTP_MAX_REQUESTS_PER_HOUR) {
    throw new AppError('AUTH_TOO_MANY_ATTEMPTS', 'Trop de demandes de code, réessayez plus tard.');
  }

  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, OTP_HASH_COST);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await prisma.otpCode.create({ data: { telephone, codeHash, expiresAt } });
  await sendSms(telephone, `Votre code MoroCash : ${code} (valable ${OTP_TTL_MINUTES} min)`);
}

export async function confirmOtp(telephone: string, code: string): Promise<void> {
  const otp = await prisma.otpCode.findFirst({
    where: { telephone, usedAt: null, expiresAt: { gt: new Date() } },
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

  await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: new Date() } });
}
