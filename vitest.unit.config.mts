import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests purs (sans base de données ni réseau) : pas de globalSetup, donc pas
// de nettoyage de la base Neon. Lancer avec `npm run test:unit`.
export default defineConfig({
  test: { environment: 'node', globals: true, include: ['tests/unit/**/*.test.ts'] },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});
