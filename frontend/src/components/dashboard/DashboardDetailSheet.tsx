import React from 'react';
import { ArrowRight, ChevronRight, X } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';

export interface DetailRow {
  id: string;
  /** Date ISO de la ligne. */
  date: string;
  title: string;
  subtitle?: string;
  /** Ligne en italique sous le titre (motif d'annulation, note de dépense). */
  note?: string;
  amount: number;
  /** negative : affiché en rouge avec un « − » devant. */
  tone?: 'default' | 'negative' | 'positive' | 'muted';
  badge?: { label: string; bg: string; fg: string };
  onClick?: () => void;
}

export interface DetailSummaryLine {
  label: string;
  value: number;
  /** '-' : la ligne est retranchée du total. */
  sign?: '+' | '-';
}

export interface DashboardDetail {
  title: string;
  /** La période ou le périmètre du chiffre, en clair. */
  subtitle: string;
  total: { label: string; value: number; tone?: 'default' | 'negative' | 'positive' };
  /** Le calcul qui mène au total, quand il n'est pas une simple somme. */
  summary?: DetailSummaryLine[];
  rowsTitle?: string;
  rows: DetailRow[];
  emptyText: string;
  footer?: { label: string; onClick: () => void };
}

const TONE_CLASS = {
  default: 'text-slate-900',
  negative: 'text-[#DC2626]',
  positive: 'text-[#059669]',
  muted: 'text-slate-400 line-through',
} as const;

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) +
  ' · ' +
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Ce qui compose un chiffre de l'Accueil.
 *
 * Chaque carte de l'Accueil ouvre ce panneau : le total en haut, le calcul
 * s'il y en a un, puis les lignes une par une. Le commerçant peut ainsi
 * retrouver d'où vient un montant qui l'étonne sans changer d'écran.
 */
export const DashboardDetailSheet: React.FC<{ detail: DashboardDetail; onClose: () => void }> = ({
  detail,
  onClose,
}) => {
  const totalTone = TONE_CLASS[detail.total.tone ?? 'default'];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        id="dashboard-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-lg max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 flex flex-col"
      >
        <div className="p-5 pb-4 border-b border-slate-100 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-extrabold text-base text-slate-900">{detail.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{detail.subtitle}</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1.5">
            {detail.summary?.map((line) => (
              <div key={line.label} className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-600">{line.label}</span>
                <span className="font-bold text-slate-800 tabular-nums">
                  {line.sign === '-' ? '− ' : ''}
                  {formatMoney(line.value)}
                </span>
              </div>
            ))}
            <div
              className={`flex items-center justify-between ${
                detail.summary?.length ? 'pt-1.5 border-t border-slate-200' : ''
              }`}
            >
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                {detail.total.label}
              </span>
              <span className={`text-lg font-black tabular-nums ${totalTone}`}>
                {detail.total.value < 0 ? '−' : ''}
                {formatMoney(Math.abs(detail.total.value))}
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {detail.rowsTitle && detail.rows.length > 0 && (
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
              {detail.rowsTitle} ({detail.rows.length})
            </p>
          )}
          {detail.rows.length === 0 ? (
            <p className="py-10 text-center text-sm font-semibold text-slate-500">{detail.emptyText}</p>
          ) : (
            detail.rows.map((row) => {
              const tone = row.tone ?? 'default';
              const content = (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-extrabold text-slate-900 truncate">{row.title}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      {formatWhen(row.date)}
                      {row.subtitle ? ` · ${row.subtitle}` : ''}
                    </p>
                    {row.note && <p className="text-[11px] text-slate-500 italic mt-0.5">{row.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-black tabular-nums ${TONE_CLASS[tone]}`}>
                      {tone === 'negative' ? '− ' : ''}
                      {formatMoney(row.amount)}
                    </div>
                    {row.badge && (
                      <span
                        className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold"
                        style={{ backgroundColor: row.badge.bg, color: row.badge.fg }}
                      >
                        {row.badge.label}
                      </span>
                    )}
                  </div>
                  {row.onClick && <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                </>
              );
              const className =
                'w-full p-3 rounded-2xl border border-slate-200/80 bg-white flex items-center gap-3 text-left';
              return row.onClick ? (
                <button
                  key={row.id}
                  type="button"
                  onClick={row.onClick}
                  className={`${className} cursor-pointer hover:border-indigo-300 transition-colors`}
                >
                  {content}
                </button>
              ) : (
                <div key={row.id} className={className}>
                  {content}
                </div>
              );
            })
          )}
        </div>

        {detail.footer && (
          <div className="p-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={detail.footer.onClick}
              className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <span>{detail.footer.label}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
