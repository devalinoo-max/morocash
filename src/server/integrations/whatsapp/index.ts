import { sendSms } from '@/server/integrations/sms';

/**
 * Envoi d'un message WhatsApp (code de récupération du PIN).
 *
 * Le numéro saisi à l'inscription est un numéro WhatsApp : c'est par là que le
 * commerçant attend le code. Si l'API WhatsApp Cloud n'est pas configurée, on
 * retombe sur le SMS — le même numéro, un canal de moins bonne qualité, mais le
 * code part quand même. Et si aucun des deux n'est configuré, sendSms journalise
 * au lieu de fabriquer une fausse réussite.
 */
export async function sendWhatsApp(telephone: string, message: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.warn(
      '[WHATSAPP] WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID absents (.env) — repli sur le SMS.'
    );
    await sendSms(telephone, message);
    return;
  }

  const version = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: telephone,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  });

  if (!res.ok) {
    throw new Error(`Échec envoi WhatsApp: ${res.status} ${await res.text()}`);
  }
}
