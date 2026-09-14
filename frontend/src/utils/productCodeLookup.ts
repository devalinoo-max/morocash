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

/**
 * Forme de comparaison tolerante d'un code, pour ce que la lecture deforme
 * sans changer l'article :
 *  - la ponctuation : les etiquettes code-barres imprimees jusqu'ici retiraient
 *    le tiret du code interne (« INT-612332909 » se relisait « INT612332909 ») ;
 *  - les zeros de tete d'un code numerique : un meme article UPC-A se lit en
 *    12 chiffres sur un lecteur et en EAN-13 precede d'un 0 sur un autre
 *    (Android, iPhone), et un GTIN-14 ajoute encore un 0 devant.
 */
export function looseCode(rawCode: string): string {
  const compact = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^\d{12,14}$/.test(compact)) return compact.replace(/^0+/, '');
  return compact;
}

export function productMatchesCode(product: Product, rawCode: string): boolean {
  const cherche = rawCode.trim().toLowerCase();
  if (!cherche) return false;
  return productCodeCandidates(product).some((code) => code.toLowerCase() === cherche);
}

function productLooselyMatchesCode(product: Product, rawCode: string): boolean {
  const cherche = looseCode(rawCode);
  // Trop court une fois compacte : risque de confondre deux articles.
  if (cherche.length < 4) return false;
  return productCodeCandidates(product).some((code) => looseCode(code) === cherche);
}

export function findProductByCode(products: Product[], rawCode: string): Product | undefined {
  if (!rawCode || !rawCode.trim()) return undefined;
  // Le code exact d'abord : la forme tolerante ne sert qu'a rattraper une lecture.
  return (
    products.find((product) => productMatchesCode(product, rawCode)) ??
    products.find((product) => productLooselyMatchesCode(product, rawCode))
  );
}

/**
 * Anti-rebond de la camera. Elle lit le meme code des dizaines de fois par
 * seconde tant que l'etiquette reste devant l'objectif.
 *
 * Avant, le meme code etait accepte a nouveau 1,2 s apres sa premiere lecture,
 * meme s'il n'avait jamais quitte l'image : un article tenu 5 secondes devant
 * la camera partait 4 fois au panier, et comptait 4 fois a l'inventaire.
 * Desormais, chaque lecture du meme code prolonge l'attente : il faut que
 * l'etiquette sorte du cadre un instant pour compter l'article suivant.
 */
export function createScanGate(cooldownMs = 1200) {
  let lastCode = '';
  let lastSeenAt = Number.NEGATIVE_INFINITY;
  return {
    accept(rawCode: string, now: number): boolean {
      const code = rawCode.trim();
      if (!code) return false;
      const sameCode = code === lastCode;
      const stillInView = sameCode && now - lastSeenAt < cooldownMs;
      lastCode = code;
      lastSeenAt = now;
      return !stillInView;
    },
  };
}
