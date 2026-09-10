import { api, ApiError } from './client';
import { NO_CATEGORY_LABEL, createCategory, listCategories } from './categories';
import type { Product } from '../types';

export interface ApiProductImage {
  id: string;
  url: string;
  ordre: number;
  isPrincipale: boolean;
}

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
  images?: ApiProductImage[];
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
 * Photos produit : elles vivent dans une ressource à part (ProductImage), donc
 * un POST /products ne les enregistre pas — il faut un appel par photo APRÈS
 * la création du produit. C'est ce chaînage qui manquait : la photo choisie
 * dans le formulaire n'était jamais envoyée, et disparaissait au rechargement.
 */
export function addProductImage(productId: string, dataUrl: string, isPrincipale = false) {
  return api
    .post<{ image: ApiProductImage }>(`/products/${productId}/images`, { dataUrl, isPrincipale })
    .then((d) => d.image);
}

export function removeProductImage(productId: string, imageId: string) {
  return api.delete<{ deleted: true }>(
    `/products/${productId}/images?imageId=${encodeURIComponent(imageId)}`
  );
}

export function reorderProductImages(productId: string, orderedIds: string[]) {
  return api.patch<{ reordered: true }>(`/products/${productId}/images/order`, { orderedIds });
}

export interface ProductPhotoRef {
  id: string;
  url: string;
}

/**
 * Aligne les photos côté serveur sur la liste affichée par le formulaire :
 * une entrée `data:` est une photo neuve à envoyer, une photo déjà connue mais
 * absente de la nouvelle liste a été supprimée, et l'ordre de la liste fait foi
 * (la première photo est la principale).
 *
 * Les envois sont séquentiels : le champ `ordre` est calculé côté serveur à
 * partir du nombre de photos existantes, deux POST en parallèle donneraient donc
 * le même rang.
 */
export async function syncProductPhotos(
  productId: string,
  nextPhotos: string[],
  currentRefs: ProductPhotoRef[] = []
): Promise<ProductPhotoRef[]> {
  const kept = new Set(nextPhotos);
  for (const ref of currentRefs) {
    if (!kept.has(ref.url)) {
      await removeProductImage(productId, ref.id);
    }
  }

  const refs: ProductPhotoRef[] = [];
  for (const [index, photo] of nextPhotos.entries()) {
    const existing = currentRefs.find((r) => r.url === photo);
    if (existing) {
      refs.push(existing);
      continue;
    }
    const image = await addProductImage(productId, photo, index === 0);
    refs.push({ id: image.id, url: image.url });
  }

  if (refs.length > 1) {
    await reorderProductImages(productId, refs.map((r) => r.id));
  }

  return refs;
}

/**
 * Champs absents pour l'instant de ce passage (étape 13, "parcours complet
 * d'abord") : codes-barres/QR (productCodes) — la gestion complète des codes
 * reste sur les données locales du prototype.
 *
 * `categoryName` est résolu par l'appelant (le payload produit ne contient
 * que categoryId, jamais le nom lisible) à partir de la liste des catégories
 * PRODUIT — voir resolveProductCategoryId / listProductCategories ci-dessous.
 */
export function toFrontendProduct(p: ApiProduct, categoryName?: string): Product {
  const images = p.images ?? [];
  const photos = images.map((i) => i.url);
  return {
    photo: photos[0],
    photos,
    photoRefs: images.map((i) => ({ id: i.id, url: i.url })),
    id: p.id,
    name: p.nom,
    salePrice: p.prixVente,
    purchasePrice: p.prixAchat ?? 0,
    stock: p.stock,
    alertThreshold: p.seuilAlerte,
    // Pas de categorie = « Sans categorie », un etat normal : le produit se
    // vend comme les autres (point 4a).
    category: categoryName ?? NO_CATEGORY_LABEL,
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
