import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { generateLabelsPdfBuffer } from './server/labelPdfGenerator';
import { generateReceiptsPdfBuffer } from './server/receiptPdfGenerator';

// Le vrai backend Next.js (étapes 1-10, 12) écoute sur le port 3000. On déplace
// ce serveur frontend (Express + Vite en middleware mode) sur 5173 pour libérer
// 3000, et on relaie les domaines déjà branchés (étape 13, "parcours complet
// d'abord" puis extension dépenses/stock/rapports/employés) vers le vrai
// backend. Les routes encore mockées ici (plans, PDF locaux) restent gérées
// par cet Express — leur équivalent réel n'existe pas encore (plans) ou a un
// équivalent réel plus limité (PDF unitaire seulement).
const PORT = 5173;
const BACKEND_ORIGIN = 'http://localhost:3000';
const PROXIED_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/categories',
  '/api/v1/products',
  '/api/v1/customers',
  '/api/v1/orders',
  '/api/v1/cash',
  '/api/v1/expenses',
  '/api/v1/stock',
  '/api/v1/dashboard',
  '/api/v1/reports',
  '/api/v1/users',
];

async function startServer() {
  const app = express();

  // Exception : /api/v1/products/labels reste géré localement (PDF généré ici,
  // aucune UI de l'étape 13 ne l'a encore rebranché sur l'équivalent réel) — il
  // doit donc être déclaré AVANT le proxy générique sur /api/v1/products,
  // Express retenant la première route qui correspond dans l'ordre de montage.
  app.post('/api/v1/products/labels', express.json({ limit: '15mb' }), async (req, res) => {
    try {
      const {
        productIds = [],
        copies = {},
        options = {},
        products = [],
        settings = {},
      } = req.body || {};

      let targetProducts = products;
      if (Array.isArray(products) && products.length > 0) {
        targetProducts = products.filter(
          (p: any) =>
            productIds.includes(p.id) || (typeof copies[p.id] === 'number' && copies[p.id] > 0)
        );
        if (targetProducts.length === 0) {
          targetProducts = products;
        }
      }

      const pdfBuffer = await generateLabelsPdfBuffer({
        products: targetProducts,
        copies,
        options: {
          champs: options.champs || ['nom', 'prix', 'code'],
          format: options.format || '24_63x34',
          tailleTexte: options.tailleTexte || 'NORMAL',
          typeCode: options.typeCode || 'QR',
          traitsDecoupe: options.traitsDecoupe !== undefined ? options.traitsDecoupe : true,
          startIndex: options.startIndex ? Number(options.startIndex) : 1,
          customDimensions: options.customDimensions,
        },
        settings,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="etiquettes-morocash.pdf"');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err: any) {
      console.error('Erreur génération étiquettes PDF:', err);
      res.status(500).json({
        error: 'Erreur lors de la génération du PDF des étiquettes',
        details: err?.message || String(err),
      });
    }
  });

  // Le proxy doit être monté AVANT express.json() : express.json() consomme le
  // corps de la requête en flux, et http-proxy-middleware doit pouvoir le relayer
  // tel quel au backend réel. Filtré via `pathFilter` (et non `app.use(prefix, ...)`)
  // car un montage Express par préfixe tronque ce préfixe de req.url avant que le
  // proxy ne le voie (ex: /api/v1/auth/register devenait /register côté backend,
  // 404 garanti) — pathFilter laisse l'URL complète intacte.
  app.use(
    createProxyMiddleware({
      pathFilter: PROXIED_PREFIXES,
      target: BACKEND_ORIGIN,
      changeOrigin: true,
    })
  );

  // Middleware for parsing JSON with generous limit for product payload / photos
  app.use(express.json({ limit: '15mb' }));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // GET /api/v1/plans
  // Returns the active plans configuration
  app.get('/api/v1/plans', (req, res) => {
    res.json({
      plans: [
        {
          id: 'SOLO',
          nom: 'Formule Solo',
          prixMensuel: 15000,
          prixAnnuel: 150000,
          maxUsers: 1,
          maxProduits: 1000,
          rapportsComparatifs: false,
          exportExcel: false,
          employesAutorises: false,
          actif: true,
          baseline: 'Si tu vends tout seul',
          aide: 'chat',
        },
        {
          id: 'BUSINESS',
          nom: 'Formule Business',
          prixMensuel: 20000,
          prixAnnuel: 200000,
          maxUsers: 5,
          maxProduits: 0,
          rapportsComparatifs: true,
          exportExcel: true,
          employesAutorises: true,
          actif: true,
          baseline: 'Si tu as des vendeurs qui travaillent pour toi',
          aide: 'WhatsApp prioritaire',
        },
      ],
    });
  });

  // POST /api/v1/receipts/pdf
  // Generates server-side PDF for one or multiple receipts (1 receipt per page)
  app.post('/api/v1/receipts/pdf', async (req, res) => {
    try {
      const {
        sales = [],
        settings = {},
        isMerchantCopy = false,
      } = req.body || {};

      if (!Array.isArray(sales) || sales.length === 0) {
        return res.status(400).json({ error: 'Aucune commande/reçu fourni' });
      }

      const pdfBuffer = await generateReceiptsPdfBuffer({
        sales,
        settings,
        isMerchantCopy,
      });

      const filename = sales.length === 1
        ? `recu-${sales[0].reference || 'morocash'}.pdf`
        : `recus-groupes-${sales.length}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err: any) {
      console.error('Erreur génération reçus PDF:', err);
      res.status(500).json({
        error: 'Erreur lors de la génération du PDF des reçus',
        details: err?.message || String(err),
      });
    }
  });

  // Vite middleware in dev or static files in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server MoroCash running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup error:', err);
  process.exit(1);
});
