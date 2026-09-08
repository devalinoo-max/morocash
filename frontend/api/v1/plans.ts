import type { VercelRequest, VercelResponse } from '@vercel/node';

// Mock encore non rebranché sur un vrai module backend (voir server.ts en
// développement local) — reproduit ici à l'identique pour la prod Vercel.
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
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
}
