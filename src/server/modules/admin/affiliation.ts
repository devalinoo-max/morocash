import { z } from 'zod';
import { AppError } from '@/server/shared/errors';
import { findActiveAffiliate, normalizeAffiliateCode } from '@/server/modules/affiliation/referral';
import {
  changeBusinessAffiliate,
  getAffiliateDetailForAdmin,
  getAffiliateSettings,
  listAffiliatesForAdmin,
  markPayoutPaid,
  saveAffiliateSettings,
} from '@/server/repositories/affiliates';

// Montants entiers en FCFA. Plafond large, seulement pour arrêter une faute de frappe.
const fcfa = z.number().int().min(0).max(10_000_000);

export const affiliateSettingsSchema = z.object({
  commissions: z.record(z.string(), fcfa),
  seuilRetrait: fcfa,
});

/** Page « Affiliation » : taux par formule et seuil de retrait. */
export function getAffiliationSettings() {
  return getAffiliateSettings();
}

/** Un changement de taux ne vaut que pour les paiements futurs : les commissions gardent le taux figé à leur création. */
export function updateAffiliationSettings(input: z.infer<typeof affiliateSettingsSchema>) {
  return saveAffiliateSettings(input);
}

/** Page « Affiliés » : tableau et totaux des retraits demandés. */
export async function getAffiliatesOverview() {
  const affiliates = await listAffiliatesForAdmin();
  const demandes = affiliates.filter((a) => a.retraitDemande);
  return {
    retraitsDemandes: demandes.length,
    totalAVerser: demandes.reduce((sum, a) => sum + a.retraitDemande!.montant, 0),
    affiliates,
  };
}

export async function markAffiliatePayoutPaid(payoutId: string, adminUserId: string) {
  const payout = await markPayoutPaid(payoutId, adminUserId);
  if (!payout) throw new AppError('RESOURCE_NOT_OWNED', 'Retrait introuvable.');
  return payout;
}

export async function getAffiliateDetail(affiliateId: string) {
  const affiliate = await getAffiliateDetailForAdmin(affiliateId);
  if (!affiliate) throw new AppError('RESOURCE_NOT_OWNED', 'Affilié introuvable.');
  return affiliate;
}

export const changeAffiliateCodeSchema = z.object({
  // Vide = inscription directe (aucun affilié).
  code: z.string().max(40),
});

export async function changeAffiliateCode(businessId: string, rawCode: string, adminUserId: string) {
  const code = normalizeAffiliateCode(rawCode);
  const affiliate = code ? await findActiveAffiliate(code) : null;
  if (code && !affiliate) {
    throw new AppError('VALIDATION_ERROR', "Ce code n'existe pas ou l'affilié est désactivé.");
  }
  const result = await changeBusinessAffiliate(businessId, affiliate, adminUserId);
  if (result.status === 'BUSINESS_NOT_FOUND') throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable.');
  if (result.status === 'OWN_BUSINESS') {
    throw new AppError('VALIDATION_ERROR', "Ce code appartient au propriétaire de la boutique : pas de rattachement à soi-même.");
  }
  return result.affiliate;
}
