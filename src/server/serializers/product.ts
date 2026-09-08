import type { Product, UserRole } from '@prisma/client';

/**
 * Filtrage par rôle AVANT la réponse, jamais à l'affichage (spec §10).
 * Un SELLER ne reçoit jamais prixAchat, cmp, ni la marge calculée.
 */
export function serializeProduct(p: Product, role: UserRole) {
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
  };

  if (role === 'SELLER') return base;

  return {
    ...base,
    prixAchat: p.prixAchat,
    cmp: p.cmp,
    marge: p.prixVente - p.cmp,
  };
}

export function serializeProductList(products: Product[], role: UserRole) {
  return products.map((p) => serializeProduct(p, role));
}
