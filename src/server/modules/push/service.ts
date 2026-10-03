import webpush from 'web-push';
import { z } from 'zod';
import { AppError } from '@/server/shared/errors';
import {
  createPushBroadcast,
  deletePushSubscriptionForUser,
  deletePushSubscriptions,
  findBusinessName,
  listPushTargets,
  markPushSubscriptionsUsed,
  upsertPushSubscription,
} from '@/server/repositories/push';

/**
 * Notifications push (Web Push, clés VAPID). Les clés vivent dans les
 * variables d'environnement : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et
 * VAPID_SUBJECT (une URL https ou un mailto:, exigé par les services push).
 */

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new AppError('SERVER_ERROR', 'Notifications non configurées : clés VAPID absentes.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    throw new AppError('SERVER_ERROR', 'Notifications non configurées : clés VAPID absentes.');
  }
  return key;
}

// ─────────────── Abonnement d'un appareil ───────────────

export const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export function subscribeDevice(
  ctx: { businessId: string; userId: string },
  input: z.infer<typeof subscribeSchema>,
  userAgent?: string | null
) {
  return upsertPushSubscription({
    businessId: ctx.businessId,
    userId: ctx.userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? undefined,
  });
}

export const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) });

export function unsubscribeDevice(userId: string, endpoint: string) {
  return deletePushSubscriptionForUser(endpoint, userId);
}

// ─────────────── Envoi depuis l'admin ───────────────

export const broadcastSchema = z
  .object({
    titre: z.string().trim().min(1, 'Le titre est obligatoire.').max(60, '60 caractères maximum pour le titre.'),
    message: z.string().trim().min(1, 'Le message est obligatoire.').max(240, '240 caractères maximum pour le message.'),
    // Page de l'app à ouvrir au clic (« /abonnement »…). Vide : l'accueil.
    lien: z
      .string()
      .trim()
      .max(200)
      .regex(/^\/[^\s]*$/, 'Le lien doit être une page de l’app, commençant par « / ».')
      .optional()
      .or(z.literal('')),
    cible: z.enum(['TOUS', 'BOUTIQUE']),
    businessId: z.string().cuid().optional(),
  })
  .refine((v) => v.cible !== 'BOUTIQUE' || !!v.businessId, {
    message: 'Choisis la boutique à notifier.',
    path: ['businessId'],
  });

// Envois simultanés vers les services push : assez pour aller vite, pas assez
// pour saturer la fonction serverless.
const CONCURRENCY = 50;

export async function sendBroadcast(adminUserId: string, input: z.infer<typeof broadcastSchema>) {
  ensureConfigured();

  const businessId = input.cible === 'BOUTIQUE' ? input.businessId : undefined;
  if (businessId && !(await findBusinessName(businessId))) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable.');
  }

  const lien = input.lien || undefined;
  const payload = JSON.stringify({ title: input.titre, body: input.message, url: lien ?? '/accueil' });
  const targets = await listPushTargets(businessId);

  const delivered: string[] = [];
  const expired: string[] = [];
  let echecs = 0;

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((t) =>
        webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
          TTL: 24 * 60 * 60,
        })
      )
    );
    results.forEach((r, idx) => {
      const target = batch[idx];
      if (r.status === 'fulfilled') {
        delivered.push(target.id);
        return;
      }
      const status = (r.reason as { statusCode?: number })?.statusCode;
      // 404/410 : l'utilisateur a retiré l'autorisation ou désinstallé l'app.
      if (status === 404 || status === 410) expired.push(target.id);
      else echecs += 1;
    });
  }

  await Promise.all([deletePushSubscriptions(expired), markPushSubscriptionsUsed(delivered)]);

  return createPushBroadcast({
    adminUserId,
    titre: input.titre,
    message: input.message,
    lien,
    cible: input.cible,
    businessId,
    appareils: targets.length,
    envoyes: delivered.length,
    echecs: echecs + expired.length,
  });
}
