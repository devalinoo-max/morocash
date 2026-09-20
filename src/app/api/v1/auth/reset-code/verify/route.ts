import { resetVerifySchema, verifyPinReset } from '@/server/modules/auth/resetCode';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resetVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const businesses = await verifyPinReset(parsed.data);
    return ok({ verified: true, businesses });
  } catch (error) {
    return fail(error);
  }
}
