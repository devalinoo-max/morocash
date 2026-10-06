import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { Affiliate } from '@prisma/client';
import { AppError } from '@/server/shared/errors';
import { findAffiliateByCode } from '@/server/repositories/affiliates';

/**
 * Code du lien d'affilié (/a/CODE), gardé 30 jours dans un cookie httpOnly
 * signé, posé par le serveur. C'est lui, et non le champ du formulaire, qui
 * fait foi à l'inscription : griser le champ côté écran n'est pas une
 * protection, une requête modifiée à la main ne doit pas pouvoir changer
 * l'affilié d'une inscription arrivée par un lien.
 */
const COOKIE = 'morocash_affiliate_ref';
const TTL_SECONDS = 30 * 24 * 60 * 60;
const AUDIENCE = 'affiliate-ref';

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET manquant.');
  return new TextEncoder().encode(secret);
}

/** « 79hc 9m » → « 79HC9M » : majuscules, sans espaces. */
export function normalizeAffiliateCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** Affilié actif portant ce code, sinon null. */
export async function findActiveAffiliate(rawCode: string): Promise<Affiliate | null> {
  const code = normalizeAffiliateCode(rawCode);
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return null;
  const affiliate = await findAffiliateByCode(code);
  return affiliate?.actif ? affiliate : null;
}

/** Clic sur un lien : mémorise le code s'il est valide. Un lien plus récent remplace l'ancien. */
export async function rememberReferral(rawCode: string): Promise<string | null> {
  const affiliate = await findActiveAffiliate(rawCode);
  if (!affiliate) return null;

  const token = await new SignJWT({ code: affiliate.code })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secretKey());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_SECONDS,
    path: '/',
  });
  return affiliate.code;
}

/** Affilié du lien mémorisé sur cet appareil, s'il est toujours actif. */
export async function referralAffiliate(): Promise<Affiliate | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: AUDIENCE });
    return typeof payload.code === 'string' ? await findActiveAffiliate(payload.code) : null;
  } catch {
    return null; // signature invalide ou expirée
  }
}

export async function forgetReferral(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}

/**
 * Affilié à rattacher à une nouvelle boutique.
 * - Code du lien valide : il l'emporte, le code saisi est ignoré. Si c'est le
 *   propre numéro de l'affilié, inscription directe (sans quoi il ne pourrait
 *   jamais créer sa boutique sur cet appareil, le champ étant verrouillé).
 * - Sinon, code saisi : il doit exister et ne pas appartenir au même numéro.
 * - Aucun code : inscription directe.
 */
export async function resolveSignupAffiliate(input: {
  telephone: string;
  typedCode?: string;
}): Promise<string | null> {
  const fromLink = await referralAffiliate();
  if (fromLink) {
    return fromLink.telephone === input.telephone ? null : fromLink.id;
  }

  const typed = input.typedCode ? normalizeAffiliateCode(input.typedCode) : '';
  if (!typed) return null;
  const affiliate = await findActiveAffiliate(typed);
  if (!affiliate) {
    throw new AppError('VALIDATION_ERROR', "Ce code n'existe pas. Vérifie-le ou laisse le champ vide.", {
      field: 'affiliateCode',
    });
  }
  if (affiliate.telephone === input.telephone) {
    throw new AppError('VALIDATION_ERROR', 'Tu ne peux pas utiliser ton propre code.', { field: 'affiliateCode' });
  }
  return affiliate.id;
}
