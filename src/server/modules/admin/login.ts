import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { assertNotRateLimited, recordFailedAttempt, clearRateLimit } from '@/server/middleware/rateLimit';
import { issueAdminSessionToken } from './session';

export const adminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

function adminKey(email: string): string {
  return `admin-login:${email}`;
}

/**
 * email + mot de passe uniquement — le 2FA TOTP a été retiré à la demande de
 * l'exploitant (AdminUser.totpSecret reste en base, non utilisé). Réutilise le
 * même compteur de blocage que la connexion tenant (spec §5, 5 échecs → 5 min).
 */
export async function loginAdmin(input: AdminLoginInput): Promise<string> {
  const key = adminKey(input.email);
  await assertNotRateLimited(key);

  const admin = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (!admin || !admin.actif) {
    await recordFailedAttempt(key);
    throw new AppError('AUTH_INVALID_PIN', 'Identifiants administrateur invalides.');
  }

  const passwordOk = await bcrypt.compare(input.password, admin.passwordHash);
  if (!passwordOk) {
    await recordFailedAttempt(key);
    throw new AppError('AUTH_INVALID_PIN', 'Identifiants administrateur invalides.');
  }

  await clearRateLimit(key);
  return issueAdminSessionToken(admin.id);
}
