import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock encore non rebranché sur un vrai module backend (voir server.ts en
// développement local) — reproduit ici à l'identique pour la prod Vercel.
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    plans: [
      {
        id: 'SOLO',
        nom: 'Formule Solo',
        prixMensuel: 9900,
        prixTrimestriel: 27600,
        prixSemestriel: 51700,
        prixAnnuel: 99000,
        maxUsers: 2,
        maxCommandesMois: 900,
        maxProduits: 1000,
        rapportsComparatifs: false,
        exportExcel: false,
        employesAutorises: true,
        actif: true,
        baseline: 'Si tu vends tout seul',
        aide: 'chat',
      },
      {
        id: 'BUSINESS',
        nom: 'Formule Business',
        prixMensuel: 19900,
        prixTrimestriel: 55500,
        prixSemestriel: 103900,
        prixAnnuel: 199000,
        maxUsers: 10,
        maxCommandesMois: 0,
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
}
