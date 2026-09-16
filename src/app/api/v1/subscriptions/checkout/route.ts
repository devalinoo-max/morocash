import { guardRead, requireRole } from '@/server/guards';
import { checkoutSchema, startCheckout } from '@/server/modules/subscriptions/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/**
 * Adresse de l'app où pawaPay renvoie le client après paiement. APP_PUBLIC_URL
 * si elle est définie, sinon l'origine du navigateur qui a lancé le paiement
 * (le frontend appelle cette route à travers sa réécriture /api/v1/*).
 */
function appBaseUrl(request: Request): string {
  const configured = process.env.APP_PUBLIC_URL;
  const candidate = configured || request.headers.get('origin') || '';
  try {
    const url = new URL(candidate);
    if (url.protocol === 'https:') return url.origin;
    // En local, pawaPay refuse un returnUrl sur « localhost » mais accepte
    // 127.0.0.1 (testé en sandbox) — ouvrir alors l'app sur 127.0.0.1, sinon
    // le cookie de session ne suit pas au retour.
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.hostname = '127.0.0.1';
      return url.origin;
    }
  } catch {
    // adresse absente ou invalide : erreur ci-dessous
  }
  throw new AppError('VALIDATION_ERROR', "Adresse de retour de l'application introuvable.");
}

// Lancer un paiement reste possible avec un essai ou un abonnement expiré —
// c'est justement le moyen d'en sortir : guardRead et non guardMutation.
export async function POST(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER']);

    const body = await request.json().catch(() => null);
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const checkout = await startCheckout(ctx.business, parsed.data, appBaseUrl(request));
    return ok(checkout);
  } catch (error) {
    return fail(error);
  }
}
