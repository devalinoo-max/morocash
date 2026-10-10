import { guardMutation } from '@/server/guards';
import { cancelVersement, cancelVersementSchema } from '@/server/modules/payments/versements';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Annuler un versement : réservé au propriétaire, motif obligatoire. */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER'] });

    const body = await request.json().catch(() => null);
    const parsed = cancelVersementSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Le motif est obligatoire pour annuler un versement.',
        parsed.error.flatten()
      );
    }

    const versement = await cancelVersement(ctx, id, parsed.data.motif);
    return ok({ versement });
  } catch (error) {
    return fail(error);
  }
}
