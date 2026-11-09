import React, { useEffect, useState } from 'react';
import { CalendarRange, Download, X } from 'lucide-react';
import { Segmented } from '../sales/SalesKit';
import { formatMoney } from '../../utils/formatters';
import {
  PERIOD_SHORTCUTS,
  PERIOD_TOO_LONG_MESSAGE,
  exceedsMaxSpan,
  normalizeCustomRange,
  toDayValue,
  type PeriodSelection,
  type PeriodShortcut,
  type ResolvedPeriod,
} from '../../utils/periodFilter';

/** Les totaux de la période, écrits à côté du libellé. */
export interface PeriodTotals {
  vendu?: number;
  encaisse?: number;
  resteDu?: number;
}

interface PeriodFilterBarProps {
  /** Unique par écran : sert d'identifiant à la pastille du sélecteur. */
  id: string;
  selection: PeriodSelection;
  onChange: (selection: PeriodSelection) => void;
  /** L'intervalle déjà résolu, pour écrire le libellé et pré-remplir la feuille. */
  period: ResolvedPeriod;
  /** « 47 commandes », « 12 dépenses » — compté par l'écran, pas ici. */
  countLabel?: string;
  /** Vendu, encaissé, reste dû. Un champ absent n'est pas affiché. */
  totals?: PeriodTotals;
  /** Exporte exactement la période affichée. Absent = pas de bouton. */
  onExport?: () => void;
  exportBusy?: boolean;
  /** Désactive l'export (offre sans export Excel, période vide…). */
  exportDisabled?: boolean;
  exportTitle?: string;
}

/**
 * La barre de filtre de période, identique sur Commandes, Dépenses, Rapports
 * et Clients.
 *
 * Les sept raccourcis sont les mêmes partout : un commerçant qui apprend
 * « Mois dernier » sur un écran le retrouve sur les trois autres.
 * « Personnalisé » ouvre une feuille à deux dates, qui refuse une période de
 * plus de douze mois et remet sans rien dire deux dates inversées dans l'ordre.
 *
 * La période choisie reste écrite en toutes lettres sous les puces, avec ses
 * totaux : sans ça, un filtre oublié fait croire à une journée creuse.
 */
export const PeriodFilterBar: React.FC<PeriodFilterBarProps> = ({
  id,
  selection,
  onChange,
  period,
  countLabel,
  totals,
  onExport,
  exportBusy = false,
  exportDisabled = false,
  exportTitle,
}) => {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Les dates de la feuille ne touchent le filtre qu'au clic sur « Appliquer » :
  // taper une date de fin avant d'avoir changé le début ne doit pas vider la
  // liste entre deux frappes.
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  // À l'ouverture, la feuille part de la période affichée : on ajuste une
  // plage, on ne la ressaisit pas de zéro.
  useEffect(() => {
    if (!sheetOpen) return;
    setDraftStart(selection.customStart ?? toDayValue(period.start));
    setDraftEnd(selection.customEnd ?? toDayValue(period.end));
    setErreur(null);
  }, [sheetOpen, selection.customStart, selection.customEnd, period.start, period.end]);

  const choisirRaccourci = (shortcut: PeriodShortcut) => {
    if (shortcut === 'custom') {
      setSheetOpen(true);
      return;
    }
    onChange({ shortcut });
  };

  const appliquer = () => {
    const plage = normalizeCustomRange(draftStart, draftEnd);
    if (!plage) {
      setErreur('Choisis une date de début et une date de fin.');
      return;
    }
    if (exceedsMaxSpan(plage.start, plage.end)) {
      setErreur(PERIOD_TOO_LONG_MESSAGE);
      return;
    }
    // Les bornes sont rangées dans l'ordre avant d'être gardées : l'écran
    // n'aura jamais à se demander laquelle est laquelle.
    onChange({ shortcut: 'custom', customStart: plage.startValue, customEnd: plage.endValue });
    setSheetOpen(false);
  };

  const lignesTotaux = [
    totals?.vendu !== undefined ? { label: 'Vendu', valeur: totals.vendu, classe: 'text-mc-ink' } : null,
    totals?.encaisse !== undefined
      ? { label: 'Encaissé', valeur: totals.encaisse, classe: 'text-[#15803D]' }
      : null,
    totals?.resteDu !== undefined
      ? { label: 'Reste dû', valeur: totals.resteDu, classe: 'text-[#B45309]' }
      : null,
  ].filter((l): l is { label: string; valeur: number; classe: string } => l !== null);

  return (
    <div className="space-y-3">
      <div className="flex flex-col xl:flex-row xl:items-center gap-3">
        <Segmented<PeriodShortcut>
          id={id}
          label="Période"
          value={selection.shortcut}
          onChange={choisirRaccourci}
          options={PERIOD_SHORTCUTS}
        />
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={exportBusy || exportDisabled}
            title={exportTitle ?? `Exporter ${period.label.toLowerCase()}`}
            className="h-10 px-4 shrink-0 rounded-full bg-white border border-mc-line text-[13px] font-bold text-mc-ink inline-flex items-center gap-1.5 cursor-pointer transition-all duration-200 active:scale-[0.97] hover:border-mc-primary hover:text-mc-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {exportBusy ? 'Export…' : 'Exporter'}
          </button>
        )}
      </div>

      {/* La période affichée, et ce qu'elle totalise. Toujours visible : c'est
          la réponse à « pourquoi je ne vois que trois commandes ? ». */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 rounded-2xl bg-white border border-mc-line">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-mc-ink">
          <CalendarRange className="w-4 h-4 text-mc-primary shrink-0" />
          {period.label}
        </span>
        {countLabel && <span className="text-[13px] font-semibold text-mc-soft">· {countLabel}</span>}
        {lignesTotaux.length > 0 && (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 ml-auto">
            {lignesTotaux.map((l) => (
              <span key={l.label} className="text-[12px] font-semibold text-mc-soft">
                {l.label}{' '}
                <strong className={`text-[13px] font-extrabold tabular-nums ${l.classe}`}>
                  {formatMoney(l.valeur)}
                </strong>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* =====================================================================
          FEUILLE « PERSONNALISÉ » — deux dates et un bouton, rien de plus
          ===================================================================== */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[65] bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-mc border border-mc-line shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-mc-ink">Choisis ta période</h3>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Fermer"
                className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-mc-soft cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-du`} className="text-xs font-bold text-slate-700">
                  Du
                </label>
                <input
                  id={`${id}-du`}
                  type="date"
                  value={draftStart}
                  onChange={(e) => {
                    setDraftStart(e.target.value);
                    setErreur(null);
                  }}
                  className="w-full bg-slate-50 border border-mc-line rounded-xl px-3 py-2.5 font-bold text-mc-ink text-[13px] focus:outline-none focus:ring-2 focus:ring-mc-primary cursor-pointer"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-au`} className="text-xs font-bold text-slate-700">
                  Au
                </label>
                <input
                  id={`${id}-au`}
                  type="date"
                  value={draftEnd}
                  onChange={(e) => {
                    setDraftEnd(e.target.value);
                    setErreur(null);
                  }}
                  className="w-full bg-slate-50 border border-mc-line rounded-xl px-3 py-2.5 font-bold text-mc-ink text-[13px] focus:outline-none focus:ring-2 focus:ring-mc-primary cursor-pointer"
                />
              </div>
            </div>

            {erreur && (
              <p
                role="alert"
                className="px-3 py-2 rounded-xl bg-mc-danger-bg text-[12px] font-bold text-[#DC2626]"
              >
                {erreur}
              </p>
            )}

            <button
              type="button"
              onClick={appliquer}
              className="w-full h-11 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-[14px] font-bold cursor-pointer transition-all duration-200 active:scale-[0.97]"
            >
              Appliquer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
