import type { Product } from '../types';

/**
 * Reconnaissance d'un produit a partir d'un code scanne (QR ou code-barres).
 *
 * Volontairement sans aucune dependance : c'est le maillon entre l'etiquette
 * collee sur l'article et le panier en caisse, et il doit rester verifiable
 * hors du navigateur. Un scan qui ne reconnait rien arrete la vente — c'est
 * exactement le bug qui a fait repondre "produit introuvable" a chaque scan.
 */

/**
 * Les codes d'un produit, dans l'ordre de fiabilite :
 *  - internalCode  : le QR genere par le serveur a la creation (INT-XXXXXXXXX) ;
 *  - barcode       : le code-barres du fabricant, scanne sur l'emballage ;
 *  - productCodes  : tous les codes enregistres pour ce produit ;
 *  - id            : filet de securite pour les etiquettes deja collees en
 *                    boutique, imprimees a l'epoque ou le catalogue ne recevait
 *                    pas les codes du serveur et ou le generateur d'etiquettes
 *                    se rabattait sur l'identifiant du produit.
 */
export function productCodeCandidates(product: Product): string[] {
  return [
    product.internalCode,
    product.barcode,
    ...(product.productCodes ?? []).map((c) => c.code),
    product.id,
  ].filter((code): code is string => Boolean(code));
}

export function productMatchesCode(product: Product, rawCode: string): boolean {
  const cherche = rawCode.trim().toLowerCase();
  if (!cherche) return false;
  return productCodeCandidates(product).some((code) => code.toLowerCase() === cherche);
}

export function findProductByCode(products: Product[], rawCode: string): Product | undefined {
  if (!rawCode || !rawCode.trim()) return undefined;
  return products.find((product) => productMatchesCode(product, rawCode));
}
