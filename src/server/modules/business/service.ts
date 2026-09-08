import { z } from 'zod';
import { prisma } from '@/server/database/client';

export const updateBusinessSettingsSchema = z.object({
  cashRegisterMode: z.enum(['LIBRE', 'STRICT']).optional(),
});

export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;

/**
 * Réglages de boutique modifiables par l'OWNER (spec produit, hors cahier des
 * charges d'origine) — pour l'instant uniquement cashRegisterMode. Écriture
 * directe sur Business (pas de repository `scoped()` : ce n'est pas une
 * ressource métier tenant-scopée comme Product/Order, c'est la boutique
 * elle-même, déjà identifiée par ctx.businessId côté guard).
 */
export async function updateBusinessSettings(businessId: string, input: UpdateBusinessSettingsInput) {
  return prisma.business.update({
    where: { id: businessId },
    data: {
      ...(input.cashRegisterMode !== undefined ? { cashRegisterMode: input.cashRegisterMode } : {}),
    },
  });
}
