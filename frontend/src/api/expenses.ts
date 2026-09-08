import { api, generateClientUuid } from './client';
import { toApiPaymentMethode, toFrontendPaymentMethod } from './mappers';
import type { Expense, PaymentMethod } from '../types';

export interface ApiCategory {
  id: string;
  nom: string;
  type: 'PRODUIT' | 'DEPENSE';
  systeme: boolean;
}

export interface ApiExpense {
  id: string;
  montant: number;
  categoryId: string;
  note: string | null;
  methode: string;
  recurrente: boolean;
  origine: 'MANUELLE' | 'AUTO_STOCK';
  receptionId: string | null;
  date: string;
  createdAt: string;
}

export function listCategories(type?: 'PRODUIT' | 'DEPENSE') {
  const query = type ? `?type=${type}` : '';
  return api.get<{ categories: ApiCategory[] }>(`/categories${query}`).then((d) => d.categories);
}

export function createCategory(nom: string, type: 'PRODUIT' | 'DEPENSE') {
  return api.post<{ category: ApiCategory }>('/categories', { nom, type }).then((d) => d.category);
}

/**
 * Le backend exige un categoryId réel (spec) alors que ce prototype ne propose
 * qu'un nom de catégorie en clair dans un <select> figé — on résout le nom vers
 * une vraie catégorie DEPENSE existante, ou on la crée à la volée si absente
 * (ex: à l'inscription, seule "Achat marchandise" existe).
 */
export async function resolveExpenseCategoryId(nom: string): Promise<string> {
  const categories = await listCategories('DEPENSE');
  const existing = categories.find((c) => c.nom.toLowerCase() === nom.toLowerCase());
  if (existing) return existing.id;
  const created = await createCategory(nom, 'DEPENSE');
  return created.id;
}

export function listExpenses() {
  return api.get<{ expenses: ApiExpense[] }>('/expenses').then((d) => d.expenses);
}

export function createExpense(input: {
  montant: number;
  categoryId: string;
  note?: string;
  methode: string;
  date?: string;
}) {
  return api
    .post<{ status: 'CREATED' | 'DUPLICATE'; expense: ApiExpense }>('/expenses', {
      clientUuid: generateClientUuid(),
      ...input,
    })
    .then((d) => d.expense);
}

export function toFrontendExpense(e: ApiExpense, categoryName: string): Expense {
  return {
    id: e.id,
    amount: e.montant,
    category: categoryName,
    note: e.note ?? undefined,
    date: e.date,
    isAuto: e.origine === 'AUTO_STOCK',
    paymentMethod: toFrontendPaymentMethod(e.methode),
    syncStatus: 'SYNCED',
  };
}

export function toApiExpenseMethode(method: PaymentMethod): string {
  return toApiPaymentMethode(method);
}
