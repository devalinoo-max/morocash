import { guardRead, guardMutation } from '@/server/guards';
import { createCommercial, createCommercialSchema, listCommerciaux } from '@/server/modules/commerciaux/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/** Commerciaux de la boutique, actifs puis inactifs. Lecture ouverte à tout rôle (sélecteur de vente). */
export async function GET() {
  try {
    const ctx = await guardRead();
    const commerciaux = await listCommerciaux(ctx.businessId);
    return ok({ commerciaux });
  } catch (error) {
    return fail(error);
  }
}

/**
 * Ajout d'un commercial (Réglages, ou « + Nouveau » pendant une vente).
 * Idempotent sur l'id tiré par l'appareil : la file hors ligne peut renvoyer
 * sans créer de doublon. « Moi » (pourMoi) est ouvert à tout rôle ; créer un
 * autre commercial est réservé au propriétaire et au gestionnaire.
 */
export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();
    const body = await request.json().catch(() => null);
    const parsed = createCommercialSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }
    if (!parsed.data.pourMoi && ctx.role === 'SELLER') {
      throw new AppError('FORBIDDEN_ROLE', 'Seul le propriétaire ou un gestionnaire peut ajouter un commercial.');
    }
    const commercial = await createCommercial({ businessId: ctx.businessId, userId: ctx.userId }, parsed.data);
    return ok({ commercial }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
