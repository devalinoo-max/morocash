import { findActiveAffiliate } from '@/server/modules/affiliation/referral';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ code: string }>;
}

/** Vérification d'un code saisi à l'inscription : existe-t-il, l'affilié est-il actif ? */
export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { code } = await params;
    const affiliate = await findActiveAffiliate(decodeURIComponent(code));
    return ok({ valide: !!affiliate, code: affiliate?.code ?? null });
  } catch (error) {
    return fail(error);
  }
}
