import { loginSchema, login } from '@/server/modules/auth/login';
import { requestMeta, setSessionCookie } from '@/server/modules/auth/session';
import { issueCsrfToken } from '@/server/middleware/csrf';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const result = await login(parsed.data, requestMeta(request));

    if (result.status === 'REQUIRES_BUSINESS_SELECTION') {
      return ok({ requiresBusinessSelection: true, businesses: result.businesses });
    }

    await setSessionCookie(result.sessionToken);
    await issueCsrfToken();
    return ok({ userId: result.userId, businessId: result.businessId });
  } catch (error) {
    return fail(error);
  }
}
