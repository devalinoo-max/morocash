import { NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import * as Sentry from '@sentry/nextjs';
import { AppError } from './errors';

// Contrat de réponse exact du cahier des charges (spec §8).
export function ok<T>(data: T, init?: { status?: number }) {
  return NextResponse.json(
    { success: true, data, meta: { requestId: `req_${nanoid(12)}` } },
    { status: init?.status ?? 200 }
  );
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        success: false,
        error: { code: error.code, message: error.message, details: error.details ?? {} },
        meta: { requestId: `req_${nanoid(12)}` },
      },
      { status: error.status }
    );
  }

  // Toute erreur inattendue est interceptée ici (try/catch systématique par
  // route, spec-conforme à l'enveloppe {success:false,...}) — jamais laissée
  // remonter comme exception non gérée. Sentry ne la verrait donc jamais via
  // son hook automatique `onRequestError` : on la capture explicitement ici,
  // seul point de passage commun à toutes les routes (étape 12).
  console.error('Erreur serveur non gérée:', error);
  Sentry.captureException(error);
  return NextResponse.json(
    {
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Une erreur interne est survenue.', details: {} },
      meta: { requestId: `req_${nanoid(12)}` },
    },
    { status: 500 }
  );
}
