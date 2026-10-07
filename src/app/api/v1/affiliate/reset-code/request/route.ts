import { affiliateResetRequestSchema, requestAffiliatePinReset } from '@/server/modules/affiliation/resetCode';
import { RESET_REQUEST_MESSAGE } from '@/server/modules/auth/resetCode';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = affiliateResetRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    await requestAffiliatePinReset(parsed.data);
    return ok({ sent: true, message: RESET_REQUEST_MESSAGE });
  } catch (error) {
    return fail(error);
  }
}
