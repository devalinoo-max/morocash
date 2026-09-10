import type { Product, ProductCode, ProductImage, UserRole } from '@prisma/client';

export type ProductWithImages = Product & { images?: ProductImage[]; codes?: ProductCode[] };

/**
 * URL exploitable par un <img> côté frontend.
 *
 * Tant que CLOUDINARY_* n'est pas configuré, `uploadProductImage()` renvoie
 * null et l'image est stockée telle quelle (data URL base64) dans `url` : on
 * ne renvoie JAMAIS ce blob dans la liste des produits (une boutique de 50
 * produits ferait une réponse de plusieurs Mo, rechargée à chaque écran) — on
 * renvoie l'URL du binaire, servi et mis en cache par le navigateur.
 */
export function productImageUrl(image: ProductImage): string {
  if (image.url.startsWith('data:')) {
    return `/api/v1/products/${image.productId}/images/${image.id}/raw`;
  }
  return image.url;
}

export function serializeProductImage(image: ProductImage) {
  return {
    id: image.id,
    url: productImageUrl(image),
    ordre: image.ordre,
    isPrincipale: image.isPrincipale,
  };
}

/**
 * Filtrage par rôle AVANT la réponse, jamais à l'affichage (spec §10).
 * Un SELLER ne reçoit jamais prixAchat, cmp, ni la marge calculée.
 */
export function serializeProductCode(c: ProductCode) {
  return {
    id: c.id,
    code: c.code,
    format: c.format,
    origine: c.origine,
    estPrincipal: c.estPrincipal,
    createdAt: c.createdAt,
  };
}

export function serializeProduct(p: ProductWithImages, role: UserRole) {
  const base = {
    id: p.id,
    nom: p.nom,
    type: p.type,
    prixVente: p.prixVente,
    stock: p.stock,
    seuilAlerte: p.seuilAlerte,
    unite: p.unite,
    categoryId: p.categoryId,
    actif: p.actif,
    createdAt: p.createdAt,
    images: (p.images ?? []).map(serializeProductImage),
    // Le code sert a scanner l'article en caisse et a imprimer son etiquette :
    // tous les roles en ont besoin, y compris un SELLER.
    codes: (p.codes ?? []).map(serializeProductCode),
  };

  if (role === 'SELLER') return base;

  return {
    ...base,
    prixAchat: p.prixAchat,
    cmp: p.cmp,
    marge: p.prixVente - p.cmp,
  };
}

export function serializeProductList(products: ProductWithImages[], role: UserRole) {
  return products.map((p) => serializeProduct(p, role));
}
