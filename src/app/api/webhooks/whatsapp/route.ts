import { applyStatuses, isValidSignature, isValidVerifyToken } from '@/server/integrations/whatsapp/webhook';

// GET : vérification de l'adresse par Meta (à l'enregistrement du webhook).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const challenge = params.get('hub.challenge');
  if (params.get('hub.mode') === 'subscribe' && isValidVerifyToken(params.get('hub.verify_token')) && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new Response('Forbidden', { status: 403 });
}

// POST : statuts de livraison. Signature vérifiée sur le corps brut AVANT tout traitement.
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!isValidSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    return new Response('Invalid signature', { status: 401 });
  }

  try {
    await applyStatuses(rawBody);
  } catch (error) {
    // Un statut perdu n'est pas grave : on répond 200 pour que Meta ne rejoue pas en boucle.
    console.error('[whatsapp] webhook : statut non enregistré', error instanceof Error ? error.message : error);
  }
  return new Response('OK', { status: 200 });
}
