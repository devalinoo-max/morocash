import { registerSchema, registerBusiness } from '@/server/modules/auth/register';
import { requestMeta, setSessionCookie } from '@/server/modules/auth/session';
import { issueCsrfToken } from '@/server/middleware/csrf';
import { assertNotRateLimited, recordFailedAttempt } from '@/server/middleware/rateLimit';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';
import { getTrialDaysLeft } from '@/server/shared/subscription';
import { forgetReferral, resolveSignupAffiliate } from '@/server/modules/affiliation/referral';

// Au plus 10 inscriptions par adresse IP toutes les 5 minutes : assez large
// pour plusieurs commerçants derrière la même connexion, assez serré pour
// qu'un script ne crée pas des boutiques à la chaîne.
const MAX_SIGNUPS_PER_WINDOW = 10;

export async function POST(request: Request) {
  try {
    const { ip } = requestMeta(request);
    const signupKey = ip ? `register:${ip}` : null;
    if (signupKey) {
      await assertNotRateLimited(signupKey, MAX_SIGNUPS_PER_WINDOW);
      await recordFailedAttempt(signupKey);
    }

    const body = await request.json().catch(() => null);
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    // Avant toute création : un code saisi invalide, ou le propre code de la
    // personne, refuse l'inscription. Le code d'un lien l'emporte sur la saisie.
    const affiliateId = await resolveSignupAffiliate({
      telephone: parsed.data.telephone.trim(),
      typedCode: parsed.data.affiliateCode,
    });

    const { business, owner, sessionToken } = await registerBusiness(parsed.data, requestMeta(request), affiliateId);
    await forgetReferral();
    await setSessionCookie(sessionToken);
    await issueCsrfToken();

    return ok(
      {
        business: {
          id: business.id,
          nom: business.nom,
          statut: business.statut,
          typeActivite: business.typeActivite,
          devise: business.devise,
          ville: business.ville,
          pays: business.pays,
          email: business.email,
          planCode: null,
          trialEndsAt: business.trialEndsAt,
          subscriptionEndsAt: business.subscriptionEndsAt,
          trialDaysLeft: getTrialDaysLeft(business),
          dureeEssaiJours: business.dureeEssaiJours,
          locked: false,
          cashRegisterMode: business.cashRegisterMode,
        },
        user: { id: owner.id, nom: owner.nom, telephone: owner.telephone, role: owner.role },
      },
      { status: 201 }
    );
  } catch (error) {
    return fail(error);
  }
}
