import { getVapidPublicKey } from '@/server/modules/push/service';
import { ok, fail } from '@/server/shared/response';

// Clé publique VAPID : le navigateur en a besoin pour créer l'abonnement push.
// Publique par nature, aucune session requise.
export async function GET() {
  try {
    return ok({ publicKey: getVapidPublicKey() });
  } catch (error) {
    return fail(error);
  }
}
