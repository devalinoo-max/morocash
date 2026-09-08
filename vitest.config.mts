import { configDefaults, defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Nettoie les boutiques de test (noms "Test…", "E2E…", "Verif…") laissées
    // dans la vraie base Neon par les tests d'intégration — compte à rebours
    // de 30s après la fin de la suite, cf. tests/global-teardown.ts.
    globalSetup: ['./tests/global-teardown.ts'],
    // izikit/ est un projet Next.js séparé cloné en sous-dossier (référence/outillage) —
    // sans exclusion, vitest ramasse aussi ses *.test.ts et échoue sur ses alias `@/...`.
    exclude: [...configDefaults.exclude, 'izikit/**'],
    // Chaque appel à scoped()/runInTenantTransaction() ouvre sa propre transaction
    // Neon (aller-retour réseau par requête, cf. repositories/base.ts) — les tests
    // qui enchaînent plusieurs commandes/opérations (étapes 6, 7) dépassaient les
    // 30s par défaut sans qu'aucune requête individuelle ne soit bloquée.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Ces tests frappent une vraie base Neon persistante (pas de transaction de
    // test annulée) — l'exécution en parallèle sature le pooler et fait expirer
    // des transactions ("Transaction not found"). Séquentiel = fiable.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
