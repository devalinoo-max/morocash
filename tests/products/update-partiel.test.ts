import { describe, it, expect } from 'vitest';
import { registerBusiness } from '@/server/modules/auth/register';
import {
  createProduct,
  updateProduct,
  updateProductSchema,
} from '@/server/modules/products/service';

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

/**
 * Un PATCH ne touche QUE ce qu'il transporte.
 *
 * Le schéma de mise à jour était `createProductSchema.partial()`, qui gardait
 * les valeurs par défaut de la création : un PATCH ne portant que le nom
 * repartait avec stock = 0, seuilAlerte = 0, prixAchat = 0 et unite = 'pièce'.
 * L'écran de modification en lot (BulkEditBar) n'envoie que le champ modifié —
 * changer la catégorie d'une sélection effaçait donc le stock de chaque
 * produit, sans le moindre message.
 */
describe('Mise à jour partielle d’un produit', () => {
  it('n’écrase aucun champ absent du corps de la requête', async () => {
    const { business } = await registerBusiness(
      { businessNom: 'Verif Update Partiel', telephone: uniquePhone('4'), pin: '123456' },
      {}
    );

    const product = await createProduct(business.id, {
      nom: 'Sac de riz 25 kg',
      type: 'PRODUIT',
      prixVente: 18000,
      prixAchat: 15000,
      stock: 42,
      seuilAlerte: 8,
      unite: 'sac',
    });

    // Exactement ce que fait un renommage depuis la fiche produit.
    const renomme = await updateProduct(business.id, product.id, { nom: 'Sac de riz parfumé' });

    expect(renomme).toMatchObject({
      nom: 'Sac de riz parfumé',
      stock: 42,
      seuilAlerte: 8,
      prixAchat: 15000,
      unite: 'sac',
      prixVente: 18000,
    });

    // Et ce que fait la modification de prix en lot.
    const reprice = await updateProduct(business.id, product.id, { prixVente: 19500 });

    expect(reprice).toMatchObject({
      nom: 'Sac de riz parfumé',
      prixVente: 19500,
      stock: 42,
      seuilAlerte: 8,
      prixAchat: 15000,
      unite: 'sac',
    });
  });

  it('ne fabrique aucune clé à partir d’un corps vide', async () => {
    // La garantie tenue au niveau du schéma : ce qui n'est pas envoyé
    // n'atteint jamais la couche de persistance.
    expect(updateProductSchema.parse({})).toEqual({});
    expect(updateProductSchema.parse({ nom: 'Café' })).toEqual({ nom: 'Café' });
  });

  it('valide toujours ce qu’il reçoit', async () => {
    expect(() => updateProductSchema.parse({ prixVente: -1 })).toThrow();
    expect(() => updateProductSchema.parse({ nom: '' })).toThrow();
    expect(() => updateProductSchema.parse({ unite: '' })).toThrow();
    expect(() => updateProductSchema.parse({ type: 'AUTRE' })).toThrow();
  });
});
