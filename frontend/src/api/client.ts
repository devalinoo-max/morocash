// Client HTTP vers le vrai backend MoroCash (étape 13). Toutes les requêtes
// passent par le proxy same-origin de server.ts (voir PROXIED_PREFIXES) afin
// que le cookie de session (httpOnly, SameSite=Lax) circule normalement —
// un appel direct cross-origin vers le port 3000 ne recevrait pas ce cookie.

const CSRF_COOKIE = 'morocash_csrf';
const CSRF_HEADER = 'x-csrf-token';

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.details = payload.details;
  }
}

function readCookie(name: string): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : undefined;
}

// Compteur de requêtes en cours — sert uniquement à faire patienter la mise à
// jour auto-appliquée du Service Worker (PwaUpdateToast) : un rechargement
// pendant qu'une requête est en vol (ex. connexion/inscription) l'annule net,
// ce que le code appelant voit comme une simple erreur réseau.
let inFlightRequests = 0;
export function isRequestInFlight(): boolean {
  return inFlightRequests > 0;
}

type ApiEnvelope<T> =
  | { success: true; data: T; meta?: unknown }
  | { success: false; error: ApiErrorPayload; meta?: unknown };

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  if (method !== 'GET') {
    const csrfToken = readCookie(CSRF_COOKIE);
    if (csrfToken) {
      headers[CSRF_HEADER] = csrfToken;
    }
  }

  let response: Response;
  inFlightRequests += 1;
  try {
    try {
      response = await fetch(`/api/v1${path}`, {
        method,
        headers,
        body,
        credentials: 'include',
      });
    } catch {
      throw new ApiError({ code: 'NETWORK_ERROR', message: 'Impossible de joindre le serveur.' });
    }
  } finally {
    inFlightRequests -= 1;
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = await response.json();
  } catch {
    // Réponse non-JSON (ex: PDF) — laissée à l'appelant via un chemin dédié.
  }

  if (!envelope) {
    throw new ApiError({ code: 'SERVER_ERROR', message: 'Réponse invalide du serveur.' });
  }

  if (envelope.success === true) {
    return envelope.data;
  }

  throw new ApiError(envelope.error);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
