import { resetRequestSchema, requestPinReset } from '@/server/modules/auth/resetCode';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = resetRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    await requestPinReset(parsed.data.telephone);
    return ok({ sent: true });
  } catch (error) {
    return fail(error);
  }
}
