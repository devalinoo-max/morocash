import { loginAdmin, adminLoginSchema } from '@/server/modules/admin/login';
import { setAdminSessionCookie } from '@/server/modules/admin/session';
import { requestMeta } from '@/server/modules/auth/session';
import { issueCsrfToken } from '@/server/middleware/csrf';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = adminLoginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const token = await loginAdmin(parsed.data, requestMeta(request));
    await setAdminSessionCookie(token);
    await issueCsrfToken();

    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
