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
          // L'app installée ouvre l'accueil, jamais la page de présentation :
          // celui qui a installé MoroCash sur son écran d'accueil vient
          // travailler, pas lire une publicité (point 3).
          start_url: '/accueil',
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
          // Coquille de l'app mise en cache à l'installation : HTML, JS, CSS,
          // icônes, polices locales. C'est ce qui permet d'OUVRIR l'app en
          // mode avion au lieu de tomber sur la page d'erreur du navigateur.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],

          // Toute navigation hors-ligne (/accueil, /produits, /caisse...)
          // retombe sur index.html : c'est une application à page unique, le
          // routage se fait ensuite côté navigateur.
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],

          runtimeCaching: [
            {
              // Les appels /api/** ne sont JAMAIS servis depuis le cache HTTP :
              // les données de caisse (stock, dettes, caisse ouverte...) ne
              // supportent pas d'être servies périmées sans qu'on le sache.
              // La lecture hors-ligne passe par l'instantané IndexedDB écrit
              // par l'app elle-même (voir src/offline/cache.ts), qui, lui,
              // est daté et affiché comme tel.
              urlPattern: /\/api\/.*/,
              handler: 'NetworkOnly',
            },
            {
              // Les polices Google sont chargées par index.html : sans cache,
              // la première ouverture hors-ligne perd toute la typographie.
              urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-stylesheets' },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-files',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Photos produit (Cloudinary) : indispensables pour reconnaître
              // un article d'un coup d'oeil en caisse, y compris sans réseau.
              urlPattern: /^https:\/\/res\.cloudinary\.com\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'product-images',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
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
