import { guardRead, guardMutation, auditable } from '@/server/guards';
import { createCustomer, createCustomerSchema, listCustomers } from '@/server/modules/customers/service';
import { getCustomerBalances } from '@/server/modules/customers/debt';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

export async function GET(request: Request) {
  try {
    const ctx = await guardRead();
    const url = new URL(request.url);
    const archiveParam = url.searchParams.get('archive');
    const [customers, balances] = await Promise.all([
      listCustomers(ctx.businessId, {
        archive: archiveParam === null ? undefined : archiveParam === 'true',
      }),
      getCustomerBalances(ctx.businessId),
    ]);
    return ok({
      customers: customers.map((c) => ({ ...c, solde: balances.get(c.id) ?? 0 })),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const customer = await createCustomer(ctx.businessId, parsed.data);

    await auditable(ctx, { action: 'CUSTOMER_CREATED', entite: 'Customer', entiteId: customer.id });

    return ok({ customer }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
