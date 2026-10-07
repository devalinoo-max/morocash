import { customAlphabet } from 'nanoid';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '@/server/shared/errors';
import { BASE_TRIAL_DAYS } from '@/server/shared/subscription';
import { hashPin, verifyPin } from '@/server/modules/auth/pin';
import { SUPPORTED_COUNTRIES } from '@/server/modules/auth/register';
import { assertNotRateLimited, clearRateLimit, ipKey, recordFailedAttempt } from '@/server/middleware/rateLimit';
import {
  createAffiliate,
  createPayoutRequest,
  findAffiliateByEmail,
  findAffiliateByPhone,
  getAffiliateDashboardData,
  getAffiliateSettings,
  setAffiliateName,
} from '@/server/repositories/affiliates';

const nomSchema = z.string().trim().min(2, 'Indique ton prénom ou ton nom').max(60);

// Champ laissé vide dans le formulaire : pas d'e-mail.
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().toLowerCase().email('Adresse e-mail invalide').max(180).optional()
);

// Même format que l'écran de connexion boutique : numéro sans indicatif, mot de passe à 6 chiffres.
export const affiliateRegisterSchema = z.object({
  prenom: z.string().trim().min(1, 'Indique ton prénom').max(40),
  nom: z.string().trim().min(1, 'Indique ton nom').max(40),
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  pays: z.enum(SUPPORTED_COUNTRIES).default('CI'),
  email: optionalEmail,
  pin: z.string().regex(/^\d{6}$/, 'Le mot de passe doit comporter exactement 6 chiffres'),
});

const PHONE_TAKEN = 'Ce numéro est déjà associé à un compte affilié.';
const EMAIL_TAKEN = 'Cette adresse e-mail est déjà associée à un compte affilié.';

export const affiliateLoginSchema = z.object({
  telephone: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de téléphone invalide'),
  pin: z.string().regex(/^\d{6}$/, 'Le mot de passe doit comporter exactement 6 chiffres'),
});

export const affiliateNameSchema = z.object({ nom: nomSchema });

// Opérateurs proposés pour recevoir un retrait.
export const affiliatePayoutSchema = z.object({
  operateur: z.enum(['ORANGE_MONEY', 'MTN', 'WAVE', 'MOOV']),
  numeroReception: z.string().trim().regex(/^\d{8,15}$/, 'Numéro de réception invalide'),
});

/**
 * Adresse publique du frontend pour le lien d'affilié, toujours en https :
 * AFFILIATE_PUBLIC_URL, sinon APP_PUBLIC_URL, sinon l'adresse de production.
 * Jamais l'adresse du navigateur : en développement, ce serait localhost, un
 * lien qui ne s'ouvre sur aucun autre téléphone.
 */
const DEFAULT_PUBLIC_URL = 'https://www.morocash.net';

function publicBaseUrl(): string {
  for (const candidate of [process.env.AFFILIATE_PUBLIC_URL, process.env.APP_PUBLIC_URL]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.origin;
    } catch {
      // adresse invalide : on passe à la suivante
    }
  }
  return DEFAULT_PUBLIC_URL;
}

export function affiliateLink(code: string): string {
  return `${publicBaseUrl()}/a/${code}`;
}

// Sans 0/O ni 1/I : le code se lit et se recopie à voix haute sans erreur.
const newCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

/**
 * Un numéro, comme un e-mail, n'ouvre qu'un seul compte affilié. Le compte
 * affilié reste distinct d'une boutique : le même numéro peut avoir les deux.
 */
export async function registerAffiliate(input: z.infer<typeof affiliateRegisterSchema>) {
  const email = input.email ?? null;
  const assertAvailable = async () => {
    if (await findAffiliateByPhone(input.telephone)) throw new AppError('VALIDATION_ERROR', PHONE_TAKEN);
    if (email && (await findAffiliateByEmail(email))) throw new AppError('VALIDATION_ERROR', EMAIL_TAKEN);
  };

  await assertAvailable();
  const codeHash = await hashPin(input.pin);
  const nom = `${input.prenom} ${input.nom}`;

  // Collision de code (ou inscription simultanée du même numéro ou e-mail) :
  // on retente avec un nouveau code ; numéro et e-mail sont revérifiés.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await createAffiliate({ code: newCode(), nom, telephone: input.telephone, pays: input.pays, email, codeHash });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      await assertAvailable();
    }
  }
  throw new AppError('SERVER_ERROR', 'Impossible de créer le compte. Réessaie.');
}

/** Même blocage que la connexion boutique : 5 échecs → 5 minutes, par numéro et par IP. */
export async function loginAffiliate(input: z.infer<typeof affiliateLoginSchema>, ip?: string) {
  const rlPhone = `affiliate-login:${input.telephone}`;
  const rlIp = ip ? ipKey(ip) : null;
  await assertNotRateLimited(rlPhone);
  if (rlIp) await assertNotRateLimited(rlIp);

  const affiliate = await findAffiliateByPhone(input.telephone);
  const valid = !!affiliate && affiliate.actif && (await verifyPin(input.pin, affiliate.codeHash));
  if (!affiliate || !valid) {
    await recordFailedAttempt(rlPhone);
    if (rlIp) await recordFailedAttempt(rlIp);
    throw new AppError('AUTH_INVALID_PIN', 'Numéro ou mot de passe incorrect.');
  }

  await clearRateLimit(rlPhone);
  if (rlIp) await clearRateLimit(rlIp);
  return affiliate;
}

export type AffiliateActivity =
  | { type: 'INSCRIPTION'; date: Date; boutique: string; paye: boolean }
  | { type: 'PAIEMENT' | 'RENOUVELLEMENT'; date: Date; boutique: string; planCode: string; mois: number; montant: number }
  | { type: 'RETRAIT_DEMANDE' | 'RETRAIT_PAYE'; date: Date; montant: number };

const ACTIVITY_LIMIT = 50;

/** Espace affilié : lien, gains par formule, compteurs, comptes amenés et activité récente. */
export async function getAffiliateDashboard(affiliate: {
  id: string;
  code: string;
  nom: string | null;
  telephone: string;
  pays: string;
}) {
  const data = await getAffiliateDashboardData(affiliate.id);

  // Ni téléphone ni e-mail : seulement nom, date, statut, formule, paiements et commission.
  const inscrits = data.accounts.map((a) => ({
    nom: a.nom,
    date: a.createdAt,
    statut: a.statut,
    planCode: a.planCode,
  }));
  const abonnes = data.accounts
    .filter((a) => a.paiements > 0)
    .map((a) => ({ nom: a.nom, planCode: a.planCode, paiements: a.paiements, commission: a.commission }));

  const activite: AffiliateActivity[] = [
    ...data.accounts.map((a) => ({
      type: 'INSCRIPTION' as const,
      date: a.createdAt,
      boutique: a.nom,
      paye: a.paiements > 0,
    })),
    ...data.commissions.map((c) => ({
      type: c.renouvellement ? ('RENOUVELLEMENT' as const) : ('PAIEMENT' as const),
      date: c.createdAt,
      boutique: c.business.nom,
      planCode: c.planCode,
      mois: c.mois,
      montant: c.montant,
    })),
    ...data.payouts.flatMap((p) => [
      { type: 'RETRAIT_DEMANDE' as const, date: p.createdAt, montant: p.montant },
      ...(p.payeLe ? [{ type: 'RETRAIT_PAYE' as const, date: p.payeLe, montant: p.montant }] : []),
    ]),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, ACTIVITY_LIMIT);

  const pending = data.payouts.find((p) => p.statut === 'DEMANDE') ?? null;

  return {
    code: affiliate.code,
    nom: affiliate.nom,
    telephone: affiliate.telephone,
    pays: affiliate.pays,
    lien: affiliateLink(affiliate.code),
    taux: data.taux,
    // Essai des comptes inscrits avec ce lien, repris dans le message WhatsApp.
    joursEssaiAvecLien: BASE_TRIAL_DAYS + data.joursEssaiOfferts,
    inscrits: inscrits.length,
    payants: abonnes.length,
    solde: data.solde,
    seuilRetrait: data.seuilRetrait,
    retraitEnCours: pending
      ? { montant: pending.montant, date: pending.createdAt, operateur: pending.operateur, numeroReception: pending.numeroReception }
      : null,
    listeInscrits: inscrits,
    listeAbonnes: abonnes,
    // Toute commission vient d'un paiement réussi : ce total est égal à la somme de la liste des abonnés.
    totalGagne: abonnes.reduce((sum, a) => sum + a.commission, 0),
    activite,
  };
}

export async function updateAffiliateName(affiliateId: string, input: z.infer<typeof affiliateNameSchema>) {
  return setAffiliateName(affiliateId, input.nom);
}

export async function requestAffiliatePayout(affiliateId: string, input: z.infer<typeof affiliatePayoutSchema>) {
  const result = await createPayoutRequest(affiliateId, input);
  if (result.status === 'ALREADY_PENDING') {
    throw new AppError('VALIDATION_ERROR', 'Un retrait est déjà en cours de paiement.');
  }
  if (result.status === 'BELOW_THRESHOLD') {
    throw new AppError(
      'VALIDATION_ERROR',
      `Retrait possible dès ${result.seuilRetrait.toLocaleString('fr-FR')} F.`
    );
  }
  return { montant: result.montant };
}

/**
 * Page publique /affiliation : commission par formule, seuil de retrait et
 * avantage des inscrits, lus dans les réglages du back-office à chaque appel.
 */
export async function getAffiliateProgram() {
  const settings = await getAffiliateSettings();
  return {
    commissions: settings.plans.map((p) => ({ planCode: p.code, nom: p.nom, montant: p.commissionAffilie })),
    seuilRetrait: settings.seuilRetrait,
    joursEssaiOfferts: settings.joursEssaiOfferts,
    joursEssaiTotal: BASE_TRIAL_DAYS + settings.joursEssaiOfferts,
    reductionPremierPaiement: settings.reductionPremierPaiement,
  };
}
