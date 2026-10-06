import { requireAdminSession } from '@/server/guards/admin';
import { changeAffiliateCode, changeAffiliateCodeSchema } from '@/server/modules/admin/affiliation';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Correction du code affilié d'une boutique (vide = inscription directe). */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const admin = await requireAdminSession();
    const body = await request.json().catch(() => null);
    const parsed = changeAffiliateCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Code invalide.', parsed.error.flatten());
    }
    const affiliate = await changeAffiliateCode(id, parsed.data.code, admin.adminUserId);
    return ok({ affiliate });
  } catch (error) {
    return fail(error);
  }
}
