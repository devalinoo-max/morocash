import type { VercelRequest, VercelResponse } from '@vercel/node';

// L'import du générateur (et donc de @react-pdf/renderer, qui est du ESM pur)
// est volontairement dynamique et placé DANS le try du handler. En statique, un
// échec de chargement du module survient avant même l'exécution du handler :
// Vercel répond alors un FUNCTION_INVOCATION_FAILED en text/plain, sans pile
// d'appel côté client — le commerçant voyait "Erreur lors du téléchargement" et
// nous n'avions aucun moyen de savoir pourquoi. Chargé ici, le même échec
// ressort en JSON { error, details } avec le message réel.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const { sales = [], settings = {}, isMerchantCopy = false } = req.body || {};

  if (!Array.isArray(sales) || sales.length === 0) {
    res.status(400).json({ error: 'Aucune commande/reçu fourni' });
    return;
  }

  try {
    const { generateReceiptsPdfBuffer } = await import('../../../server/receiptPdfGenerator.js');
    const pdfBuffer = await generateReceiptsPdfBuffer({ sales, settings, isMerchantCopy });
    const filename =
      sales.length === 1
        ? `recu-${sales[0].reference || 'morocash'}.pdf`
        : `recus-groupes-${sales.length}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error('Erreur génération reçus PDF:', err);
    res.status(500).json({
      error: 'Erreur lors de la génération du PDF des reçus',
      details: err?.message || String(err),
    });
  }
}
