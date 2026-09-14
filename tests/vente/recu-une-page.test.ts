import { describe, expect, it } from 'vitest';
import {
  countPdfPages,
  generateReceiptsPdfBuffer,
  type ReceiptSaleData,
} from '../../frontend/server/receiptPdfGenerator';

/**
 * Un reçu = une seule page imprimée.
 *
 * Avant cette vérification, un ticket 58 ou 80 mm sortait TOUJOURS en trois
 * morceaux, même pour un seul article : le message, le QR et la mention
 * MoroCash débordaient sur deux petites pages de plus. Sur feuille A5, huit
 * articles suffisaient à passer sur une deuxième page.
 */

function recu(nbArticles: number, nom: (i: number) => string = (i) => `Riz parfumé 5kg n°${i}`): ReceiptSaleData {
  return {
    id: `o-${nbArticles}`,
    reference: 'CMD-20260914-0001',
    verifyUrl: 'https://morocashfront.vercel.app/api/v1/receipts/verify/cmbusiness0001/3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c',
    items: Array.from({ length: nbArticles }, (_, i) => ({ name: nom(i), unitPrice: 1_500, quantity: 2, total: 3_000 })),
    subtotal: 3_000 * nbArticles,
    discount: 500,
    discountMode: 'AMOUNT',
    totalAmount: 3_000 * nbArticles - 500,
    paidAmount: 1_000,
    remainingAmount: 3_000 * nbArticles - 1_500,
    paymentMethod: 'CASH',
    customerName: 'Awa Diallo',
    customerTotalDebt: 12_000,
    createdAt: '2026-09-14T10:00:00.000Z',
    sellerName: 'Moussa',
  };
}

const boutique = {
  shopName: 'Allo',
  telephone: '0700000000',
  adresse: 'Cocody, Abidjan',
  receiptMessage: 'Merci pour votre confiance ! À bientôt chez Allo.',
  showPhone: true,
};

const TICKETS = [
  ['58 mm', { largeurMm: 58, hauteurMm: null }],
  ['80 mm', { largeurMm: 80, hauteurMm: null }],
] as const;

const FEUILLES = [
  ['A5', { largeurMm: 148, hauteurMm: 210 }],
  ['A4', { largeurMm: 210, hauteurMm: 297 }],
] as const;

describe('Reçu PDF — tickets 58 et 80 mm : toujours une seule page', () => {
  for (const [nom, page] of TICKETS) {
    for (const n of [1, 8, 40]) {
      it(`${nom}, ${n} article(s), copie client et copie commerçant`, async () => {
        for (const isMerchantCopy of [false, true]) {
          const pdf = await generateReceiptsPdfBuffer({ sales: [recu(n)], settings: boutique, isMerchantCopy, page });
          expect(countPdfPages(pdf)).toBe(1);
        }
      });
    }
  }

  it('noms d articles très longs : toujours une page', async () => {
    const pdf = await generateReceiptsPdfBuffer({
      sales: [recu(10, (i) => `Pagne wax hollandais double face motif traditionnel édition limitée ${i}`)],
      settings: boutique,
      page: TICKETS[0][1],
    });
    expect(countPdfPages(pdf)).toBe(1);
  });
});

describe('Reçu PDF — feuilles A5 et A4 : une page pour un reçu courant', () => {
  for (const [nom, page] of FEUILLES) {
    // Au-delà, sur A5, il faudrait un texte de moins de 5,5 pt : illisible.
    for (const n of nom === 'A5' ? [1, 8, 20, 25] : [1, 8, 20, 30, 40]) {
      it(`${nom}, ${n} article(s)`, async () => {
        const pdf = await generateReceiptsPdfBuffer({ sales: [recu(n)], settings: boutique, isMerchantCopy: true, page });
        expect(countPdfPages(pdf)).toBe(1);
      });
    }
  }

  it('la page garde exactement le format de la feuille', async () => {
    const pdf = await generateReceiptsPdfBuffer({ sales: [recu(25)], settings: boutique, page: FEUILLES[0][1] });
    const box = /MediaBox\s*\[([^\]]+)\]/.exec(pdf.toString('latin1'))![1].trim().split(/\s+/).map(Number);
    expect(Math.round((box[2] * 25.4) / 72)).toBe(148);
    expect(Math.round((box[3] * 25.4) / 72)).toBe(210);
  });

  it('impression groupée : un reçu par page, jamais un reçu coupé en deux', async () => {
    const pdf = await generateReceiptsPdfBuffer({
      sales: [recu(3), recu(12), recu(25)],
      settings: boutique,
      page: FEUILLES[1][1],
    });
    expect(countPdfPages(pdf)).toBe(3);
  });
});
