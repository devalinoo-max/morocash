import { api, ApiError } from './client';
import { listCategories, createCategory } from './expenses';
import type { Product } from '../types';

export interface ApiProduct {
  id: string;
  nom: string;
  type: 'PRODUIT' | 'SERVICE';
  prixVente: number;
  stock: number;
  seuilAlerte: number;
  unite: string;
  categoryId: string | null;
  actif: boolean;
  createdAt: string;
  // Absents du JSON pour un SELLER (spec §0 règle 7) — filtré côté serveur.
  prixAchat?: number;
  cmp?: number;
  marge?: number;
}

export interface CreateProductInput {
  nom: string;
  type?: 'PRODUIT' | 'SERVICE';
  prixVente: number;
  prixAchat?: number;
  stock?: number;
  seuilAlerte?: number;
  unite?: string;
  categoryId?: string;
}

export function listProducts() {
  return api.get<{ products: ApiProduct[] }>('/products').then((d) => d.products);
}

export function createProduct(input: CreateProductInput) {
  return api.post<{ product: ApiProduct }>('/products', input).then((d) => d.product);
}

export function updateProduct(id: string, input: Partial<CreateProductInput> & { actif?: boolean }) {
  return api.patch<{ product: ApiProduct }>(`/products/${id}`, input).then((d) => d.product);
}

/**
 * Suppression réelle si le produit n'a aucun historique, sinon repli automatique
 * sur une désactivation (actif=false) — un produit qui a déjà servi n'est jamais
 * supprimé côté backend (spec §0 règle 4, PRODUCT_HAS_HISTORY).
 */
export async function deleteOrDeactivateProduct(id: string): Promise<'DELETED' | 'DEACTIVATED'> {
  try {
    await api.delete<{ deleted: true }>(`/products/${id}`);
    return 'DELETED';
  } catch (error) {
    if (error instanceof ApiError && error.code === 'PRODUCT_HAS_HISTORY') {
      await updateProduct(id, { actif: false });
      return 'DEACTIVATED';
    }
    throw error;
  }
}

/**
 * Champs absents pour l'instant de ce passage (étape 13, "parcours complet
 * d'abord") : codes-barres/QR (productCodes), photos — la gestion complète
 * des codes reste sur les données locales du prototype.
 *
 * `categoryName` est résolu par l'appelant (le payload produit ne contient
 * que categoryId, jamais le nom lisible) à partir de la liste des catégories
 * PRODUIT — voir resolveProductCategoryId / listProductCategories ci-dessous.
 */
export function toFrontendProduct(p: ApiProduct, categoryName?: string): Product {
  return {
    id: p.id,
    name: p.nom,
    salePrice: p.prixVente,
    purchasePrice: p.prixAchat ?? 0,
    stock: p.stock,
    alertThreshold: p.seuilAlerte,
    category: categoryName ?? 'Général',
    unit: p.unite,
    isService: p.type === 'SERVICE',
    salesCount: 0,
    createdAt: p.createdAt,
    syncStatus: 'SYNCED',
  };
}

export function toCreateProductInput(product: {
  name: string;
  salePrice: number;
  purchasePrice: number;
  stock: number;
  alertThreshold: number;
  unit: string;
  isService?: boolean;
  categoryId?: string;
}): CreateProductInput {
  return {
    nom: product.name,
    type: product.isService ? 'SERVICE' : 'PRODUIT',
    prixVente: product.salePrice,
    prixAchat: product.purchasePrice,
    stock: product.stock,
    seuilAlerte: product.alertThreshold,
    unite: product.unit,
    ...(product.categoryId ? { categoryId: product.categoryId } : {}),
  };
}

export function listProductCategories() {
  return listCategories('PRODUIT');
}

/**
 * Le formulaire produit ne propose qu'un nom de catégorie en clair (combobox
 * texte + choix parmi l'existant) — on résout ce nom vers une vraie catégorie
 * PRODUIT existante, ou on la crée à la volée si absente (même logique que
 * resolveExpenseCategoryId pour les dépenses).
 */
export async function resolveProductCategoryId(nom: string): Promise<string> {
  const categories = await listCategories('PRODUIT');
  const existing = categories.find((c) => c.nom.toLowerCase() === nom.toLowerCase());
  if (existing) return existing.id;
  const created = await createCategory(nom, 'PRODUIT');
  return created.id;
}
