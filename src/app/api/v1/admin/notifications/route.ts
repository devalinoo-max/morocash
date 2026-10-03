import { requireAdminSession } from '@/server/guards/admin';
import { auditAdminAction } from '@/server/modules/admin/service';
import { broadcastSchema, sendBroadcast } from '@/server/modules/push/service';
import { countPushAudience, listPushBroadcasts } from '@/server/repositories/push';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/** Page « Notifications » : appareils abonnés et derniers envois. */
export async function GET() {
  try {
    await requireAdminSession();
    const [audience, broadcasts] = await Promise.all([countPushAudience(), listPushBroadcasts()]);
    return ok({ audience, broadcasts });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminSession();

    const body = await request.json().catch(() => null);
    const parsed = broadcastSchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Données invalides.';
      throw new AppError('VALIDATION_ERROR', message, parsed.error.flatten());
    }

    const { broadcast, premiereErreur } = await sendBroadcast(admin.adminUserId, parsed.data);
    await auditAdminAction({
      adminUserId: admin.adminUserId,
      businessId: broadcast.businessId ?? undefined,
      action: broadcast.statut === 'PROGRAMME' ? 'ADMIN_NOTIFICATION_SCHEDULED' : 'ADMIN_NOTIFICATION_SENT',
      entite: 'PushBroadcast',
      entiteId: broadcast.id,
      nouvellesValeurs: {
        titre: broadcast.titre,
        cible: broadcast.cible,
        envoyes: broadcast.envoyes,
        programmeLe: broadcast.programmeLe,
      },
    });

    return ok({ broadcast, premiereErreur });
  } catch (error) {
    return fail(error);
  }
}
