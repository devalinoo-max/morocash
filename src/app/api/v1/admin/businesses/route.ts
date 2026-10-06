import { requireAdminSession } from '@/server/guards/admin';
import { listBusinesses } from '@/server/modules/admin/service';
import { ok, fail } from '@/server/shared/response';

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const url = new URL(request.url);
    const statut = url.searchParams.get('statut') ?? undefined;
    const pays = url.searchParams.get('pays') ?? undefined;
    // Id d'un affilié, ou DIRECT pour les inscriptions sans lien d'affilié.
    const affiliateId = url.searchParams.get('affiliateId') ?? undefined;
    const cursor = url.searchParams.get('cursor') ?? undefined;
    const limitParam = url.searchParams.get('limit');
    const businesses = await listBusinesses({
      statut,
      pays,
      affiliateId,
      cursor,
      limit: limitParam ? Number(limitParam) : undefined,
    });
    return ok({ businesses });
  } catch (error) {
    return fail(error);
  }
}
