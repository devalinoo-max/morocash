import { guardMutation, guardRead, marginViewRole } from '@/server/guards';
import { createOrder, createOrderSchema } from '@/server/modules/orders/createOrder';
import { listOrders } from '@/server/modules/orders/service';
import { serializeOrderList } from '@/server/serializers/order';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

/**
 * « Données invalides » ne disait rien au commerçant ni à qui débogue : le
 * message nomme désormais le champ refusé.
 */
function describeOrderIssue(path: PropertyKey[]): string {
  const [field, , sub] = path;
  if (field === 'items' && sub === 'productId') {
    return "Commande refusée : un article du panier n'est pas un produit enregistré sur le serveur.";
  }
  if (field === 'items' && sub === 'qte') {
    return 'Commande refusée : une quantité doit être un nombre entier supérieur à 0.';
  }
  if (field === 'items') return 'Commande refusée : le panier est vide ou mal formé.';
  if (field === 'customerId') {
    return "Commande refusée : le client n'est pas enregistré sur le serveur.";
  }
  if (field === 'remiseValeur' || field === 'remiseMode') return 'Commande refusée : remise invalide.';
  if (field === 'montantRecu') return 'Commande refusée : montant reçu invalide.';
  if (field === 'methode') return 'Commande refusée : moyen de paiement inconnu.';
  if (field === 'clientUuid') return 'Commande refusée : identifiant de commande invalide.';
  return 'Données invalides.';
}

export async function GET() {
  try {
    const ctx = await guardRead();
    const orders = await listOrders(ctx.businessId);
    return ok({ orders: serializeOrderList(orders, marginViewRole(ctx)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardMutation();

    const body = await request.json().catch(() => null);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        describeOrderIssue(parsed.error.issues[0]?.path ?? []),
        parsed.error.flatten()
      );
    }

    const result = await createOrder(
      {
        businessId: ctx.businessId,
        userId: ctx.userId,
        role: ctx.role,
        remiseMaxVendeur: ctx.business.remiseMaxVendeur,
        cashRegisterMode: ctx.business.cashRegisterMode,
      },
      parsed.data
    );

    return ok(
      { status: result.status, order: result.order },
      { status: result.status === 'CREATED' ? 201 : 200 }
    );
  } catch (error) {
    return fail(error);
  }
}
