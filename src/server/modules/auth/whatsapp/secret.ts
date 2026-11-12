import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '@/server/shared/errors';

/** Clé de chiffrement des codes et des jetons. Absente : on refuse plutôt que de hasher sans clé. */
function otpSecret(): string {
  const secret = process.env.OTP_SECRET;
  if (!secret) {
    console.error('[otp] OTP_SECRET absent : connexion par code indisponible.');
    throw new AppError('SERVER_ERROR', 'Service momentanément indisponible.');
  }
  return secret;
}

/** HMAC-SHA256 (hex) — jamais le code en clair en base. */
export function hmacHex(message: string): string {
  return createHmac('sha256', otpSecret()).update(message).digest('hex');
}

/** Le code est lié au numéro et à l'usage : un code de connexion ne sert pas à réinitialiser. */
export function hashOtp(phone: string, purpose: string, code: string): string {
  return hmacHex(`otp:${phone}:${purpose}:${code}`);
}

export function hashResetToken(token: string): string {
  return hmacHex(`reset:${token}`);
}

/** Comparaison à temps constant de deux chaînes (longueurs différentes : faux). */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}
