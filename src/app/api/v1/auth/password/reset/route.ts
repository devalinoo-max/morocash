import { passwordResetSchema, resetPasswordWithToken } from '@/server/modules/auth/whatsapp/otp';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Change le mot de passe avec le resetToken ; ferme toutes les sessions du compte.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = passwordResetSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Données invalides.');
    }

    await resetPasswordWithToken(parsed.data);
    return ok({ reset: true });
  } catch (error) {
    return fail(error);
  }
}
