import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
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
