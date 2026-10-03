import { guardRead } from '@/server/guards';
import {
  subscribeDevice,
  subscribeSchema,
  unsubscribeDevice,
  unsubscribeSchema,
} from '@/server/modules/push/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

// Abonnement de l'appareil aux notifications. Lecture seule suffit : une
// boutique suspendue doit pouvoir recevoir les messages de l'équipe MoroCash.
export async function POST(request: Request) {
  try {
    const ctx = await guardRead();

    const body = await request.json().catch(() => null);
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Abonnement invalide.', parsed.error.flatten());
    }

    await subscribeDevice(ctx, parsed.data, request.headers.get('user-agent'));
    return ok({ subscribed: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await guardRead();

    const body = await request.json().catch(() => null);
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Abonnement invalide.', parsed.error.flatten());
    }

    await unsubscribeDevice(ctx.userId, parsed.data.endpoint);
    return ok({ subscribed: false });
  } catch (error) {
    return fail(error);
  }
}
