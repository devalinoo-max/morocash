import { api } from './client';

// Abonnement de CET appareil aux notifications envoyées depuis le back-office.
// Le Service Worker n'existe qu'en build de production (voir devOptions dans
// vite.config.ts) : en dev, isPushSupported() renvoie false.

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    import.meta.env.PROD
  );
}

/** iPhone/iPad : le push n'existe que dans l'app ajoutée à l'écran d'accueil. */
export function needsIosInstall(): boolean {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIos && !isStandalone;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/**
 * Demande l'autorisation, crée l'abonnement push et l'envoie au serveur.
 * Renvoie la permission obtenue : 'granted' si tout s'est bien passé.
 */
export async function enablePush(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;

  const { publicKey } = await api.get<{ publicKey: string }>('/push/public-key');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await api.post('/push/subscription', subscription.toJSON());
  return permission;
}

/**
 * À l'ouverture de session : si l'autorisation est déjà donnée, l'abonnement
 * est (re)créé sans rien demander et rattaché au compte connecté (utile si un
 * autre compte se connecte sur ce téléphone). Sinon, c'est PushReminder qui
 * invite le commerçant à les activer, tous les 3 jours.
 */
export function setupAutoPush(): void {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  void enablePush().catch(() => {});
}
