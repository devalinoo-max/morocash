import { api } from './client';

export interface ApiCategory {
  id: string;
  nom: string;
  type: 'PRODUIT' | 'DEPENSE';
  /** Catégorie de MoroCash (Achat marchandise) : cadenassée, non supprimable. */
  systeme: boolean;
  /** Nombre de produits ou de dépenses qui s'appuient dessus. */
  usageCount: number;
}

/**
 * Libellé d'un produit sans catégorie. Ce n'est pas une vraie catégorie en
 * base : c'est l'absence de catégorie, affichée avec un nom lisible plutôt
 * qu'un vide. Un produit "Sans catégorie" se vend normalement.
 */
export const NO_CATEGORY_LABEL = 'Sans catégorie';

export function listCategories(type?: 'PRODUIT' | 'DEPENSE') {
  const query = type ? `?type=${type}` : '';
  return api.get<{ categories: ApiCategory[] }>(`/categories${query}`).then((d) => d.categories);
}

export function createCategory(nom: string, type: 'PRODUIT' | 'DEPENSE') {
  return api.post<{ category: ApiCategory }>('/categories', { nom, type }).then((d) => d.category);
}

export function renameCategory(id: string, nom: string) {
  return api.patch<{ category: ApiCategory }>(`/categories/${id}`, { nom }).then((d) => d.category);
}

/** Refusé (CATEGORY_IN_USE) si la catégorie sert encore à des produits. */
export function deleteCategory(id: string) {
  return api.delete<{ deleted: true }>(`/categories/${id}`);
}

/** `toCategoryId: null` renvoie les produits vers « Sans catégorie ». */
export function moveCategoryProducts(id: string, toCategoryId: string | null) {
  return api
    .post<{ moved: number }>(`/categories/${id}/move-products`, { toCategoryId })
    .then((d) => d.moved);
}

export function listProductCategories() {
  return listCategories('PRODUIT');
}
