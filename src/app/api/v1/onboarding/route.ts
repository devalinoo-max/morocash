import { requireSession } from '@/server/guards';
import { assertCsrf } from '@/server/middleware/csrf';
import {
  getOnboarding,
  patchOnboarding,
  patchOnboardingSchema,
} from '@/server/modules/onboarding/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Avancement de la visite guidée de CETTE personne. Lecture au chargement de
// l'app, écriture à chaque bulle franchie.

export async function GET() {
  try {
    const ctx = await requireSession();
    return ok({ onboarding: await getOnboarding(ctx.businessId, ctx.userId) });
  } catch (error) {
    return fail(error);
  }
}

/**
 * On ne passe pas par `guardMutation` ici, à la différence des autres
 * écritures : il exige une boutique inscriptible, donc un essai expiré en
 * pleine visite ferait échouer l'enregistrement de l'avancement et la visite
 * se rejouerait à la réouverture. Avoir vu une bulle n'est pas une donnée
 * métier — la session et le jeton anti-CSRF suffisent.
 */
export async function PATCH(request: Request) {
  try {
    const ctx = await requireSession();
    await assertCsrf();

    const body = await request.json().catch(() => null);
    const parsed = patchOnboardingSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    return ok({ onboarding: await patchOnboarding(ctx.businessId, ctx.userId, parsed.data) });
  } catch (error) {
    return fail(error);
  }
}
