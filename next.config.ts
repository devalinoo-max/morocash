import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// En-têtes de sécurité posés sur toutes les réponses (pages admin et API).
// `frame-ancestors 'self'` / SAMEORIGIN : personne d'autre ne peut afficher
// l'app dans un cadre pour piéger un clic.
//
// CSP : tout est servi depuis l'origine. Les polices sont auto-hébergées par
// next/font, l'API est appelée en same-origin, aucun script/police/CDN tiers.
// `script-src 'unsafe-inline'` reste nécessaire (scripts d'hydratation Next sans
// nonce) et `style-src 'unsafe-inline'` pour les styles injectés par Next/Tailwind
// — `object-src 'none'`, `base-uri 'self'` et `form-action 'self'` ferment malgré
// tout les vecteurs d'injection les plus courants. En dev seulement : 'unsafe-eval'
// (HMR) et le WebSocket du serveur de dev.
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  'img-src ' + "'self' data: blob: https:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: csp },
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
