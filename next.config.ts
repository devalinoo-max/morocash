import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// En-têtes de sécurité posés sur toutes les réponses (pages admin et API).
// `frame-ancestors 'self'` / SAMEORIGIN : personne d'autre ne peut afficher
// l'app dans un cadre pour piéger un clic. Pas de CSP complète ici : elle
// demanderait d'inventorier chaque script, police et image tierce.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  typescript: {
    // Sans les tests : voir tsconfig.build.json.
    tsconfigPath: 'tsconfig.build.json',
  },
};

// SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN ([HUMAN INPUT REQUIRED]) ne sont
// nécessaires que pour l'upload des source maps au build — absents, ce wrapper
// n'échoue pas, il désactive simplement cet upload.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
