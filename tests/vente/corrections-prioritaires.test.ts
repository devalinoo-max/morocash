import { afterEach, describe, expect, it } from 'vitest';
import {
  editableReceiptMessage,
  generateReceiptWhatsAppText,
  receiptPhone,
  receiptVerifyUrl,
  resolveReceiptMessage,
  toStoredReceiptMessage,
} from '../../frontend/src/utils/receiptHelpers';
import { getCustomRange, getPreviousCustomRange, isWithinRange } from '../../frontend/src/utils/period';
import { formatCatalogPrice, toCatalogRows } from '../../frontend/src/utils/catalogExport';
import { initialSettings } from '../../frontend/src/data/mockInitialData';
import { createOrderSchema } from '@/server/modules/orders/createOrder';
import { findVerifiedReceipt } from '@/server/modules/receipts/verify';
import type { Product, Sale, ShopSettings } from '../../frontend/src/types';

/**
 * Corrections prioritaires (tickets 1 à 8) : ce qui se vérifie sans écran ni
 * base de données.
 */

function boutique(over: Partial<ShopSettings> = {}): ShopSettings {
  return { ...initialSettings, ...over };
}

function vente(over: Partial<Sale> = {}): Sale {
  return {
    id: 'o1',
    clientUuid: '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c',
    reference: 'CMD-20260914-0001',
    items: [{ productId: 'p1', name: 'Riz 5kg', unitPrice: 4_500, quantity: 1, total: 4_500 }],
    subtotal: 4_500,
    discount: 0,
    totalAmount: 4_500,
    paidAmount: 4_500,
    remainingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    customerId: 'c1',
    customerName: 'Awa Diallo',
    createdAt: '2026-09-14T10:00:00.000Z',
    sellerName: 'Moussa',
    syncStatus: 'SYNCED',
    ...over,
  } as Sale;
}

describe('Ticket 3 — le reçu reflète toujours la bonne boutique', () => {
  it('le message injecte le nom de la boutique, pour deux boutiques différentes', () => {
    const message = 'Merci ! À bientôt chez {boutique}.';
    expect(resolveReceiptMessage({ receiptMessage: message, shopName: 'Allo' })).toBe('Merci ! À bientôt chez Allo.');
    expect(resolveReceiptMessage({ receiptMessage: message, shopName: "Étoile d'Afrique" })).toBe(
      "Merci ! À bientôt chez Étoile d'Afrique."
    );
  });

  it('le message par défaut ne contient aucun nom de boutique en dur', () => {
    expect(initialSettings.receiptMessage).toContain('{boutique}');
    expect(initialSettings.receiptMessage).not.toMatch(/toile d/i);
  });

  it('l ancien message par défaut, déjà enregistré sur l appareil, prend le nom de la boutique', () => {
    for (const ancien of [
      'Merci pour votre confiance ! À bientôt chez Étoile d’Afrique.',
      "Merci pour votre confiance ! À bientôt chez Étoile d'Afrique.",
      'Merci ! À bientôt chez Boutique Étoile d’Afrique.',
    ]) {
      const s = { receiptMessage: ancien, shopName: 'ALINOO' };
      expect(resolveReceiptMessage(s)).toMatch(/À bientôt chez ALINOO\.$/);
      expect(editableReceiptMessage(s)).not.toMatch(/toile/i);
      expect(generateReceiptWhatsAppText(vente(), boutique(s))).not.toMatch(/toile/i);
    }
    // Une boutique qui s'appelle vraiment ainsi garde son message.
    expect(
      resolveReceiptMessage({ receiptMessage: "À bientôt chez Étoile d'Afrique.", shopName: "Étoile d'Afrique" })
    ).toBe("À bientôt chez Étoile d'Afrique.");
  });

  it('un nom tapé en toutes lettres suit ensuite un changement de nom', () => {
    const stored = toStoredReceiptMessage('À bientôt chez Allo !', 'Allo');
    expect(stored).toBe('À bientôt chez {boutique} !');
    expect(resolveReceiptMessage({ receiptMessage: stored, shopName: 'Allo Market' })).toBe('À bientôt chez Allo Market !');
    expect(editableReceiptMessage({ receiptMessage: stored, shopName: 'Allo' })).toBe('À bientôt chez Allo !');
  });

  it('le téléphone est celui des Paramètres, jamais celui de la personne connectée', () => {
    expect(receiptPhone({ telephone: ' 0708091011 ' })).toBe('0708091011');
    expect(receiptPhone({ telephone: '' })).toBe('');
    const texte = generateReceiptWhatsAppText(
      vente(),
      boutique({ shopName: 'Allo', telephone: '', ownerPhone: '0101010101', showPhone: true })
    );
    expect(texte).not.toContain('0101010101');
  });

  it('100 % du texte du reçu désigne la boutique en cours', () => {
    const allo = generateReceiptWhatsAppText(
      vente(),
      boutique({ shopName: 'Allo', telephone: '0700000001', receiptMessage: 'À bientôt chez {boutique}' })
    );
    const etoile = generateReceiptWhatsAppText(
      vente(),
      boutique({ shopName: "Étoile d'Afrique", telephone: '0700000002', receiptMessage: 'À bientôt chez {boutique}' })
    );
    expect(allo).toContain('ALLO');
    expect(allo).toContain('À bientôt chez Allo');
    expect(allo).toContain('0700000001');
    expect(allo).not.toMatch(/toile|0700000002/i);
    expect(etoile).toContain("À bientôt chez Étoile d'Afrique");
    expect(etoile).not.toContain('0700000001');
  });
});

describe('Ticket 4 — QR code de vérification du reçu', () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('encode la boutique et le clientUuid, et figure dans le texte du reçu', () => {
    g.window = { location: { origin: 'https://morocashfront.vercel.app' } };
    const s = boutique({ businessId: 'cmbusiness0001', shopName: 'Allo' });
    const url = receiptVerifyUrl(vente(), s);
    expect(url).toBe(
      'https://morocashfront.vercel.app/api/v1/receipts/verify/cmbusiness0001/3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c'
    );
    expect(generateReceiptWhatsAppText(vente(), s)).toContain(url);
  });

  it('sans boutique connue, pas de lien inventé', () => {
    g.window = { location: { origin: 'https://x.test' } };
    expect(receiptVerifyUrl(vente(), boutique({ businessId: undefined }))).toBe('');
  });

  it('la page publique refuse un lien mal formé sans interroger la base', async () => {
    await expect(findVerifiedReceipt('pas-un-id', '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c')).resolves.toBeNull();
    await expect(findVerifiedReceipt('cmbusiness0001', 'CMD-20260914-0001')).resolves.toBeNull();
  });
});

describe('Ticket 5 — plage de dates', () => {
  it('« du 1 au 14 septembre » couvre exactement ces jours, bornes incluses', () => {
    const r = getCustomRange('2026-09-01', '2026-09-14')!;
    expect(isWithinRange(new Date(2026, 8, 1, 0, 0, 0), r)).toBe(true);
    expect(isWithinRange(new Date(2026, 8, 14, 23, 59, 59), r)).toBe(true);
    expect(isWithinRange(new Date(2026, 7, 31, 23, 59, 59), r)).toBe(false);
    expect(isWithinRange(new Date(2026, 8, 15, 0, 0, 0), r)).toBe(false);
  });

  it('des bornes inversées sont remises dans l ordre', () => {
    const r = getCustomRange('2026-09-14', '2026-09-01')!;
    expect(r.start.getDate()).toBe(1);
    expect(r.end.getDate()).toBe(14);
  });

  it('la période précédente a la même durée, juste avant', () => {
    const prev = getPreviousCustomRange(getCustomRange('2026-09-01', '2026-09-14')!);
    expect([prev.start.getMonth(), prev.start.getDate()]).toEqual([7, 18]);
    expect([prev.end.getMonth(), prev.end.getDate()]).toEqual([7, 31]);
  });

  it('une date invalide ne donne pas de plage', () => {
    expect(getCustomRange('', '2026-09-14')).toBeNull();
  });
});

describe('Ticket 6 — export du catalogue', () => {
  it('trie par catégorie puis par nom, prix lisibles, prestations sans stock', () => {
    const rows = toCatalogRows([
      { id: '1', name: 'Zébu', category: 'B', salePrice: 12_500, stock: 3, unit: 'kg' } as Product,
      { id: '2', name: 'Ananas', category: 'B', salePrice: 500, stock: 10, unit: 'pièce' } as Product,
      { id: '3', name: 'Coupe', category: 'A', salePrice: 2_000, stock: 999, unit: 'prestation', isService: true } as Product,
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Coupe', 'Ananas', 'Zébu']);
    expect(rows[0].stock).toBe('Prestation');
    expect(rows[2].price).toBe('12 500 F');
    expect(formatCatalogPrice(1_234_567)).toBe('1 234 567 F');
  });
});

describe('Ticket 1 — origine de « Commande : Données invalides »', () => {
  const base = {
    clientUuid: '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c',
    customerId: 'cmcustomer0001',
    items: [{ productId: 'cmproduct00001', qte: 1 }],
    montantRecu: 0,
  };

  it('une commande aux identifiants serveur passe la validation', () => {
    expect(createOrderSchema.safeParse(base).success).toBe(true);
  });

  it('un service « de passage » (id local service-…) était refusé par le serveur', () => {
    const parsed = createOrderSchema.safeParse({ ...base, items: [{ productId: `service-${Date.now()}`, qte: 1 }] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0].path).toEqual(['items', 0, 'productId']);
  });

  it('un produit dont la création n a jamais abouti (id local UUID) aussi', () => {
    const parsed = createOrderSchema.safeParse({
      ...base,
      items: [{ productId: '9b2e7c1a-1111-4222-8333-444455556666', qte: 1 }],
    });
    expect(parsed.success).toBe(false);
  });
});
