/**
 * Envoi de SMS (récupération de code, relances d'abonnement).
 * Si SMS_PROVIDER_URL / SMS_PROVIDER_KEY ne sont pas configurés (identifiants réels non
 * encore fournis), on journalise le message au lieu de l'envoyer — ne jamais fabriquer
 * une fausse réussite silencieuse en production.
 */
export async function sendSms(telephone: string, message: string): Promise<void> {
  const url = process.env.SMS_PROVIDER_URL;
  const key = process.env.SMS_PROVIDER_KEY;

  if (!url || !key) {
    console.warn(
      `[SMS:DEV] Aucun fournisseur SMS configuré (.env) — message non envoyé à ${telephone}: "${message}"`
    );
    return;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      to: telephone,
      message,
      sender: process.env.SMS_SENDER_ID ?? 'MOROCASH',
    }),
  });

  if (!res.ok) {
    throw new Error(`Échec envoi SMS: ${res.status} ${await res.text()}`);
  }
}
