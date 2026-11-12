import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/server/database/client';

/**
 * Webhook WhatsApp : sert uniquement à savoir si un code est arrivé (delivered)
 * ou a échoué (failed). La connexion ne dépend jamais de lui.
 */

function safeEqualStrings(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vérification GET de Meta : le jeton doit être celui de WHATSAPP_VERIFY_TOKEN (jamais vide). */
export function isValidVerifyToken(token: string | null): boolean {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  return !!expected && !!token && safeEqualStrings(token, expected);
}

/**
 * En-tête `X-Hub-Signature-256` (« sha256=<hex> ») : HMAC-SHA256 du CORPS BRUT
 * avec la clé secrète de l'application. Sans clé configurée, tout est refusé.
 */
export function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header || !header.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return safeEqualStrings(header.slice('sha256='.length), expected);
}

// Un statut ne revient jamais en arrière (« read » peut arriver avant « delivered »).
const RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

interface WaStatus {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string }[];
}

interface WaPayload {
  entry?: { changes?: { value?: { statuses?: WaStatus[] } }[] }[];
}

/** Met à jour `waStatus` des codes concernés. Un message inconnu est ignoré sans erreur. */
export async function applyStatuses(rawBody: string): Promise<void> {
  let payload: WaPayload;
  try {
    payload = JSON.parse(rawBody) as WaPayload;
  } catch {
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const st of change.value?.statuses ?? []) {
        const rank = st.status ? RANK[st.status] : undefined;
        if (!st.id || !st.status || !rank) continue;
        if (st.status === 'failed') {
          // Seulement le code d'erreur de Meta : jamais le numéro ni le message.
          console.warn('[whatsapp] statut failed', { errors: st.errors?.map((e) => e.code) });
        }
        const lower = Object.keys(RANK).filter((s) => RANK[s] < rank);
        await prisma.whatsappOtp.updateMany({
          where: { waMessageId: st.id, OR: [{ waStatus: null }, { waStatus: { in: lower } }] },
          data: { waStatus: st.status },
        });
      }
    }
  }
}
