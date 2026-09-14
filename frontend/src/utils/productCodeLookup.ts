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
  // Un UPC-E (8 chiffres imprimés) et sa forme longue UPC-A désignent le même
  // article : un lecteur rend l'une, un autre l'autre.
  const expanded = /^[01]\d{7}$/.test(compact) ? upceToUpca(compact) : null;
  const gtin = expanded ?? compact;
  if (/^\d{12,14}$/.test(gtin)) return gtin.replace(/^0+/, '');
  return compact;
}

function upcCheckDigitValid(upca: string): boolean {
  const d = upca.split('').map(Number);
  const sum = d.slice(0, 11).reduce((acc, n, i) => acc + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === d[11];
}

/** UPC-E (8 chiffres : système, 6 chiffres, clé) → UPC-A (12 chiffres), ou null. */
export function upceToUpca(upce: string): string | null {
  if (!/^[01]\d{7}$/.test(upce)) return null;
  const [n, x1, x2, x3, x4, x5, x6, c] = upce.split('');
  let body: string;
  if (x6 <= '2') body = `${x1}${x2}${x6}0000${x3}${x4}${x5}`;
  else if (x6 === '3') body = `${x1}${x2}${x3}00000${x4}${x5}`;
  else if (x6 === '4') body = `${x1}${x2}${x3}${x4}00000${x5}`;
  else body = `${x1}${x2}${x3}${x4}${x5}0000${x6}`;
  const upca = `${n}${body}${c}`;
  return upcCheckDigitValid(upca) ? upca : null;
}

/** UPC-A (12 chiffres) → UPC-E (8 chiffres) quand l'article en a un, sinon null. */
export function upcaToUpce(upca: string): string | null {
  if (!/^[01]\d{11}$/.test(upca) || !upcCheckDigitValid(upca)) return null;
  const n = upca[0];
  const m = upca.slice(1, 6);
  const p = upca.slice(6, 11);
  const c = upca[11];
  let six: string | null = null;
  if (m.slice(3) === '00' && m[2] <= '2' && p.startsWith('00')) six = `${m[0]}${m[1]}${p.slice(2)}${m[2]}`;
  else if (m.slice(3) === '00' && p.startsWith('000')) six = `${m.slice(0, 3)}${p.slice(3)}3`;
  else if (m[4] === '0' && p.startsWith('0000')) six = `${m.slice(0, 4)}${p[4]}4`;
  else if (p.startsWith('0000') && p[4] >= '5') six = `${m}${p[4]}`;
  if (!six) return null;
  const upce = `${n}${six}${c}`;
  // Vérification : la forme courte doit redonner exactement la longue.
  return upceToUpca(upce) === upca ? upce : null;
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
