import { affiliateResetConfirmSchema, confirmAffiliatePinReset } from '@/server/modules/affiliation/resetCode';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = affiliateResetConfirmSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    await confirmAffiliatePinReset(parsed.data);
    return ok({ reset: true });
  } catch (error) {
    return fail(error);
  }
}
