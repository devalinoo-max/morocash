import React from 'react';
import { Calendar } from 'lucide-react';

interface DateRangeInputsProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  id?: string;
  className?: string;
}

/** Libellé commun du raccourci, le même sur tous les écrans filtrés par période. */
export const DATE_RANGE_LABEL = 'Choisir les dates';

/**
 * Sélecteur « Du … au … » partagé par tous les filtres de période (Tableau de
 * bord, Commandes, Ma caisse, Mes reçus, Mes chiffres, Mouvements) : même
 * libellé et même comportement partout. Des bornes inversées sont remises
 * dans l'ordre par le calcul de la plage, jamais refusées ici.
 */
export const DateRangeInputs: React.FC<DateRangeInputsProps> = ({
  start,
  end,
  onStartChange,
  onEndChange,
  id = 'date-range',
  className = '',
}) => (
  <div
    className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80 min-w-0 ${className}`}
  >
    <Calendar className="w-3.5 h-3.5 text-[#4F46E5] shrink-0" />
    <label className="flex items-center gap-1 min-w-0">
      <span className="text-slate-500 font-medium">Du</span>
      <input
        id={`${id}-start`}
        type="date"
        value={start}
        max={end || undefined}
        onChange={(e) => onStartChange(e.target.value)}
        className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer min-w-0"
      />
    </label>
    <label className="flex items-center gap-1 min-w-0">
      <span className="text-slate-500 font-medium">au</span>
      <input
        id={`${id}-end`}
        type="date"
        value={end}
        min={start || undefined}
        onChange={(e) => onEndChange(e.target.value)}
        className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer min-w-0"
      />
    </label>
  </div>
);
