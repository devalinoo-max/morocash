import React, { useMemo, useState } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCashJournal } from '../../hooks/useCashJournal';
import type { CashJournalLine } from '../../api/cash';
import type { PaymentMethod, Versement } from '../../types';
import { formatMoney, formatPaymentMethod, formatShortDate } from '../../utils/formatters';
import { endOfDay, getCustomRange, parseDateInput, startOfDay, toDateInputValue } from '../../utils/period';
import { DateRangeInputs } from '../common/DateRangeInputs';
import { VersementBadge } from '../payments/VersementRow';
import { VersementReceiptModal } from '../payments/VersementReceiptModal';

type PeriodMode = 'TODAY' | 'DAY' | 'RANGE';
type JournalFilter = 'ALL' | 'ENTREE' | 'SORTIE';

/** Quelle carte est ouverte : une des cartes fixes, ou un mode de paiement. */
type Detail = { kind: 'FOND' | 'ENTREE' | 'SORTIE' | 'SOLDE' } | { kind: 'MODE'; method: PaymentMethod };

const PAGE_SIZE = 50;

const KIND_PILL: Record<CashJournalLine['kind'], { label: string; bg: string; color: string }> = {
  ENTREE: { label: 'Entrée', bg: '#DCFCE7', color: '#166534' },
  SORTIE: { label: 'Sortie', bg: '#FEE2E2', color: '#991B1B' },
  FOND: { label: 'Fond de départ', bg: '#F3F4F6', color: '#374151' },
};

const EMPTY_TEXT = 'Aucun mouvement pour cette période.';

function dayLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Montant signé : une sortie retire de l'argent, le reste en ajoute. */
function signedAmount(line: CashJournalLine): string {
  return `${line.kind === 'SORTIE' ? '−' : '+'} ${formatMoney(line.amount)}`;
}

interface LineRowProps {
  line: CashJournalLine;
  /** Une seule journée affichée : l'heure suffit. */
  singleDay: boolean;
  /** Libellé et valeur du total courant à droite (« Cumul », « Solde après »). */
  running: { label: string; value: number } | null;
  onOpen?: (line: CashJournalLine) => void;
}

const LineRow: React.FC<LineRowProps> = ({ line, singleDay, running, onOpen }) => {
  const pill = KIND_PILL[line.kind];
  const when = singleDay
    ? formatShortDate(line.createdAt)
    : `${new Date(line.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} ${formatShortDate(
        line.createdAt
      )}`;
  const clickable = Boolean(onOpen) && line.kind !== 'FOND';

  const content = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-mono text-slate-500">{when}</span>
          <span
            className="inline-block whitespace-nowrap font-bold"
            style={{ backgroundColor: pill.bg, color: pill.color, borderRadius: 999, fontSize: 11, padding: '2px 8px' }}
          >
            {pill.label}
          </span>
          {line.versement && <VersementBadge versement={line.versement} />}
          {line.isCancelled && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-200 text-slate-700">Annulé</span>
          )}
        </div>
        <p className={`text-[13px] font-bold break-words ${line.isCancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
          {line.label}
        </p>
        <p className="text-[11px] text-slate-500">
          {[line.category, formatPaymentMethod(line.method), line.by].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div
          className={`text-sm font-black tabular-nums whitespace-nowrap ${
            line.isCancelled ? 'text-slate-400 line-through' : line.kind === 'SORTIE' ? 'text-[#991B1B]' : 'text-slate-900'
          }`}
        >
          {signedAmount(line)}
        </div>
        {running && !line.isCancelled && (
          <div className="text-[11px] font-semibold text-slate-500 tabular-nums mt-0.5 whitespace-nowrap">
            {running.label} : {formatMoney(running.value)}
          </div>
        )}
      </div>
    </div>
  );

  const base = 'w-full min-h-[48px] p-3 rounded-2xl border border-slate-200/80 bg-white text-left';
  return clickable ? (
    <button type="button" onClick={() => onOpen!(line)} className={`${base} cursor-pointer hover:border-slate-300 transition-colors`}>
      {content}
    </button>
  ) : (
    <div className={base}>{content}</div>
  );
};

interface FigureCardProps {
  label: string;
  hint?: string;
  amount: number;
  color?: string;
  onClick: () => void;
}

/** Un chiffre de la caisse : toute la carte se touche et ouvre son détail. */
const FigureCard: React.FC<FigureCardProps> = ({ label, hint, amount, color = '#0F172A', onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full min-h-[56px] p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-between gap-3 text-left cursor-pointer hover:border-slate-300 transition-colors"
  >
    <span className="min-w-0">
      <span className="block text-xs font-bold text-slate-500">{label}</span>
      <span className="block text-xl font-black tabular-nums tracking-tight" style={{ color }}>
        {formatMoney(amount)}
      </span>
      {hint && <span className="block text-[11px] text-slate-500 font-medium">{hint}</span>}
    </span>
    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
  </button>
);

/**
 * Les chiffres de la caisse sur une période et le journal de ses mouvements.
 *
 * Aucun total n'est additionné ici : cartes, cumuls et soldes viennent du
 * serveur (GET /cash/journal). `children` s'insère entre les cartes et le
 * journal (les actions de caisse).
 */
export const CashJournalSection: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { sales, pendingVersements, setSelectedSaleForReceipt, setActiveTab, setCustomersDebtorsFilter } = useApp();

  const [mode, setMode] = useState<PeriodMode>('TODAY');
  const [day, setDay] = useState(() => toDateInputValue(new Date()));
  const [rangeStart, setRangeStart] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toDateInputValue(new Date()));

  const period = useMemo(() => {
    const today = new Date();
    if (mode === 'DAY') {
      const d = parseDateInput(day) ?? today;
      return { start: startOfDay(d), end: endOfDay(d), label: `Le ${dayLabel(d)}`, singleDay: true };
    }
    if (mode === 'RANGE') {
      const range = getCustomRange(rangeStart, rangeEnd);
      if (range) {
        return { ...range, singleDay: range.start.toDateString() === range.end.toDateString() };
      }
    }
    return { start: startOfDay(today), end: endOfDay(today), label: "Aujourd'hui", singleDay: true };
  }, [mode, day, rangeStart, rangeEnd]);

  const { journal, loading, stale } = useCashJournal(period.start, period.end);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<JournalFilter>('ALL');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [versementOuvert, setVersementOuvert] = useState<Versement | null>(null);
  const [sortieOuverte, setSortieOuverte] = useState<CashJournalLine | null>(null);

  // Versements gardés sur le téléphone : visibles tout de suite, dans aucun total
  // tant que le serveur ne les a pas reçus.
  const pendingInPeriod = useMemo(
    () =>
      pendingVersements.filter((v) => {
        const t = new Date(v.createdAt).getTime();
        return t >= period.start.getTime() && t <= period.end.getTime();
      }),
    [pendingVersements, period]
  );

  const openLine = (line: CashJournalLine) => {
    if (line.kind === 'SORTIE') {
      setSortieOuverte(line);
      return;
    }
    const v = line.versement;
    if (!v) return;
    // Le paiement fait à la commande figure sur le reçu de la commande.
    const sale = v.atOrder && v.orderId ? sales.find((s) => s.id === v.orderId) : undefined;
    if (sale) setSelectedSaleForReceipt(sale);
    else setVersementOuvert(v);
  };

  const goToDebtors = () => {
    setCustomersDebtorsFilter(true);
    setActiveTab('customers');
  };

  const lines = journal?.lines ?? [];
  const journalLines = filter === 'ALL' ? lines : lines.filter((l) => l.kind === filter);

  const detailView = useMemo(() => {
    if (!detail || !journal) return null;
    if (detail.kind === 'MODE') {
      const total = journal.modes.find((m) => m.method === detail.method)?.total ?? 0;
      return {
        title: formatPaymentMethod(detail.method),
        total,
        lines: journal.lines.filter((l) => l.method === detail.method),
        running: (l: CashJournalLine) => ({ label: 'Cumul', value: l.cumulMode }),
      };
    }
    if (detail.kind === 'SOLDE') {
      return {
        title: 'Solde',
        total: journal.solde ?? 0,
        lines: journal.lines,
        running: (l: CashJournalLine) => (l.balanceAfter === null ? null : { label: 'Cumul', value: l.balanceAfter }),
      };
    }
    const kind = detail.kind;
    return {
      title: kind === 'FOND' ? 'Fond de départ' : kind === 'ENTREE' ? 'Entrées' : 'Sorties',
      total: kind === 'FOND' ? journal.fondDepart : kind === 'ENTREE' ? journal.entrees : journal.sorties ?? 0,
      lines: journal.lines.filter((l) => l.kind === kind),
      running: (l: CashJournalLine) => ({ label: 'Cumul', value: l.cumul }),
    };
  }, [detail, journal]);

  const periodTabs: { id: PeriodMode; label: string }[] = [
    { id: 'TODAY', label: "Aujourd'hui" },
    { id: 'DAY', label: 'Un jour précis' },
    { id: 'RANGE', label: 'Plusieurs jours' },
  ];

  const filterTabs: { id: JournalFilter; label: string }[] = [
    { id: 'ALL', label: 'Tout' },
    { id: 'ENTREE', label: 'Entrées' },
    ...(journal?.canSeeExits ? [{ id: 'SORTIE' as const, label: 'Sorties' }] : []),
  ];

  const tabClass = (active: boolean) =>
    `min-h-[48px] px-4 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
      active
        ? 'bg-[#4F46E5] text-white shadow-xs'
        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 hover:text-slate-900'
    }`;

  return (
    <>
      {/* SÉLECTEUR DE PÉRIODE */}
      <div id="cash-period-selector" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {periodTabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => { setMode(tab.id); setVisible(PAGE_SIZE); }} className={tabClass(mode === tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>
        {mode === 'DAY' && (
          <input
            id="cash-day"
            type="date"
            aria-label="Jour à afficher"
            value={day}
            max={toDateInputValue(new Date())}
            onChange={(e) => setDay(e.target.value)}
            className="min-h-[48px] px-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-800 cursor-pointer"
          />
        )}
        {mode === 'RANGE' && (
          <DateRangeInputs
            id="cash-range"
            className="w-fit"
            start={rangeStart}
            end={rangeEnd}
            onStartChange={setRangeStart}
            onEndChange={setRangeEnd}
          />
        )}
        {stale && journal && (
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            Hors ligne : ce sont les chiffres gardés sur ce téléphone.
          </p>
        )}
      </div>

      {!journal ? (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 text-center text-xs font-medium text-slate-500">
          {loading ? 'Chargement de la caisse…' : 'Impossible de charger la caisse. Vérifie ta connexion.'}
        </div>
      ) : (
        <>
          {/* CARTES — chaque chiffre ouvre son détail */}
          <div id="cash-figures" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <FigureCard label="Fond de départ" amount={journal.fondDepart} onClick={() => setDetail({ kind: 'FOND' })} />
            <FigureCard
              label="Entrées"
              hint="Paiements à la commande et versements"
              amount={journal.entrees}
              color="#166534"
              onClick={() => setDetail({ kind: 'ENTREE' })}
            />
            {journal.canSeeExits && journal.sorties !== null && (
              <FigureCard
                label="Sorties"
                hint="Dépenses et argent sorti"
                amount={journal.sorties}
                color="#991B1B"
                onClick={() => setDetail({ kind: 'SORTIE' })}
              />
            )}
            {journal.canSeeExits && journal.solde !== null && (
              <FigureCard
                label="Solde"
                hint="Fond + Entrées − Sorties"
                amount={journal.solde}
                color="#4F46E5"
                onClick={() => setDetail({ kind: 'SOLDE' })}
              />
            )}
          </div>

          {journal.modes.length > 0 && (
            <div id="cash-modes" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {journal.modes.map((m) => (
                <FigureCard
                  key={m.method}
                  label={formatPaymentMethod(m.method)}
                  amount={m.total}
                  onClick={() => setDetail({ kind: 'MODE', method: m.method })}
                />
              ))}
            </div>
          )}

          <FigureCard
            label="Ce que les clients nous doivent"
            hint={`${journal.creances.nbClients} client${journal.creances.nbClients > 1 ? 's' : ''} — pas encore encaissé, donc pas dans la caisse`}
            amount={journal.creances.total}
            color="#BE123C"
            onClick={goToDebtors}
          />

          {children}

          {/* JOURNAL DE LA CAISSE */}
          <section id="cash-journal" className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-slate-100 space-y-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Journal de la caisse</h3>
                <p className="text-xs text-slate-500">{period.label}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {filterTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => { setFilter(tab.id); setVisible(PAGE_SIZE); }}
                    className={tabClass(filter === tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 space-y-2">
              {filter !== 'SORTIE' &&
                pendingInPeriod.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVersementOuvert(v)}
                    className="w-full min-h-[48px] p-3 rounded-2xl border border-amber-200 bg-amber-50/60 text-left cursor-pointer flex items-start justify-between gap-3"
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-mono text-slate-500">{formatShortDate(v.createdAt)}</span>
                        <VersementBadge versement={v} />
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900">
                          En attente d’envoi
                        </span>
                      </span>
                      <span className="block text-[13px] font-bold text-slate-900 break-words">{v.customerName || 'Client'}</span>
                      <span className="block text-[11px] text-slate-500">{formatPaymentMethod(v.method)}</span>
                    </span>
                    <span className="text-sm font-black tabular-nums whitespace-nowrap text-slate-900">+ {formatMoney(v.amount)}</span>
                  </button>
                ))}

              {journalLines.length === 0 && (filter === 'SORTIE' || pendingInPeriod.length === 0) ? (
                <p className="py-10 text-center text-xs text-slate-400">{EMPTY_TEXT}</p>
              ) : (
                journalLines.slice(0, visible).map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    singleDay={period.singleDay}
                    running={line.balanceAfter === null ? null : { label: 'Solde après', value: line.balanceAfter }}
                    onOpen={openLine}
                  />
                ))
              )}

              {journalLines.length > visible && (
                <button
                  type="button"
                  onClick={() => setVisible((n) => n + PAGE_SIZE)}
                  className="w-full min-h-[48px] rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold text-[#4F46E5] cursor-pointer hover:bg-slate-100"
                >
                  Voir plus
                </button>
              )}
            </div>

            {/* RÉCAP */}
            <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/70 space-y-3 text-xs">
              {journal.canSeeExits && journal.sorties !== null && journal.solde !== null ? (
                <p className="font-bold text-slate-700 leading-relaxed">
                  Fond de départ <span className="tabular-nums text-slate-900">{formatMoney(journal.fondDepart)}</span> + Entrées{' '}
                  <span className="tabular-nums text-[#166534]">{formatMoney(journal.entrees)}</span> − Sorties{' '}
                  <span className="tabular-nums text-[#991B1B]">{formatMoney(journal.sorties)}</span> = Solde{' '}
                  <span className="tabular-nums font-black text-[#4F46E5]">{formatMoney(journal.solde)}</span>
                </p>
              ) : (
                <p className="font-bold text-slate-700 leading-relaxed">
                  Fond de départ <span className="tabular-nums text-slate-900">{formatMoney(journal.fondDepart)}</span> · Entrées{' '}
                  <span className="tabular-nums text-[#166534]">{formatMoney(journal.entrees)}</span>
                </p>
              )}
              <button
                type="button"
                onClick={goToDebtors}
                className="w-full min-h-[48px] flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <span className="font-bold text-slate-700">
                  Ce que les clients nous doivent :{' '}
                  <span className="tabular-nums text-[#BE123C]">{formatMoney(journal.creances.total)}</span>
                </span>
                <span className="font-bold text-[#4F46E5] whitespace-nowrap">Voir qui me doit ›</span>
              </button>
            </div>
          </section>
        </>
      )}

      {/* DÉTAIL D'UNE CARTE — panneau latéral sur ordinateur */}
      {detailView && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-stretch md:justify-end bg-slate-950/50 animate-in fade-in duration-150"
          onClick={() => setDetail(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={detailView.title}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-50 w-full md:w-[440px] max-h-[92vh] md:max-h-none md:h-full rounded-t-3xl md:rounded-none flex flex-col shadow-2xl"
          >
            <div className="p-4 bg-white border-b border-slate-200 flex items-start justify-between gap-3 rounded-t-3xl md:rounded-none">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900">{detailView.title}</h3>
                <p className="text-xs text-slate-500">{period.label}</p>
                <p className="text-3xl font-black text-slate-900 tabular-nums tracking-tight mt-2">
                  {formatMoney(detailView.total)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setDetail(null)}
                className="w-12 h-12 -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {detailView.lines.length === 0 ? (
                <p className="py-10 text-center text-xs text-slate-400">{EMPTY_TEXT}</p>
              ) : (
                detailView.lines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    singleDay={period.singleDay}
                    running={detailView.running(line)}
                    onOpen={openLine}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DÉTAIL D'UNE SORTIE */}
      {sortieOuverte && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60"
          onClick={() => setSortieOuverte(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Détail de la sortie"
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-slate-900">
                  {sortieOuverte.expenseId ? 'Dépense' : 'Argent sorti de la caisse'}
                </h3>
                <p className="text-2xl font-black text-[#991B1B] tabular-nums mt-1">− {formatMoney(sortieOuverte.amount)}</p>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setSortieOuverte(null)}
                className="w-12 h-12 -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <dl className="text-xs divide-y divide-slate-100">
              {(
                [
                  ['Motif', sortieOuverte.label],
                  ['Catégorie', sortieOuverte.category],
                  ['Mode', formatPaymentMethod(sortieOuverte.method)],
                  ['Quand', `${dayLabel(new Date(sortieOuverte.createdAt))} à ${formatShortDate(sortieOuverte.createdAt)}`],
                  ['Par', sortieOuverte.by],
                ] as [string, string | null][]
              )
                .filter(([, value]) => Boolean(value))
                .map(([label, value]) => (
                  <div key={label} className="py-2.5 flex items-start justify-between gap-4">
                    <dt className="font-medium text-slate-500 shrink-0">{label}</dt>
                    <dd className="font-bold text-slate-900 text-right break-words min-w-0">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </div>
      )}

      {versementOuvert && <VersementReceiptModal versement={versementOuvert} onClose={() => setVersementOuvert(null)} />}
    </>
  );
};
