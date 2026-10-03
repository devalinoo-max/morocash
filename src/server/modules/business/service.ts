import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/database/client';
import { uploadProductImage } from '@/server/integrations/cloudinary';

/**
 * Plafond d'un envoi de réglages partagés, en caractères JSON. Les reçus,
 * étiquettes et coordonnées tiennent en quelques Ko ; le logo, envoyé en data
 * URL (512 px, WebP + PNG transparent), peut peser quelques centaines de Ko
 * avant d'être remplacé par son lien Cloudinary.
 */
const MAX_REGLAGES_LENGTH = 3_000_000;

/** Clés de `reglages` qui portent une image : hébergées sur Cloudinary, pas en base. */
const LOGO_KEYS = ['logoUrl', 'logoTransparentUrl'] as const;

export const updateBusinessSettingsSchema = z.object({
  cashRegisterMode: z.enum(['LIBRE', 'STRICT']).optional(),
  reglages: z
    .record(z.string(), z.unknown())
    .refine((r) => JSON.stringify(r).length <= MAX_REGLAGES_LENGTH, {
      message: 'Réglages trop volumineux.',
    })
    .optional(),
});

export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;

/**
 * Un logo arrive en data URL depuis l'app : on le pose sur Cloudinary pour
 * que chaque appareil ne relise qu'un lien, et pas l'image entière à chaque
 * recalage. Sans Cloudinary configuré, la data URL est gardée telle quelle.
 */
async function hostLogos(businessId: string, reglages: Record<string, unknown>) {
  const out = { ...reglages };
  for (const key of LOGO_KEYS) {
    const value = out[key];
    if (typeof value !== 'string' || !value.startsWith('data:image/')) continue;
    const uploaded = await uploadProductImage(value, `morocash/${businessId}/logo`);
    if (uploaded) out[key] = uploaded.url;
  }
  return out;
}

/**
 * Réglages de boutique modifiables par l'OWNER : le mode de caisse (lu par le
 * serveur à chaque encaissement) et `reglages`, les réglages de l'app partagés
 * entre tous les appareils de la boutique. `reglages` est fusionné clé par clé
 * avec ce qui est déjà en base : l'app n'envoie que ce qui a changé (une clé à
 * `null` l'efface). Écriture directe sur Business (pas de repository
 * `scoped()` : c'est la boutique elle-même, déjà identifiée par
 * ctx.businessId côté guard).
 */
export async function updateBusinessSettings(businessId: string, input: UpdateBusinessSettingsInput) {
  let reglages: Prisma.InputJsonObject | undefined;
  if (input.reglages !== undefined) {
    const current = await prisma.business.findUnique({
      where: { id: businessId },
      select: { reglages: true },
    });
    const existing =
      current?.reglages && typeof current.reglages === 'object' && !Array.isArray(current.reglages)
        ? (current.reglages as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = { ...existing, ...(await hostLogos(businessId, input.reglages)) };
    for (const [key, value] of Object.entries(merged)) {
      if (value === null) delete merged[key];
    }
    reglages = merged as Prisma.InputJsonObject;
  }

  return prisma.business.update({
    where: { id: businessId },
    data: {
      ...(input.cashRegisterMode !== undefined ? { cashRegisterMode: input.cashRegisterMode } : {}),
      ...(reglages !== undefined ? { reglages } : {}),
    },
  });
}
