// Vocabulaire de période partagé entre le Tableau de bord et la Caisse
// (harmonisation : les deux écrans disaient "Aujourd'hui/Hier/Cette semaine/Ce mois"
// avec deux implémentations séparées et légèrement différentes).

export type SimplePeriod = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH';

export interface DateRange {
  start: Date;
  end: Date;
  label: string;
}

export const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 (dim) - 6 (sam)
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(d);
  monday.setDate(monday.getDate() - diffToMonday);
  return startOfDay(monday);
}

export function getPeriodRange(period: SimplePeriod, reference: Date = new Date()): DateRange {
  if (period === 'YESTERDAY') {
    const y = new Date(reference);
    y.setDate(y.getDate() - 1);
    return { start: startOfDay(y), end: endOfDay(y), label: 'Hier' };
  }
  if (period === 'WEEK') {
    return { start: startOfWeek(reference), end: endOfDay(reference), label: 'Cette semaine' };
  }
  if (period === 'MONTH') {
    const firstOfMonth = new Date(reference.getFullYear(), reference.getMonth(), 1);
    return { start: startOfDay(firstOfMonth), end: endOfDay(reference), label: 'Ce mois' };
  }
  return { start: startOfDay(reference), end: endOfDay(reference), label: "Aujourd'hui" };
}

/**
 * Période équivalente immédiatement précédente, pour les comparaisons "vs hier /
 * vs la semaine dernière / vs le mois dernier" (spec déjà annoncée dans Réglages
 * > Mon affichage : "Affiche l'écart... par rapport à la veille ou la semaine
 * dernière", jamais vraiment calculée avant aujourd'hui).
 */
export function getPreviousPeriodRange(period: SimplePeriod, reference: Date = new Date()): DateRange {
  if (period === 'YESTERDAY') {
    const d = new Date(reference);
    d.setDate(d.getDate() - 2);
    return { start: startOfDay(d), end: endOfDay(d), label: 'Avant-hier' };
  }
  if (period === 'WEEK') {
    const current = getPeriodRange('WEEK', reference);
    const prevStart = new Date(current.start);
    prevStart.setDate(prevStart.getDate() - 7);
    const prevEnd = new Date(current.end);
    prevEnd.setDate(prevEnd.getDate() - 7);
    return { start: prevStart, end: prevEnd, label: 'la semaine dernière' };
  }
  if (period === 'MONTH') {
    const prevMonthStart = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
    const daysInPrevMonth = new Date(reference.getFullYear(), reference.getMonth(), 0).getDate();
    const sameDayPrevMonth = Math.min(reference.getDate(), daysInPrevMonth);
    return {
      start: startOfDay(prevMonthStart),
      end: endOfDay(new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), sameDayPrevMonth)),
      label: 'le mois dernier',
    };
  }
  const d = new Date(reference);
  d.setDate(d.getDate() - 1);
  return { start: startOfDay(d), end: endOfDay(d), label: 'hier' };
}

export function isWithinRange(dateInput: string | Date, range: DateRange): boolean {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return d >= range.start && d <= range.end;
}

/** Variation en % entre deux totaux, ou null quand la base précédente est nulle (rien à comparer). */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
