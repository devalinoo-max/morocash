'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

// Cette app est avant tout une API (le frontend réel vit dans /frontend, à
// brancher à l'étape 13) — les pages App Router sont minimales, mais ce
// gestionnaire capture toute erreur de rendu React qui surviendrait malgré tout.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body>
        <h2>Une erreur est survenue.</h2>
      </body>
    </html>
  );
}
