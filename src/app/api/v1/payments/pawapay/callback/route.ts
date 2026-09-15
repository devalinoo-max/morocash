import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';
import { handleDepositCallback } from '@/server/modules/subscriptions/service';

/**
 * Callback des dépôts pawaPay (URL à déclarer dans le Dashboard pawaPay).
 * Route publique : on ne retient du corps que le depositId, le statut est
 * relu chez pawaPay avant toute activation (voir reconcile()).
 * Réponse 200 = reçu ; 500 = pawaPay retentera plus tard.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { depositId?: unknown } | null;
  const depositId = typeof body?.depositId === 'string' ? body.depositId : null;

  if (!depositId || !/^[0-9a-f-]{36}$/i.test(depositId)) {
    return NextResponse.json({ received: false }, { status: 400 });
  }

  try {
    await handleDepositCallback(depositId);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[pawapay/callback]', depositId, error);
    Sentry.captureException(error, { extra: { depositId } });
    return NextResponse.json({ received: false }, { status: 500 });
  }
}
