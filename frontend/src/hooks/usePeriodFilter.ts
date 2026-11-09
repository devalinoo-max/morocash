import { useEffect, useMemo, useState } from 'react';
import {
  loadPeriodSelection,
  previousPeriod,
  resolvePeriod,
  savePeriodSelection,
  type PeriodSelection,
  type ResolvedPeriod,
} from '../utils/periodFilter';

export interface PeriodFilterState {
  selection: PeriodSelection;
  setSelection: (selection: PeriodSelection) => void;
  /** L'intervalle à filtrer, et son libellé pour l'en-tête de la liste. */
  period: ResolvedPeriod;
  /** Même durée juste avant, pour les comparaisons « +12 % ». */
  previous: ResolvedPeriod;
}

/**
 * Le filtre de période d'un écran, gardé jusqu'au soir.
 *
 * Chaque écran a sa propre clé : regarder le mois dernier dans les Rapports ne
 * doit pas changer ce qu'affichent les Commandes. Le choix est relu au montage
 * et réécrit à chaque changement ; c'est `loadPeriodSelection` qui décide qu'un
 * choix de la veille n'est plus valable (on repart alors sur « Aujourd'hui »).
 *
 * `screenKey` doit rester stable d'une version à l'autre : c'est elle qui
 * retrouve le filtre du commerçant quand il revient sur l'écran.
 */
export function usePeriodFilter(screenKey: string): PeriodFilterState {
  const [selection, setSelection] = useState<PeriodSelection>(() => loadPeriodSelection(screenKey));

  useEffect(() => {
    savePeriodSelection(screenKey, selection);
  }, [screenKey, selection]);

  const period = useMemo(() => resolvePeriod(selection), [selection]);
  const previous = useMemo(() => previousPeriod(selection, period), [selection, period]);

  return { selection, setSelection, period, previous };
}
