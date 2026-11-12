import { randomBytes, randomInt } from 'crypto';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import type { OtpPurpose, Prisma } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { AppError } from '@/server/shared/errors';
import { sendWhatsappCode } from '@/server/integrations/whatsapp/otpTemplate';
import { clearRateLimit, phoneKey } from '@/server/middleware/rateLimit';
import { openSessionForUser } from '../login';
import { hashPin, verifyPin } from '../pin';
import { normalizePhone, phoneTail, phonesMatch } from './phone';
import { hashOtp, hashResetToken, safeEqual } from './secret';

// ─── Règles de sécurité (cahier des charges §4) ───────────────────────────
const CODE_TTL_MS = 5 * 60 * 1000; // durée de vie d'un code
const MAX_ATTEMPTS = 3; // essais par code, puis il est annulé
const RESEND_DELAY_MS = 60 * 1000; // délai entre deux envois au même numéro
const MAX_PER_PHONE_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Message unique de la demande de code : le numéro ait un compte ou non. */
export const OTP_REQUEST_MESSAGE = "Si ce numéro a un compte MoroCash, un code vient d'être envoyé sur WhatsApp.";

const INVALID_PHONE_MESSAGE = "Ce numéro n'est pas valide. Exemple : 01 70 34 58 08";
const SEND_FAILED_MESSAGE = "Impossible d'envoyer le code. Réessaie dans une minute.";
const purposeSchema = z.enum(['LOGIN', 'PASSWORD_RESET']);
const codeSchema = z.string().regex(/^\d{6}$/, 'Le code doit comporter 6 chiffres');

// `country` (ISO 3166-1 alpha-2) ne sert que si le numéro est tapé sans indicatif.
const countrySchema = z.string().length(2).optional();

export const otpRequestSchema = z.object({
  phone: z.string().trim().min(1).max(32),
  country: countrySchema,
  purpose: purposeSchema,
});

export const otpVerifySchema = z.object({
  phone: z.string().trim().min(1).max(32),
  country: countrySchema,
  purpose: purposeSchema,
  code: codeSchema,
  // Seulement quand le numéro ouvre plusieurs boutiques (2e appel, même code).
  businessId: z.string().cuid().optional(),
});

export const passwordResetSchema = z.object({
  resetToken: z.string().regex(/^[a-f0-9]{64}$/, 'Lien de réinitialisation invalide.'),
  // Le mot de passe MoroCash est un code de 6 chiffres (voir loginSchema).
  newPin: z.string().regex(/^\d{6}$/, 'Le nouveau mot de passe doit comporter exactement 6 chiffres'),
});

type UserWithBusiness = Prisma.UserGetPayload<{ include: { business: true } }>;

export interface BusinessChoice {
  businessId: string;
  businessNom: string;
}

function toChoices(users: UserWithBusiness[]): BusinessChoice[] {
  return users.map((u) => ({ businessId: u.businessId, businessNom: u.business.nom }));
}

function requirePhone(raw: string, country?: string): string {
  const phone = normalizePhone(raw, country);
  if (!phone) throw new AppError('VALIDATION_ERROR', INVALID_PHONE_MESSAGE);
  return phone;
}

/** Seuls les comptes actifs reçoivent un code : un employé désactivé ne se connecte pas. */
async function findActiveUsers(phone: string): Promise<UserWithBusiness[]> {
  // Les numéros enregistrés n'ont pas tous le même format (avec ou sans
  // indicatif, séparateurs) : un filtre large sur les 8 derniers chiffres,
  // séparateurs ignorés, puis comparaison après normalisation. Les données
  // existantes ne sont pas modifiées.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User"
    WHERE "actif" = true
      AND regexp_replace("telephone", '[^0-9]', '', 'g') LIKE ${'%' + phoneTail(phone)}`;
  if (rows.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { business: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.filter((u) => phonesMatch(u.telephone, u.business.pays, phone));
}

/** 6 chiffres, `crypto.randomInt` (jamais Math.random), zéros à gauche. */
export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// ─── Demande d'un code ────────────────────────────────────────────────────

/**
 * Applique les limites, annule l'ancien code, crée le nouveau et l'envoie.
 *
 * Numéro sans compte actif : aucun envoi (pas de coût chez Meta, pas de fuite
 * d'information), mais une ligne « non envoyée » est tout de même écrite pour
 * que les limites et les réponses restent identiques dans les deux cas.
 */
export async function requestWhatsappCode(
  input: z.infer<typeof otpRequestSchema>,
  meta: { ip?: string }
): Promise<void> {
  const phone = requirePhone(input.phone, input.country);
  const purpose: OtpPurpose = input.purpose;
  const hasAccount = (await findActiveUsers(phone)).length > 0;
  const code = hasAccount ? generateCode() : null;

  const row = await prisma.$transaction(async (tx) => {
    // Un verrou par numéro : trois appuis très rapides sur le bouton ne
    // passent pas tous les limites en même temps (un seul message part).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;

    const now = new Date();
    const last = await tx.whatsappOtp.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (last && now.getTime() - last.createdAt.getTime() < RESEND_DELAY_MS) {
      throw new AppError('OTP_COOLDOWN', 'Patiente 60 secondes avant de redemander un code.');
    }

    const since = new Date(now.getTime() - HOUR_MS);
    const phoneCount = await tx.whatsappOtp.count({ where: { phone, createdAt: { gte: since } } });
    if (phoneCount >= MAX_PER_PHONE_PER_HOUR) {
      throw new AppError('RATE_LIMITED', 'Trop de demandes. Réessaie dans une heure.');
    }
    if (meta.ip) {
      const ipCount = await tx.whatsappOtp.count({ where: { ip: meta.ip, createdAt: { gte: since } } });
      if (ipCount >= MAX_PER_IP_PER_HOUR) {
        throw new AppError('RATE_LIMITED', 'Trop de demandes. Réessaie dans une heure.');
      }
    }

    // Un nouveau code annule l'ancien encore valide (on marque, on ne supprime pas).
    await tx.whatsappOtp.updateMany({
      where: { phone, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    return tx.whatsappOtp.create({
      data: {
        phone,
        purpose,
        // Numéro inconnu : empreinte aléatoire que personne ne peut deviner, ligne déjà « utilisée ».
        codeHash: code ? hashOtp(phone, purpose, code) : randomBytes(32).toString('hex'),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        usedAt: code ? null : now,
        waStatus: code ? null : 'not_sent',
        ip: meta.ip ?? null,
      },
      select: { id: true },
    });
  });

  if (!code) return;

  try {
    const waMessageId = await sendWhatsappCode(phone, code);
    await prisma.whatsappOtp.update({ where: { id: row.id }, data: { waMessageId, waStatus: 'sent' } });
  } catch (error) {
    // L'envoi a échoué : le code ne servirait à rien, on l'annule. Le journal
    // est déjà écrit par sendWhatsappCode, sans le code ni le jeton.
    await prisma.whatsappOtp
      .update({ where: { id: row.id }, data: { usedAt: new Date(), waStatus: 'failed' } })
      .catch(() => undefined);
    Sentry.captureException(error, { tags: { area: 'whatsapp-otp-send' } });
    throw new AppError('OTP_SEND_FAILED', SEND_FAILED_MESSAGE);
  }
}

// ─── Vérification d'un code ───────────────────────────────────────────────

/**
 * Contrôle un code. `consume: false` le laisse utilisable : sert quand le
 * numéro ouvre plusieurs boutiques et qu'il faut encore en choisir une.
 */
async function checkCode(
  phone: string,
  purpose: OtpPurpose,
  code: string,
  { consume }: { consume: boolean }
): Promise<void> {
  const otp = await prisma.whatsappOtp.findFirst({
    where: { phone, purpose },
    orderBy: { createdAt: 'desc' },
  });

  const tooMany = () => new AppError('AUTH_TOO_MANY_ATTEMPTS', "Trop d'essais. Demande un nouveau code.");
  if (!otp) throw new AppError('OTP_INVALID', "Ce code n'est plus valable. Demande-en un nouveau.");
  if (otp.attempts >= MAX_ATTEMPTS) throw tooMany();
  if (otp.usedAt) throw new AppError('OTP_INVALID', "Ce code n'est plus valable. Demande-en un nouveau.");
  if (otp.expiresAt.getTime() <= Date.now()) {
    throw new AppError('OTP_EXPIRED', 'Ce code a expiré. Demande-en un nouveau.');
  }

  // L'essai est compté AVANT la comparaison, en une seule requête : des essais
  // simultanés ne peuvent pas dépasser 3 au total.
  const counted = await prisma.$queryRaw<{ attempts: number }[]>`
    UPDATE "WhatsappOtp" SET "attempts" = "attempts" + 1
    WHERE "id" = ${otp.id} AND "attempts" < ${MAX_ATTEMPTS} AND "usedAt" IS NULL
    RETURNING "attempts"`;
  if (counted.length === 0) throw tooMany();
  const attempts = counted[0].attempts;

  if (!safeEqual(hashOtp(phone, purpose, code), otp.codeHash)) {
    const remaining = MAX_ATTEMPTS - attempts;
    if (remaining <= 0) throw tooMany();
    throw new AppError('OTP_INVALID', `Code incorrect. Il te reste ${remaining} essai${remaining > 1 ? 's' : ''}.`);
  }

  if (consume) {
    // Usage unique, même si deux requêtes portent le bon code en même temps.
    const used = await prisma.whatsappOtp.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count === 0) throw new AppError('OTP_INVALID', "Ce code n'est plus valable. Demande-en un nouveau.");
  } else {
    // Bon code gardé pour le 2e appel : cet essai-là ne doit pas compter.
    await prisma.whatsappOtp.update({ where: { id: otp.id }, data: { attempts: { decrement: 1 } } });
  }
}

/** Choisit le compte visé ; null tant qu'il faut demander la boutique. */
function pickTarget(users: UserWithBusiness[], businessId?: string): UserWithBusiness | null {
  if (businessId) return users.find((u) => u.businessId === businessId) ?? null;
  return users.length === 1 ? users[0] : null;
}

const NO_ACCOUNT_MESSAGE = 'Ce compte est désactivé ou introuvable. Contacte le propriétaire de la boutique.';

export type LoginCodeResult =
  | { status: 'REQUIRES_BUSINESS_SELECTION'; businesses: BusinessChoice[] }
  | { status: 'OK'; userId: string; businessId: string; sessionToken: string };

/** Connexion par code : bon code, compte actif → même session que le mot de passe. */
export async function verifyLoginCode(
  input: z.infer<typeof otpVerifySchema>,
  meta: { ip?: string; userAgent?: string }
): Promise<LoginCodeResult> {
  const phone = requirePhone(input.phone, input.country);
  const users = await findActiveUsers(phone);
  const target = pickTarget(users, input.businessId);

  // Le code n'est consommé que lorsqu'on sait quel compte ouvrir.
  await checkCode(phone, 'LOGIN', input.code, { consume: !!target });

  if (users.length === 0) throw new AppError('AUTH_INVALID_PIN', NO_ACCOUNT_MESSAGE);
  if (!target) {
    if (input.businessId) throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable pour ce numéro.');
    return { status: 'REQUIRES_BUSINESS_SELECTION', businesses: toChoices(users) };
  }

  return openSessionForUser(target, meta);
}

export type ResetCodeResult =
  | { status: 'REQUIRES_BUSINESS_SELECTION'; businesses: BusinessChoice[] }
  | { status: 'OK'; resetToken: string };

/** Mot de passe oublié : bon code → jeton à usage unique, valable 10 minutes. */
export async function verifyResetCode(input: z.infer<typeof otpVerifySchema>): Promise<ResetCodeResult> {
  const phone = requirePhone(input.phone, input.country);
  const users = await findActiveUsers(phone);
  const target = pickTarget(users, input.businessId);

  await checkCode(phone, 'PASSWORD_RESET', input.code, { consume: !!target });

  if (users.length === 0) throw new AppError('AUTH_INVALID_PIN', NO_ACCOUNT_MESSAGE);
  if (!target) {
    if (input.businessId) throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable pour ce numéro.');
    return { status: 'REQUIRES_BUSINESS_SELECTION', businesses: toChoices(users) };
  }

  const resetToken = randomBytes(32).toString('hex');
  const now = new Date();
  await prisma.$transaction([
    // Un seul jeton vivant par compte.
    prisma.passwordResetToken.updateMany({ where: { userId: target.id, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: hashResetToken(resetToken),
        expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);
  return { status: 'OK', resetToken };
}

// ─── Nouveau mot de passe ─────────────────────────────────────────────────

/**
 * Change le mot de passe avec le jeton reçu. Toutes les sessions ouvertes du
 * compte sont fermées : la personne est invitée à se reconnecter.
 */
export async function resetPasswordWithToken(input: z.infer<typeof passwordResetSchema>): Promise<void> {
  const expired = () =>
    new AppError('OTP_EXPIRED', 'Ce lien a expiré. Recommence « Mot de passe oublié ? ».');

  const tokenHash = hashResetToken(input.resetToken);
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) throw expired();

  const user = await prisma.user.findUnique({ where: { id: token.userId } });
  if (!user || !user.actif) throw expired();

  // Vérifié avant de consommer le jeton : un refus ne le brûle pas.
  if (await verifyPin(input.newPin, user.codeHash)) {
    throw new AppError('VALIDATION_ERROR', "Choisis un mot de passe différent de l'ancien.");
  }
  const codeHash = await hashPin(input.newPin);

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    // Usage unique, même avec deux requêtes simultanées.
    const used = await tx.passwordResetToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (used.count === 0) throw expired();

    await tx.user.update({ where: { id: user.id }, data: { codeHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        businessId: user.businessId,
        userId: user.id,
        action: 'USER_PASSWORD_RESET',
        entite: 'User',
        entiteId: user.id,
        nouvellesValeurs: { canal: 'WHATSAPP_CODE' },
      },
    });
  });

  // Un compte bloqué par trop d'échecs de mot de passe se rouvre avec le nouveau.
  await clearRateLimit(phoneKey(user.telephone));
}
