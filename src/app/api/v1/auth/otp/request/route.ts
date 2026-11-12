import { OTP_REQUEST_MESSAGE, otpRequestSchema, requestWhatsappCode } from '@/server/modules/auth/whatsapp/otp';
import { requestMeta } from '@/server/modules/auth/session';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Même réponse que le numéro ait un compte ou non ; le code n'est jamais renvoyé.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = otpRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', "Ce numéro n'est pas valide. Exemple : 01 70 34 58 08");
    }

    await requestWhatsappCode(parsed.data, { ip: requestMeta(request).ip });
    return ok({ sent: true, message: OTP_REQUEST_MESSAGE });
  } catch (error) {
    return fail(error);
  }
}
