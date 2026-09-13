import { defineConfig } from 'vitest/config';

/**
 * Tests du frontend, volontairement séparés de la suite racine.
 *
 * La suite racine (vitest.config.mts à la racine) parle à une vraie base Neon
 * et supprime les boutiques de test à la fin de chaque exécution. Rien ici n'a
 * besoin du réseau : ce sont les règles d'affichage — initiales, libellé de
 * stock, abréviation des montants — qui décident ce que le commerçant lit sur
 * une carte de 390 px de large, et elles doivent pouvoir se vérifier en une
 * seconde, sans base de données.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
