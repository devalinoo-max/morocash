import { guardRead } from '@/server/guards';
import { getCustomerHistory, getCustomerBalance } from '@/server/modules/customers/debt';
import { ok, fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();

    const [history, balance] = await Promise.all([
      getCustomerHistory(ctx.businessId, id),
      getCustomerBalance(ctx.businessId, id),
    ]);

    return ok({
      customer: history.customer,
      orders: history.orders,
      solde: balance.solde,
      totalDu: balance.totalDu,
      totalRecu: balance.totalRecu,
    });
  } catch (error) {
    return fail(error);
  }
}
