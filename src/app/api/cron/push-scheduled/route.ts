import { NextResponse } from 'next/server';
import { sendDueBroadcasts } from '@/server/modules/push/service';
import { fail } from '@/server/shared/response';

// Envoie les notifications programmées arrivées à échéance. Appelé toutes les
// 5 minutes par .github/workflows/notifications-programmees.yml, avec
// l'en-tête « Authorization: Bearer <CRON_SECRET> » (même convention que
// Vercel Cron, qui pourra prendre le relais sans changer cette route).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const result = await sendDueBroadcasts();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return fail(error);
  }
}
