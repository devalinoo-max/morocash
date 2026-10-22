import { z } from 'zod';
import { guardRead, requireRole } from '@/server/guards';
import { getCommercialSales, NON_ATTRIBUE } from '@/server/modules/commerciaux/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';
import { parsePeriod } from '../period';

/** Ventes d'un commercial sur la période (commercialId=NON_ATTRIBUE pour les ventes sans commercial). */
export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);
    const url = new URL(request.url);
    const { from, to } = parsePeriod(url);
    const raw = url.searchParams.get('commercialId');
    const commercialId = raw === NON_ATTRIBUE ? null : z.string().uuid().safeParse(raw).data;
    if (commercialId === undefined) throw new AppError('VALIDATION_ERROR', 'Paramètre "commercialId" invalide.');
    const ventes = await getCommercialSales(ctx.businessId, commercialId, from, to);
    return ok({ ventes });
  } catch (error) {
    return fail(error);
  }
}
