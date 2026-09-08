import { guardMutation, auditable } from '@/server/guards';
import { updateCustomer, updateCustomerSchema } from '@/server/modules/customers/service';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = updateCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const customer = await updateCustomer(ctx.businessId, id, parsed.data);

    await auditable(ctx, { action: 'CUSTOMER_UPDATED', entite: 'Customer', entiteId: id });

    return ok({ customer });
  } catch (error) {
    return fail(error);
  }
}
