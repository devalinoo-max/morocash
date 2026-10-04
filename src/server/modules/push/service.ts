import webpush from 'web-push';
import { z } from 'zod';
import { AppError } from '@/server/shared/errors';
import { isSubscriptionLapsed } from '@/server/shared/subscription';
import {
  cancelPushBroadcast,
  claimPushBroadcast,
  claimRelance,
  createPushBroadcast,
  deletePushSubscriptionForUser,
  deletePushSubscriptions,
  finishPushBroadcast,
  findBusinessName,
  findLastOrderAt,
  listDuePushBroadcasts,
  listRelanceCandidates,
  listPushTargets,
  markPushSubscriptionsUsed,
  releasePushBroadcast,
  upsertPushSubscription,
} from '@/server/repositories/push';

/**
 * Notifications push (Web Push, clés VAPID). Les clés vivent dans les
 * variables d'environnement : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et
 * VAPID_SUBJECT (une URL https ou un mailto:, exigé par les services push).
 */

let configured = false;

/**
 * Valeur d'une variable VAPID, sans espaces ni guillemets autour : collés
 * depuis le .env dans Vercel, ils passent la validation de web-push mais
 * faussent la signature, qu'Apple refuse alors (403 BadJwtToken).
 */
function vapidEnv(name: 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY' | 'VAPID_SUBJECT'): string | undefined {
  return process.env[name]?.trim().replace(/^["']|["']$/g, '').trim() || undefined;
}

function ensureConfigured() {
  if (configured) return;
  const publicKey = vapidEnv('VAPID_PUBLIC_KEY');
  const privateKey = vapidEnv('VAPID_PRIVATE_KEY');
  const subject = vapidEnv('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) {
    throw new AppError('SERVER_ERROR', 'Notifications non configurées : clés VAPID absentes.');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function getVapidPublicKey(): string {
  const key = vapidEnv('VAPID_PUBLIC_KEY');
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


const MIN_DELAY_MS = 60 * 1000;
const MAX_DELAY_MS = 365 * 24 * 60 * 60 * 1000;

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
    // Date d'envoi (ISO, fuseau compris). Absente : envoi immédiat.
    programmeLe: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.cible !== 'BOUTIQUE' || !!v.businessId, {
    message: 'Choisis la boutique à notifier.',
    path: ['businessId'],
  })
  .refine(
    (v) => {
      if (!v.programmeLe) return true;
      const delay = new Date(v.programmeLe).getTime() - Date.now();
      return delay >= MIN_DELAY_MS && delay <= MAX_DELAY_MS;
    },
    { message: 'Choisis une date d’envoi dans le futur (au plus dans un an).', path: ['programmeLe'] }
  );

type BroadcastContent = {
  titre: string;
  message: string;
  lien?: string | null;
  businessId?: string | null;
  /** Plusieurs boutiques à la fois (relances) ; prioritaire sur businessId. */
  businessIds?: string[];
};

// Envois simultanés vers les services push : assez pour aller vite, pas assez
// pour saturer la fonction serverless.
const CONCURRENCY = 50;

/** Envoie une notification aux appareils visés et compte le résultat. */
async function deliver(content: BroadcastContent) {
  ensureConfigured();

  const payload = JSON.stringify({ title: content.titre, body: content.message, url: content.lien || '/accueil' });
  const targets = await listPushTargets(content.businessIds ?? content.businessId ?? undefined);

  const delivered: string[] = [];
  const expired: string[] = [];
  let echecs = 0;
  // Premier refus d'un service push, renvoyé à l'admin : sans lui, un échec
  // (clés VAPID mal copiées dans Vercel...) reste incompréhensible.
  let premiereErreur: string | null = null;

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
      const reason = r.reason as { statusCode?: number; body?: string; message?: string };
      const status = reason?.statusCode;
      if (!premiereErreur) {
        premiereErreur = [status, reason?.body || reason?.message].filter(Boolean).join(' — ').slice(0, 300);
        console.error('Envoi push refusé:', new URL(target.endpoint).host, premiereErreur);
      }
      // 404/410 : l'utilisateur a retiré l'autorisation ou désinstallé l'app.
      if (status === 404 || status === 410) expired.push(target.id);
      else echecs += 1;
    });
  }

  await Promise.all([deletePushSubscriptions(expired), markPushSubscriptionsUsed(delivered)]);

  return {
    counts: { appareils: targets.length, envoyes: delivered.length, echecs: echecs + expired.length },
    premiereErreur,
  };
}

/** Envoi immédiat, ou mise en attente si `programmeLe` est renseigné (le cron l'enverra). */
export async function sendBroadcast(adminUserId: string, input: z.infer<typeof broadcastSchema>) {
  const businessId = input.cible === 'BOUTIQUE' ? input.businessId : undefined;
  if (businessId && !(await findBusinessName(businessId))) {
    throw new AppError('RESOURCE_NOT_OWNED', 'Boutique introuvable.');
  }

  const content = {
    adminUserId,
    titre: input.titre,
    message: input.message,
    lien: input.lien || undefined,
    cible: input.cible,
    businessId,
  };

  if (input.programmeLe) {
    // Vérifie les clés dès maintenant : mieux vaut un refus à l'écran qu'un
    // échec silencieux à l'heure dite.
    ensureConfigured();
    const broadcast = await createPushBroadcast({
      ...content,
      statut: 'PROGRAMME',
      programmeLe: new Date(input.programmeLe),
    });
    return { broadcast, premiereErreur: null };
  }

  const { counts, premiereErreur } = await deliver(content);
  const broadcast = await createPushBroadcast({ ...content, ...counts, statut: 'ENVOYE', envoyeLe: new Date() });
  return { broadcast, premiereErreur };
}

export async function cancelScheduledBroadcast(id: string) {
  const { count } = await cancelPushBroadcast(id);
  if (count === 0) {
    throw new AppError('VALIDATION_ERROR', 'Cette notification n’est plus programmée : elle est déjà partie ou annulée.');
  }
}

/**
 * Appelé par le cron : envoie les notifications programmées dont l'heure est
 * passée. Chacune est d'abord réservée (PROGRAMME → EN_COURS) pour qu'un
 * second appel simultané ne l'envoie pas une deuxième fois.
 */
export async function sendDueBroadcasts() {
  const due = await listDuePushBroadcasts(new Date());
  let traitees = 0;
  for (const b of due) {
    if (!(await claimPushBroadcast(b.id))) continue;
    try {
      const { counts } = await deliver(b);
      await finishPushBroadcast(b.id, counts);
    } catch (error) {
      // Clés absentes ou base indisponible : on la remet en file pour le passage suivant.
      await releasePushBroadcast(b.id);
      throw error;
    }
    traitees += 1;
  }
  return { traitees };
}

// ─────────────── Relances d'inactivité ───────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const INACTIVITE_MS = 3 * DAY_MS;
const RELANCE_INTERVAL_MS = 7 * DAY_MS;
// Fenêtre d'envoi en heure GMT (Côte d'Ivoire, Sénégal, Mali, Burkina, Togo :
// GMT ; Bénin : GMT+1) : jamais la nuit.
const RELANCE_HEURE_MIN = 10;
const RELANCE_HEURE_MAX = 19;

/** Textes choisis le 2026-10-04 : un par situation. */
export const RELANCE_MESSAGES = {
  RELANCE_INACTIF: {
    titre: 'Tout va bien à la boutique ?',
    message:
      'On ne t’a pas vu depuis 3 jours. Si tu as vendu entre-temps, ajoute tes ventes pour ne rien perdre de ton suivi.',
    lien: '/accueil',
  },
  RELANCE_SANS_VENTE: {
    titre: 'Tu n’as rien oublié ?',
    message:
      'Aucune vente enregistrée depuis 3 jours. Prends 1 minute pour noter tes ventes et garder tes chiffres à jour.',
    lien: '/commandes/nouvelle',
  },
  RELANCE_EXPIRE: {
    titre: 'Ton abonnement a expiré',
    message:
      'Tes données sont toujours là, mais tu ne peux plus enregistrer de ventes. Renouvelle ton abonnement pour reprendre ton suivi.',
    lien: '/abonnement',
  },
} as const;

type RelanceType = keyof typeof RELANCE_MESSAGES;

/**
 * Appelé par le cron : relance les boutiques inactives depuis 3 jours, une
 * fois par semaine au plus.
 * - RELANCE_EXPIRE : essai ou abonnement échu. Prioritaire : les deux autres
 *   inviteraient à enregistrer des ventes que l'app refuse ;
 * - RELANCE_INACTIF : aucun de leurs comptes n'a ouvert l'app depuis 3 jours ;
 * - RELANCE_SANS_VENTE : l'app est ouverte, mais aucune vente depuis 3 jours.
 * Si les deux s'appliquent, seule la première part. Chaque passage est
 * enregistré dans l'historique de la page Notifications de l'admin.
 */
export async function sendInactivityReminders(now = new Date()) {
  const heure = now.getUTCHours();
  if (heure < RELANCE_HEURE_MIN || heure >= RELANCE_HEURE_MAX) return { relancees: 0 };
  // Avant de réserver quoi que ce soit : sans clés, la relance de la semaine serait perdue.
  ensureConfigured();

  const limite = new Date(now.getTime() - INACTIVITE_MS);
  const relanceAvant = new Date(now.getTime() - RELANCE_INTERVAL_MS);
  const candidates = await listRelanceCandidates({ since: limite, relanceAvant });

  const groupes: Record<RelanceType, string[]> = {
    RELANCE_INACTIF: [],
    RELANCE_SANS_VENTE: [],
    RELANCE_EXPIRE: [],
  };
  for (const b of candidates) {
    const derniereVisite = Math.max(0, ...b.users.map((u) => u.lastSeenAt?.getTime() ?? 0));
    let type: RelanceType | null = null;
    if (isSubscriptionLapsed(b)) {
      type = 'RELANCE_EXPIRE';
    } else if (derniereVisite < limite.getTime()) {
      type = 'RELANCE_INACTIF';
    } else {
      // Une boutique qui n'a jamais vendu compte depuis son inscription.
      const derniereVente = (await findLastOrderAt(b.id)) ?? b.createdAt;
      if (derniereVente < limite) type = 'RELANCE_SANS_VENTE';
    }
    if (type && (await claimRelance(b.id, relanceAvant))) groupes[type].push(b.id);
  }

  let relancees = 0;
  for (const type of Object.keys(groupes) as RelanceType[]) {
    const businessIds = groupes[type];
    if (businessIds.length === 0) continue;
    const content = RELANCE_MESSAGES[type];
    const { counts } = await deliver({ ...content, businessIds });
    await createPushBroadcast({
      adminUserId: 'SYSTEME',
      ...content,
      cible: type,
      ...counts,
      statut: 'ENVOYE',
      envoyeLe: new Date(),
    });
    relancees += businessIds.length;
  }
  return { relancees };
}
