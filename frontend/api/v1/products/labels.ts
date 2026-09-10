import type { VercelRequest, VercelResponse } from '@vercel/node';

// Import dynamique dans le try, même raison que api/v1/receipts/pdf.ts : un
// échec de chargement de @react-pdf/renderer (ESM pur) au niveau du module
// donne un FUNCTION_INVOCATION_FAILED muet ; ici il ressort en JSON.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

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
        (p: any) => productIds.includes(p.id) || (typeof copies[p.id] === 'number' && copies[p.id] > 0)
      );
      if (targetProducts.length === 0) {
        targetProducts = products;
      }
    }

    const { generateLabelsPdfBuffer } = await import('../../_lib/labelPdfGenerator.js');
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
    res.status(200).send(pdfBuffer);
  } catch (err: any) {
    console.error('Erreur génération étiquettes PDF:', err);
    res.status(500).json({
      error: 'Erreur lors de la génération du PDF des étiquettes',
      details: err?.message || String(err),
    });
  }
}
