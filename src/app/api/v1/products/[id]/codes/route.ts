import { guardRead, guardMutation, auditable } from '@/server/guards';
import { addCode, addCodeSchema, listCodes, removeCode } from '@/server/modules/products/codes';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    const codes = await listCodes(ctx.businessId, id);
    return ok({ codes });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const body = await request.json().catch(() => null);
    const parsed = addCodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const code = await addCode(ctx.businessId, id, parsed.data);

    await auditable(ctx, { action: 'PRODUCT_CODE_ADDED', entite: 'Product', entiteId: id });

    return ok({ code }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation({ roles: ['OWNER', 'ACCOUNTANT'] });

    const url = new URL(request.url);
    const codeId = url.searchParams.get('codeId');
    if (!codeId) {
      throw new AppError('VALIDATION_ERROR', 'Le paramètre codeId est requis.');
    }

    await removeCode(ctx.businessId, id, codeId);

    await auditable(ctx, { action: 'PRODUCT_CODE_REMOVED', entite: 'Product', entiteId: id });

    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
