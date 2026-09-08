import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        // 'prompt' : le nouveau Service Worker est téléchargé en arrière-plan
        // dès qu'il est disponible, mais n'active la nouvelle version qu'après
        // un clic explicite de l'utilisateur (cf. UpdateToast) — on évite de
        // recharger l'app en pleine vente en caisse.
        registerType: 'prompt',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'MoroCash — Gestion de Caisse & Ventes',
          short_name: 'MoroCash',
          description:
            "Enregistre tes ventes en 10 secondes. Suis ton stock, tes bénéfices et tes dettes, même sans connexion.",
          start_url: '/',
          scope: '/',
          display: 'standalone',
          background_color: '#F4F4F8',
          theme_color: '#4338CA',
          lang: 'fr',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Les appels /api/** ne sont JAMAIS servis depuis le cache : les
          // données de caisse (stock, dettes, caisse ouverte...) doivent
          // toujours venir du serveur, sous peine d'incohérences graves
          // (survente de stock, montant de caisse faux...). Seul l'app shell
          // (JS/CSS/HTML) est mis en cache pour l'usage hors-ligne.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /\/api\/.*/,
              handler: 'NetworkOnly',
            },
          ],
        },
        devOptions: {
          // Désactivé en dev (défaut vite-plugin-pwa) : un Service Worker actif
          // pendant le développement met en cache l'app et masque les modifs
          // tant qu'on n'a pas cliqué "Mettre à jour" (registerType 'prompt') —
          // source de faux bugs pendant l'itération. Il ne tourne qu'en build
          // de production (npm run build / preview), là où il a du sens.
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Aligné sur server.ts (étape 13) : le port 3000 est libéré pour le vrai
      // backend Next.js, ce serveur Vite/Express tourne sur 5173.
      port: 5173,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
