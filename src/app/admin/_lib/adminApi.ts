// Client HTTP vers les routes /api/v1/admin/* — même origine (port 3000), pas
// de proxy nécessaire ici contrairement au frontend Vite. Reprend l'enveloppe
// {success, data|error} exacte du backend (voir src/server/shared/response.ts).

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

type ApiEnvelope<T> =
  | { success: true; data: T; meta?: unknown }
  | { success: false; error: ApiErrorPayload; meta?: unknown };

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = {};
  let body: string | undefined;

  if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.body);
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1/admin${path}`, { method, headers, body, credentials: 'include' });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: 'Impossible de joindre le serveur.' });
  }

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = await response.json();
  } catch {
    // pas de corps JSON
  }

  if (!envelope) {
    throw new ApiError({ code: 'SERVER_ERROR', message: 'Réponse invalide du serveur.' });
  }

  if (envelope.success === true) {
    return envelope.data;
  }

  throw new ApiError(envelope.error);
}

export const adminApi = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
};

export function adminErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Impossible de joindre le serveur. Réessaie.';
}
