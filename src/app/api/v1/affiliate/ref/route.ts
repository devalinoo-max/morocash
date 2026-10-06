import { referralAffiliate, rememberReferral } from '@/server/modules/affiliation/referral';
import { ok, fail } from '@/server/shared/response';

/** Code du lien d'affilié mémorisé sur cet appareil (cookie signé), null s'il n'y en a pas. */
export async function GET() {
  try {
    const affiliate = await referralAffiliate();
    return ok({ code: affiliate?.code ?? null });
  } catch (error) {
    return fail(error);
  }
}

/** Clic sur un lien /a/CODE : mémorise le code 30 jours s'il est valide. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    const code = typeof body?.code === 'string' ? await rememberReferral(body.code) : null;
    return ok({ code });
  } catch (error) {
    return fail(error);
  }
}
