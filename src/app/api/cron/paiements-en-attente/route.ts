import { timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { reconcilePendingPayments } from '@/server/modules/subscriptions/service';
import { fail } from '@/server/shared/response';

// Relit chez pawaPay les paiements d'abonnement restés en attente et active
// ceux qui ont été encaissés (filet de sécurité si le callback se perd).
// Appelé toutes les 5 minutes par .github/workflows/paiements-en-attente.yml,
// avec l'en-tête « Authorization: Bearer <CRON_SECRET> ».
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret ?? ''}`);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  if (!secret || received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const data = await reconcilePendingPayments();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return fail(error);
  }
}
