import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { assertNotRateLimited, recordFailedAttempt, clearRateLimit, ipKey } from '@/server/middleware/rateLimit';
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
 * même compteur de blocage que la connexion tenant (spec §5, 5 échecs → 5 min),
 * appliqué par e-mail ET par IP : le back-office est cross-tenant, on ne laisse
 * pas une seule IP essayer plusieurs comptes admin sans jamais être freinée.
 */
export async function loginAdmin(
  input: AdminLoginInput,
  meta: { ip?: string } = {}
): Promise<string> {
  const key = adminKey(input.email);
  const rlIp = meta.ip ? ipKey(meta.ip) : null;

  await assertNotRateLimited(key);
  if (rlIp) await assertNotRateLimited(rlIp);

  const recordFailure = async () => {
    await recordFailedAttempt(key);
    if (rlIp) await recordFailedAttempt(rlIp);
  };

  const admin = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (!admin || !admin.actif) {
    await recordFailure();
    throw new AppError('AUTH_INVALID_PIN', 'Identifiants administrateur invalides.');
  }

  const passwordOk = await bcrypt.compare(input.password, admin.passwordHash);
  if (!passwordOk) {
    await recordFailure();
    throw new AppError('AUTH_INVALID_PIN', 'Identifiants administrateur invalides.');
  }

  await clearRateLimit(key);
  if (rlIp) await clearRateLimit(rlIp);
  return issueAdminSessionToken(admin.id);
}
