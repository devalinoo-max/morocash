import { z } from 'zod';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { verifyPin } from './pin';
import { issueSessionToken } from './session';
import { assertNotRateLimited, recordFailedAttempt, clearRateLimit, phoneKey, ipKey } from '@/server/middleware/rateLimit';

export const loginSchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  pin: z.string().regex(/^\d{6}$/, 'Le code doit comporter exactement 6 chiffres'),
  businessId: z.string().cuid().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export interface BusinessChoice {
  businessId: string;
  businessNom: string;
}

export type LoginResult =
  | { status: 'REQUIRES_BUSINESS_SELECTION'; businesses: BusinessChoice[] }
  | { status: 'OK'; userId: string; businessId: string; sessionToken: string };

/**
 * Un même numéro peut exister dans plusieurs boutiques (@@unique([businessId, telephone])).
 * Si le numéro correspond à plusieurs boutiques et qu'aucune n'est précisée, on renvoie
 * la liste pour que le client demande laquelle (spec §5) — sans jamais divulguer si le
 * PIN était correct pour l'une d'elles avant sélection.
 */
export async function login(
  input: LoginInput,
  meta: { ip?: string; userAgent?: string }
): Promise<LoginResult> {
  const rlPhone = phoneKey(input.telephone);
  const rlIp = meta.ip ? ipKey(meta.ip) : null;

  await assertNotRateLimited(rlPhone);
  if (rlIp) await assertNotRateLimited(rlIp);

  const candidates = await prisma.user.findMany({
    where: { telephone: input.telephone, actif: true },
    include: { business: true },
  });

  if (candidates.length === 0) {
    await recordFailedAttempt(rlPhone);
    if (rlIp) await recordFailedAttempt(rlIp);
    throw new AppError('AUTH_INVALID_PIN', 'Numéro ou code incorrect.');
  }

  if (candidates.length > 1 && !input.businessId) {
    return {
      status: 'REQUIRES_BUSINESS_SELECTION',
      businesses: candidates.map((c) => ({ businessId: c.businessId, businessNom: c.business.nom })),
    };
  }

  const target = input.businessId
    ? candidates.find((c) => c.businessId === input.businessId)
    : candidates[0];

  if (!target) {
    await recordFailedAttempt(rlPhone);
    if (rlIp) await recordFailedAttempt(rlIp);
    throw new AppError('AUTH_INVALID_PIN', 'Numéro ou code incorrect.');
  }

  const valid = await verifyPin(input.pin, target.codeHash);
  if (!valid) {
    await recordFailedAttempt(rlPhone);
    if (rlIp) await recordFailedAttempt(rlIp);
    throw new AppError('AUTH_INVALID_PIN', 'Numéro ou code incorrect.');
  }

  await clearRateLimit(rlPhone);
  if (rlIp) await clearRateLimit(rlIp);

  // Reconnexion après une fermeture volontaire du compte (voir closeAccount.ts)
  // : la boutique était en lecture seule, la reconnexion dans le délai annoncé
  // dans l'UI ("90 jours") restaure l'accès complet, sans jamais toucher une
  // boutique SUSPENDU par le back-office admin (statut distinct, volontaire).
  if (target.business.statut === 'RESILIE') {
    await prisma.business.update({
      where: { id: target.businessId },
      data: { statut: 'ACTIF', deletedAt: null },
    });
  }

  await prisma.user.update({ where: { id: target.id }, data: { lastLoginAt: new Date() } });
  const sessionToken = await issueSessionToken(target.id, meta);

  return { status: 'OK', userId: target.id, businessId: target.businessId, sessionToken };
}
