import { guardMutation, auditable } from '@/server/guards';
import { updateBusinessSettings, updateBusinessSettingsSchema } from '@/server/modules/business/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Réglages de boutique (ex. mode de caisse) — réservés OWNER, comme les
// autres actions de configuration (employés, remise max vendeur...).
export async function PATCH(request: Request) {
  try {
    const ctx = await guardMutation({ roles: ['OWNER'] });

    const body = await request.json().catch(() => null);
    const parsed = updateBusinessSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const business = await updateBusinessSettings(ctx.businessId, parsed.data);

    // Le bloc `reglages` est renvoyé à chaque retouche (taille du texte d'un
    // reçu...) : on journalise quelles clés ont été envoyées, pas tout le bloc.
    const { reglages, ...autres } = parsed.data;
    await auditable(ctx, {
      action: 'BUSINESS_SETTINGS_UPDATED',
      entite: 'Business',
      entiteId: business.id,
      nouvellesValeurs: reglages ? { ...autres, reglages: Object.keys(reglages) } : autres,
    });

    return ok({
      business: { cashRegisterMode: business.cashRegisterMode, reglages: business.reglages },
    });
  } catch (error) {
    return fail(error);
  }
}
