import * as Sentry from '@sentry/nextjs';

// SENTRY_DSN vide en développement tant que le DSN réel n'est pas fourni
// ([HUMAN INPUT REQUIRED], spec §1.7) — le SDK reste inactif (no-op) sans DSN,
// aucune erreur n'est levée.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
