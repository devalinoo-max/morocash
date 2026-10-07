/**
 * Envoi d'e-mails via l'API HTTP de Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sans RESEND_API_KEY / EMAIL_FROM, on journalise au lieu d'envoyer, comme
 * pour le SMS : jamais de fausse réussite silencieuse.
 */
export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn(
      `[EMAIL:DEV] RESEND_API_KEY / EMAIL_FROM absents (.env) — e-mail non envoyé à ${input.to}: "${input.subject}" ${input.text}`
    );
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
  });

  if (!res.ok) {
    throw new Error(`Échec envoi e-mail: ${res.status} ${await res.text()}`);
  }
}
