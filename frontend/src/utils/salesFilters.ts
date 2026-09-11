import type { Sale } from '../types';

/**
 * Filtres de l'historique des ventes.
 *
 * Sortis de l'ecran pour etre verifiables : ce sont eux qui decident quelles
 * commandes le commercant voit, et quel chiffre d'affaires s'affiche en haut.
 * Une erreur ici ne plante rien, elle ment — c'est pire.
 */

export type PeriodFilter = 'today' | '7days' | '30days' | 'thisMonth' | 'custom';
export type StatusFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'CREDIT' | 'CANCELLED';

export interface DateInterval {
  start: Date;
  end: Date;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Date saisie au format AAAA-MM-JJ, ou null si le champ est vide ou invalide. */
function parseInputDate(value: string): Date | null {
  const parts = value.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Intervalle couvert par la periode choisie. "7 derniers jours" inclut
 * aujourd'hui, donc J-6 a J (7 jours pleins), pas J-7.
 *
 * Une date personnalisee vide ou illisible ne produit JAMAIS un intervalle
 * invalide : toute comparaison avec une Invalid Date est fausse, et l'ecran se
 * vidait sans rien expliquer des que le commercant effacait le champ. On se
 * rabat alors sur le jour meme.
 */
export function computePeriodInterval(
  period: PeriodFilter,
  customStart: string,
  customEnd: string,
  now: Date = new Date()
): DateInterval {
  if (period === 'today') {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  if (period === '7days') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    return { start: startOfDay(start), end: endOfDay(now) };
  }
  if (period === '30days') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
    return { start: startOfDay(start), end: endOfDay(now) };
  }
  if (period === 'thisMonth') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  const debut = parseInputDate(customStart) ?? now;
  const fin = parseInputDate(customEnd) ?? now;
  // Bornes inversees : on les remet dans l'ordre plutot que de ne rien afficher.
  const [a, b] = debut <= fin ? [debut, fin] : [fin, debut];
  return { start: startOfDay(a), end: endOfDay(b) };
}

function matchesStatus(sale: Sale, status: StatusFilter): boolean {
  if (status === 'ALL') return true;
  if (status === 'CANCELLED') return Boolean(sale.isCancelled);
  // Une commande annulee n'est plus ni payee ni a credit : elle ne doit
  // apparaitre que dans "Annulees".
  if (sale.isCancelled) return false;
  return sale.paymentStatus === status;
}

/** Recherche libre : numero, client, vendeur, telephone, ou nom d'article. */
function matchesQuery(sale: Sale, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const champs = [
    sale.reference,
    sale.customerName,
    sale.customerPhone,
    sale.sellerName,
    ...(sale.items ?? []).map((it) => it.name),
  ];
  return champs.some((champ) => Boolean(champ) && String(champ).toLowerCase().includes(q));
}

export interface SalesFilterCriteria {
  interval: DateInterval;
  status: StatusFilter;
  seller: string;
  query: string;
}

export function filterSales(sales: Sale[], criteria: SalesFilterCriteria): Sale[] {
  return sales.filter((sale) => {
    const date = new Date(sale.createdAt);
    if (date < criteria.interval.start || date > criteria.interval.end) return false;
    if (!matchesStatus(sale, criteria.status)) return false;
    if (criteria.seller !== 'ALL' && sale.sellerName !== criteria.seller) return false;
    return matchesQuery(sale, criteria.query);
  });
}

/** Compteur affiche sur chaque onglet de statut, sur la periode choisie. */
export function countByStatus(sales: Sale[], interval: DateInterval): Record<StatusFilter, number> {
  const dansLaPeriode = sales.filter((s) => {
    const d = new Date(s.createdAt);
    return d >= interval.start && d <= interval.end;
  });
  return {
    ALL: dansLaPeriode.length,
    PAID: dansLaPeriode.filter((s) => matchesStatus(s, 'PAID')).length,
    PARTIAL: dansLaPeriode.filter((s) => matchesStatus(s, 'PARTIAL')).length,
    CREDIT: dansLaPeriode.filter((s) => matchesStatus(s, 'CREDIT')).length,
    CANCELLED: dansLaPeriode.filter((s) => matchesStatus(s, 'CANCELLED')).length,
  };
}

/**
 * Chiffre d'affaires affiche en haut de l'historique : les commandes annulees
 * n'y entrent jamais, sinon le total contredit la caisse.
 */
export function sumSales(sales: Sale[]): number {
  return sales.filter((s) => !s.isCancelled).reduce((total, s) => total + s.totalAmount, 0);
}
