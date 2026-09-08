import { describe, it, expect } from 'vitest';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { listCodes } from '@/server/modules/products/codes';
import { generateSingleLabelPdf } from '@/server/modules/products/labelPdf';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Critère de sortie de l'étape 3 (spec §13) : "Un produit créé a son QR."
 */
describe('Étape 3 — création de produit', () => {
  it('génère un code QR principal et une étiquette PDF valide', async () => {
    const { business } = await registerBusiness(
      { businessNom: 'Verif Stage3', telephone: uniquePhone('9'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Bidon huile 5L',
      type: 'PRODUIT',
      prixVente: 6000,
      prixAchat: 4500,
      stock: 20,
      seuilAlerte: 3,
      unite: 'bidon',
    });

    const codes = await listCodes(business.id, product.id);
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatchObject({ format: 'QR', origine: 'GENERE', estPrincipal: true });

    const pdf = await generateSingleLabelPdf({
      nom: product.nom,
      prixVente: product.prixVente,
      code: codes[0].code,
      format: codes[0].format,
    });

    expect(pdf.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
