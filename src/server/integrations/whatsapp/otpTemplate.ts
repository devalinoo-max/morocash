import * as Sentry from '@sentry/nextjs';

/**
 * Envoi du code par le modèle Meta « morocash_code_verification » (catégorie
 * Authentification, déjà approuvé : ne pas le modifier, Meta relancerait une
 * approbation). Le code est passé DEUX fois : dans le corps et dans le bouton
 * « Copier le code » ; sans cela Meta refuse l'envoi.
 *
 * Secrets lus dans l'environnement du serveur uniquement. Rien de ce qui suit
 * ne journalise le code ni le jeton.
 */

const SEND_TIMEOUT_MS = 8_000;

export class WhatsappSendError extends Error {
  constructor(
    message: string,
    /** Code d'erreur Meta (190 = jeton refusé), s'il y en a un. */
    readonly metaCode?: number,
    readonly httpStatus?: number
  ) {
    super(message);
    this.name = 'WhatsappSendError';
  }
}

/**
 * Numéro destinataire : E.164 sans « + » (ex. 2250170345808, 33612345678).
 * Côte d'Ivoire : 10 chiffres avec le 0 de tête.
 * À VÉRIFIER au premier envoi réel en Côte d'Ivoire : si Meta répond une erreur
 * sur le numéro destinataire, retenter sans le 0 de tête et garder la forme
 * qui passe. Résultat du test : à noter ici — pas encore exécuté.
 */
export function toWhatsappRecipient(internationalPhone: string): string {
  return internationalPhone;
}

function readConfig() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new WhatsappSendError('WhatsApp non configuré (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID).');
  }
  return {
    token,
    phoneNumberId,
    version: process.env.WHATSAPP_API_VERSION || 'v25.0',
    template: process.env.WHATSAPP_TEMPLATE_NAME || 'morocash_code_verification',
    lang: process.env.WHATSAPP_TEMPLATE_LANG || 'fr',
  };
}

async function postOnce(url: string, token: string, body: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    cache: 'no-store',
  });
}

/** Envoie le code et renvoie l'identifiant du message Meta (wamid…). */
export async function sendWhatsappCode(internationalPhone: string, code: string): Promise<string> {
  const cfg = readConfig();
  const url = `https://graph.facebook.com/${cfg.version}/${cfg.phoneNumberId}/messages`;
  const body = JSON.stringify({
    messaging_product: 'whatsapp',
    to: toWhatsappRecipient(internationalPhone),
    type: 'template',
    template: {
      name: cfg.template,
      language: { code: cfg.lang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  });

  let res: Response;
  try {
    res = await postOnce(url, cfg.token, body);
  } catch {
    // Un seul nouvel essai, et seulement sur une erreur réseau (ou le délai
    // de 8 s). Une réponse d'erreur de Meta n'est jamais rejouée.
    try {
      res = await postOnce(url, cfg.token, body);
    } catch {
      console.error('[whatsapp] envoi du code : réseau indisponible');
      throw new WhatsappSendError('Réseau indisponible.');
    }
  }

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { code?: number; error_subcode?: number; type?: string; message?: string };
    } | null;
    const metaCode = payload?.error?.code;
    // Journal sans le code ni le jeton : seulement ce que Meta répond sur l'erreur.
    console.error('[whatsapp] envoi du code refusé', {
      httpStatus: res.status,
      metaCode,
      subcode: payload?.error?.error_subcode,
      type: payload?.error?.type,
      message: payload?.error?.message,
    });
    if (metaCode === 190) {
      // Jeton refusé : seul le propriétaire peut le renouveler. Alerte dédiée.
      console.error(
        '[whatsapp] ALERTE PROPRIÉTAIRE : WHATSAPP_TOKEN est refusé par Meta (erreur 190). Les codes ne partent plus.'
      );
      Sentry.captureMessage('WhatsApp : jeton refusé par Meta (190)', 'fatal');
    }
    throw new WhatsappSendError('Meta a refusé l’envoi.', metaCode, res.status);
  }

  const data = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
  const id = data?.messages?.[0]?.id;
  if (!id) throw new WhatsappSendError('Réponse de Meta sans identifiant de message.', undefined, res.status);
  return id;
}
