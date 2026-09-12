import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  X,
  Lock,
  Unlock,
  CreditCard,
  Banknote,
  Send,
  Calendar,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Users,
} from 'lucide-react';
import { formatMoney, formatMoneyCompact, formatDate, formatShortDate } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { PaymentMethod, CashMovement } from '../../types';
import { getPeriodRange, isWithinRange, SimplePeriod } from '../../utils/period';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';

export const CashRegisterTab: React.FC = () => {
  const {
    cashSessions,
    activeCashSession,
    cashMovements,
    openCashRegister,
    closeCashRegister,
    addCashMovement,
    sales,
    customers,
    expenses,
    settings,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    showToast,
    isWriteLocked,
    gateWrite,
  } = useApp();

  // Modals state
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState<'WITHDRAW' | 'DEPOSIT' | null>(null);

  // Close Register form state
  const [countedAmount, setCountedAmount] = useState<number>(0);
  const [discrepancyComment, setDiscrepancyComment] = useState<string>('');

  // Open Register form state
  const [startFundAmount, setStartFundAmount] = useState<number>(10000);

  // Action (Withdraw/Deposit) form state
  const [actionAmount, setActionAmount] = useState<number>(0);
  const [actionMethod, setActionMethod] = useState<PaymentMethod>('CASH');
  const [actionReason, setActionReason] = useState<string>('');

  // 1. Calculations for the active session
  const sessionMovements = useMemo(() => {
    if (!activeCashSession) return [];
    return cashMovements.filter((m) => m.cashRegisterId === activeCashSession.id);
  }, [activeCashSession, cashMovements]);

  const fondDepart = activeCashSession ? activeCashSession.fondDepart : 0;

  // Real cash movements breakdown
  const especesEntrees = sessionMovements
    .filter((m) => m.type === 'ENTREE' && m.methode === 'CASH')
    .reduce((acc, m) => acc + m.montant, 0);

  const mmEntrees = sessionMovements
    .filter((m) => m.type === 'ENTREE' && m.methode !== 'CASH')
    .reduce((acc, m) => acc + m.montant, 0);

  const totalEntrees = sessionMovements
    .filter((m) => m.type === 'ENTREE')
    .reduce((acc, m) => acc + m.montant, 0);

  const totalSorties = sessionMovements
    .filter((m) => m.type === 'SORTIE')
    .reduce((acc, m) => acc + m.montant, 0);

  // The amount expected in cash register
  const montantAttendu = fondDepart + totalEntrees - totalSorties;

  // Credit sales count today (not counted in cash register, to avoid confusion §BLOC 7)
  const creditSalesCount = sales.filter(
    (s) => s.paymentStatus === 'CREDIT' || (s.remainingAmount > 0 && s.paidAmount === 0)
  ).length;

  // Breakdown by payment provider
  const providerBreakdown = useMemo(() => {
    const methods: { id: PaymentMethod; label: string; color: string; bg: string }[] = [
      { id: 'CASH', label: 'Espèces (Caisse physique)', color: '#059669', bg: 'bg-emerald-50 text-emerald-700' },
      { id: 'WAVE', label: 'Wave', color: '#00C3F7', bg: 'bg-sky-50 text-sky-700' },
      { id: 'ORANGE_MONEY', label: 'Orange Money', color: '#FF6600', bg: 'bg-orange-50 text-orange-700' },
      { id: 'MTN', label: 'MTN Mobile Money', color: '#FFCC00', bg: 'bg-amber-50 text-amber-700' },
      { id: 'MOOV', label: 'Moov Money', color: '#004F9F', bg: 'bg-blue-50 text-blue-700' },
      { id: 'VIREMENT', label: 'Virement / Chèque', color: '#4F46E5', bg: 'bg-indigo-50 text-indigo-700' },
    ];

    return methods.map((m) => {
      const items = sessionMovements.filter((mov) => mov.methode === m.id && mov.type === 'ENTREE');
      const total = items.reduce((acc, mov) => acc + mov.montant, 0);
      const count = items.length;
      const percent = totalEntrees > 0 ? Math.round((total / totalEntrees) * 100) : 0;
      return {
        ...m,
        total,
        count,
        percent,
      };
    });
  }, [sessionMovements, totalEntrees]);

  // Expenses recorded today (uniquement celles datées d'aujourd'hui — la version
  // précédente sommait TOUTES les dépenses jamais enregistrées, toutes dates confondues)
  const todayExpenses = useMemo(() => {
    const today = getPeriodRange('TODAY');
    return expenses.filter((e) => isWithinRange(e.date, today)).reduce((acc, e) => acc + e.amount, 0);
  }, [expenses]);

  // Previous closed sessions
  const pastClosedSessions = cashSessions.filter((s) => s.statut === 'FERMEE').slice(0, 4);

  // Ce que les clients doivent au total (rappel — même donnée que l'onglet Clients,
  // affichée ici pour ne pas devoir changer d'écran en comptant sa caisse)
  const totalCustomerDebts = customers.reduce((acc, c) => acc + c.totalDebt, 0);
  const debtorsCount = customers.filter((c) => c.totalDebt > 0).length;

  // ========================================================================
  // FILTRE DE PÉRIODE — pour "Tous les mouvements" et le résumé ci-dessous.
  // Le bandeau, la carte héros et les 4 indicateurs restent toujours sur le
  // direct/aujourd'hui : "ce que tu dois avoir en caisse maintenant" n'existe
  // pas pour une date passée. Même vocabulaire de période que le Tableau de
  // bord (frontend/src/utils/period.ts), pour ne pas réapprendre deux fois
  // les mêmes mots selon l'écran.
  // ========================================================================
  const [caissePeriod, setCaissePeriod] = useState<SimplePeriod>('TODAY');

  const periodRange = useMemo(() => getPeriodRange(caissePeriod), [caissePeriod]);

  const isSingleDayPeriod = caissePeriod === 'TODAY' || caissePeriod === 'YESTERDAY';

  const periodMovements = useMemo(() => {
    return cashMovements
      .filter((m) => isWithinRange(m.createdAt, periodRange))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [cashMovements, periodRange]);

  const periodStats = useMemo(() => {
    const entrees = periodMovements.filter((m) => m.type === 'ENTREE').reduce((acc, m) => acc + m.montant, 0);
    const sorties = periodMovements.filter((m) => m.type === 'SORTIE').reduce((acc, m) => acc + m.montant, 0);
    const depenses = expenses
      .filter((e) => isWithinRange(e.date, periodRange))
      .reduce((acc, e) => acc + e.amount, 0);
    return { entrees, sorties, depenses, solde: entrees - sorties };
  }, [periodMovements, expenses, periodRange]);

  const periodEcartCumule = useMemo(() => {
    return cashSessions
      .filter((s) => s.statut === 'FERMEE' && s.fermeeLe)
      .filter((s) => isWithinRange(s.fermeeLe as string, periodRange))
      .reduce((acc, s) => acc + (s.ecart ?? 0), 0);
  }, [cashSessions, periodRange]);

  // Handlers
  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startFundAmount < 0) {
      showToast('Saisis un montant valide pour le fond de départ', 'warning');
      return;
    }
    await openCashRegister(startFundAmount);
    setIsOpenModalOpen(false);
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const ecart = countedAmount - montantAttendu;
    if (ecart !== 0 && !discrepancyComment.trim()) {
      showToast('Un motif est obligatoire pour justifier l’écart de caisse', 'warning');
      return;
    }
    await closeCashRegister(countedAmount, discrepancyComment.trim() || undefined);
    setIsCloseModalOpen(false);
    setCountedAmount(0);
    setDiscrepancyComment('');
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionAmount <= 0) {
      showToast('Saisis un montant supérieur à 0', 'warning');
      return;
    }
    if (isActionModalOpen === 'WITHDRAW' && !actionReason.trim()) {
      showToast('Toute sortie de caisse exige un motif obligatoire', 'warning');
      return;
    }

    await addCashMovement({
      type: isActionModalOpen === 'WITHDRAW' ? 'SORTIE' : 'ENTREE',
      origine: isActionModalOpen === 'WITHDRAW' ? 'RETRAIT' : 'APPORT',
      montant: actionAmount,
      methode: actionMethod,
      motif: actionReason.trim() || (isActionModalOpen === 'WITHDRAW' ? 'Sortie manuelle' : 'Apport de monnaie'),
    });

    setIsActionModalOpen(null);
    setActionAmount(0);
    setActionReason('');
  };

  return (
    <div id="cash-register-page" className="space-y-6 pb-24 max-w-[1460px] mx-auto animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. BANDEAU D'ÉTAT (BLOC 7: Vert doux si ouverte, gris si fermée) */}
      {/* ========================================================================= */}
      <div
        id="cash-status-banner"
        className={`p-4 sm:p-5 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs transition-all ${
          activeCashSession
            ? 'bg-[#ECFDF5] border-[#A7F3D0]'
            : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
              activeCashSession ? 'bg-[#059669] text-white' : 'bg-slate-300 text-slate-700'
            }`}
          >
            {activeCashSession ? <Unlock className="w-5 h-5 stroke-[2.5]" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                {activeCashSession
                  ? `Caisse ouverte depuis ${formatShortDate(activeCashSession.ouverteLe)} par ${activeCashSession.ouvertePar}`
                  : 'Caisse actuellement fermée'}
              </h2>
              {activeCashSession && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  En service
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              {activeCashSession ? (
                <>
                  Fond de départ : <strong className="text-slate-900">{formatMoney(fondDepart)}</strong> ·{' '}
                  <strong className="text-slate-900">{sessionMovements.length}</strong> mouvements enregistrés aujourd'hui
                </>
              ) : (
                'Ouvre ta caisse pour suivre les entrées, sorties et moyens de paiement de la journée.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeCashSession ? (
            <button
              onClick={() => gateWrite(() => {
                setCountedAmount(montantAttendu);
                setIsCloseModalOpen(true);
              })}
              className={`px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Fermer la caisse et compter</span>
            </button>
          ) : (
            <button
              onClick={() => gateWrite(() => setIsOpenModalOpen(true))}
              className={`px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Ouvrir la caisse</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2 & 3. CARTE HÉROS (5 cols) + PAR OÙ L'ARGENT EST ENTRÉ (7 cols) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CARTE HÉROS (5 colonnes sur 12) */}
        <div
          id="hero-cash-theorical-card"
          className="lg:col-span-5 bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-xs flex flex-col justify-between space-y-6 relative overflow-hidden"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Ce que tu dois avoir en caisse maintenant
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Caisse active"></span>
            </div>

            {/* Chiffre 50px bold tabular-nums */}
            <div className="text-4xl sm:text-[50px] font-black text-slate-900 tracking-tight leading-none tabular-nums">
              {formatMoney(montantAttendu)}
            </div>

            {/* Explication complète en français direct sans jargon (§ BLOC 7) */}
            <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <strong className="text-slate-900">{formatMoney(fondDepart)}</strong> de départ, plus{' '}
              <strong className="text-emerald-700">+{formatMoney(especesEntrees)}</strong> reçus en espèces et{' '}
              <strong className="text-sky-700">+{formatMoney(mmEntrees)}</strong> en mobile money, moins{' '}
              <strong className="text-rose-600">-{formatMoney(totalSorties)}</strong> sortis.
              <br />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Compte ton argent ce soir : si le compte ne tombe pas juste, tu sauras tout de suite.
              </span>
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <button
              onClick={() => gateWrite(() => {
                setCountedAmount(montantAttendu);
                setIsCloseModalOpen(true);
              })}
              className={`w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Lock className="w-4 h-4" />
              <span>Fermer la caisse et compter</span>
            </button>
            <p className="text-[11px] text-center text-slate-400 font-medium">
              Chaque fermeture est définitive, datée et archivée.
            </p>
          </div>

          <div className="h-1 w-full bg-[#059669] absolute bottom-0 left-0"></div>
        </div>

        {/* PAR OÙ L'ARGENT EST ENTRÉ AUJOURD'HUI (7 colonnes sur 12) */}
        <div
          id="payment-providers-card"
          className="lg:col-span-7 bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-7 shadow-xs space-y-5 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Par où l'argent est entré aujourd'hui
              </h3>
              <p className="text-xs text-slate-500">
                Répartition réelle par moyen d'encaissement
              </p>
            </div>
            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">
              Total : {formatMoney(totalEntrees)}
            </span>
          </div>

          {/* Provider lines */}
          <div className="space-y-3.5">
            {providerBreakdown.map((item) => {
              const isZero = item.total === 0;
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border transition-all ${
                    isZero ? 'bg-slate-50/70 border-slate-100 opacity-65' : 'bg-white border-slate-200/80 shadow-2xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 text-xs mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: isZero ? '#94A3B8' : item.color }}
                      ></span>
                      <span className={`font-bold truncate ${isZero ? 'text-slate-500' : 'text-slate-900'}`}>
                        {item.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-slate-500 font-medium">
                        {item.count} encaissement{item.count > 1 ? 's' : ''}
                      </span>
                      <span
                        className={`text-sm font-black tabular-nums ${
                          isZero ? 'text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {formatMoney(item.total)}
                      </span>
                    </div>
                  </div>

                  {/* Proportion bar */}
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${item.percent}%`,
                        backgroundColor: isZero ? '#CBD5E1' : item.color,
                      }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400 font-medium italic">
            Note : un moyen à 0 F reste affiché en gris car l’absence d’encaissement est une information précieuse.
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. QUATRE INDICATEURS (Fond de départ · Argent entré · Sorti · Dépensé) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Fond de départ */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-500">Fond de départ</span>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatMoneyCompact(fondDepart)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Mis en caisse à l’ouverture
            </p>
          </div>
          <div className="h-1 w-full bg-[#4F46E5] -mx-4 -mb-4 mt-3"></div>
        </div>

        {/* 2. Argent entré (avec mention: 4 commandes à crédit non comptées) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Argent entré</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                <ArrowUpRight className="w-3 h-3" /> Reçu
              </span>
            </div>
            <div className="text-2xl font-black text-[#059669] tracking-tight">
              {formatMoneyCompact(totalEntrees)}
            </div>
            <p className="text-[11px] text-amber-700 font-bold flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              <span>{creditSalesCount} commandes à crédit non comptées</span>
            </p>
          </div>
          <div className="h-1 w-full bg-[#059669] -mx-4 -mb-4 mt-3"></div>
        </div>

        {/* 3. Argent sorti de la caisse */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Argent sorti</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                <ArrowDownRight className="w-3 h-3" /> Sorties
              </span>
            </div>
            <div className="text-2xl font-black text-[#D97706] tracking-tight">
              {formatMoneyCompact(totalSorties)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Retraits ou achats justifiés
            </p>
          </div>
          <div className="h-1 w-full bg-[#D97706] -mx-4 -mb-4 mt-3"></div>
        </div>

        {/* 4. Dépensé aujourd'hui */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between overflow-hidden">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Dépensé aujourd'hui</span>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                Charges
              </span>
            </div>
            <div className="text-2xl font-black text-[#DC2626] tracking-tight">
              {formatMoneyCompact(todayExpenses)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {countLabel(
                expenses.filter((e) => isWithinRange(e.date, getPeriodRange('TODAY'))).length,
                'note de frais',
                'notes de frais'
              )}{' '}
              aujourd'hui
            </p>
          </div>
          <div className="h-1 w-full bg-[#DC2626] -mx-4 -mb-4 mt-3"></div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CE QU'ON NOUS DOIT — rappel des dettes clients, sans changer d'écran */}
      {/* ========================================================================= */}
      <div
        onClick={() => {
          setCustomersDebtorsFilter(true);
          setActiveTab('customers');
        }}
        className="p-4 sm:p-5 rounded-3xl bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs cursor-pointer hover:bg-rose-100/60 transition-all group"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-rose-800">
              Ce que les clients nous doivent
            </span>
            <div className="text-xl sm:text-2xl font-black text-rose-700 mt-0.5">
              {formatMoneyCompact(totalCustomerDebts)}
            </div>
            <p className="text-[11px] text-rose-600 font-medium">
              Réparti sur {debtorsCount} client{debtorsCount > 1 ? 's' : ''} — pas encore encaissé, donc pas dans la caisse
            </p>
          </div>
        </div>
        <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-rose-300 text-rose-700 text-xs font-bold shadow-2xs group-hover:bg-rose-600 group-hover:text-white group-hover:border-rose-600 transition-all shrink-0">
          Voir qui me doit
        </span>
      </div>

      {/* ========================================================================= */}
      {/* 6. "QUE VEUX-TU FAIRE ?" (BLOC 7: 4 actions directes) */}
      {/* ========================================================================= */}
      <div id="quick-cash-actions" className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
          Que veux-tu faire ?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => gateWrite(() => {
              setIsActionModalOpen('WITHDRAW');
              setActionAmount(0);
              setActionReason('');
            })}
            className={`p-4 rounded-2xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-left transition-all cursor-pointer group flex items-start gap-3 ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Minus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-rose-700 transition-colors">
                Sortir de l'argent de la caisse
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Motif obligatoire pour traçabilité
              </span>
            </div>
          </button>

          <button
            onClick={() => gateWrite(() => {
              setIsActionModalOpen('DEPOSIT');
              setActionAmount(0);
              setActionReason('');
            })}
            className={`p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-left transition-all cursor-pointer group flex items-start gap-3 ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-emerald-700 transition-colors">
                Ajouter de l'argent dans la caisse
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Apport personnel ou monnaie
              </span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('more');
              setActiveMoreSubTab('expenses');
            }}
            className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-left transition-all cursor-pointer group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-amber-700 transition-colors">
                Noter une dépense
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Facture, transport ou marchandise
              </span>
            </div>
          </button>

          <button
            onClick={() => {
              setCustomersDebtorsFilter(true);
              setActiveTab('customers');
            }}
            className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-left transition-all cursor-pointer group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-indigo-700 transition-colors">
                Enregistrer un remboursement
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Règlement de dette client
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. TOUS LES MOUVEMENTS DU JOUR (Tableau 46px § BLOC 7) */}
      {/* ========================================================================= */}
      <div id="cash-movements-section" className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Tous les mouvements ({periodMovements.length})
              </h3>
              <p className="text-xs text-slate-500">
                Chaque entrée, sortie, dépense ou commande à crédit avec son impact réel en caisse
              </p>
            </div>
          </div>

          {/* Filtre de période — répond à "qu'est-ce qu'on a gagné hier / aujourd'hui ?" */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-xs font-bold">
            {(
              [
                { id: 'TODAY' as const, label: "Aujourd'hui" },
                { id: 'YESTERDAY' as const, label: 'Hier' },
                { id: 'WEEK' as const, label: 'Cette semaine' },
                { id: 'MONTH' as const, label: 'Ce mois' },
              ]
            ).map((tab) => {
              const active = caissePeriod === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCaissePeriod(tab.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Real Table with 46px line-height */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4 sm:px-6">{isSingleDayPeriod ? 'Heure' : 'Quand'}</th>
                <th className="py-3 px-4">Ce que c'est</th>
                <th className="py-3 px-4">Par qui</th>
                <th className="py-3 px-4">Moyen</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 sm:px-6 text-center">Sens & Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {periodMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {caissePeriod === 'TODAY' && !activeCashSession
                      ? 'Ouvre ta caisse pour suivre ton argent de la journée.'
                      : `Aucun mouvement — ${periodRange.label.toLowerCase()}.`}
                  </td>
                </tr>
              ) : (
                periodMovements.map((mov) => {
                  const isCreditZero = mov.montant === 0;
                  const isEntry = mov.type === 'ENTREE';

                  return (
                    <tr key={mov.id} className="h-[46px] hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 sm:px-6 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {isSingleDayPeriod ? formatShortDate(mov.createdAt) : formatDate(mov.createdAt)}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {mov.motif || mov.origine}
                        {mov.referenceId && (
                          <span className="text-[10px] text-slate-400 font-normal ml-1.5 font-mono">
                            ({mov.referenceId})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                        {mov.userName}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {mov.methode}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-black tabular-nums text-slate-900">
                        {formatMoney(mov.montant)}
                      </td>
                      <td className="py-2.5 px-4 sm:px-6 text-center whitespace-nowrap">
                        {isCreditZero ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                            Rien reçu (Crédit)
                          </span>
                        ) : isEntry ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            + Entrée
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                            − Dépense / Sortie
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7 & 8. TES DERNIÈRES FERMETURES + CE MOIS-CI (BLOC 7) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 7. Tes dernières fermetures (6 cols) */}
        <div id="past-closures-card" className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
            Tes dernières fermetures de caisse
          </h3>
          <div className="space-y-3">
            {pastClosedSessions.map((s) => {
              const isJust = s.ecart === 0;
              return (
                <div
                  key={s.id}
                  className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-slate-900 block">
                      {formatDate(s.fermeeLe || s.ouverteLe)}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Fermée par {s.fermeePar || s.ouvertePar} · Fond de départ {formatMoney(s.fondDepart)}
                    </span>
                    {s.commentaireEcart && (
                      <span className="text-[10px] text-slate-600 italic block mt-0.5">
                        « {s.commentaireEcart} »
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <span className="text-sm font-black text-slate-900 block tabular-nums">
                      {formatMoney(s.montantCompte)}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isJust
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isJust ? 'Juste' : `${s.ecart && s.ecart > 0 ? '+' : ''}${formatMoney(s.ecart)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 8. Résumé de la période sélectionnée (6 cols) */}
        <div id="month-cash-summary-card" className="lg:col-span-6 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
              Résumé — {periodRange.label}
            </h3>
            <p className="text-xs text-slate-500">
              Calculé sur les mêmes mouvements que le tableau ci-dessus
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">Argent encaissé</span>
              <span className="text-lg font-black text-emerald-700 block">{formatMoney(periodStats.entrees)}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">Argent sorti</span>
              <span className="text-lg font-black text-amber-700 block">{formatMoney(periodStats.sorties)}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">Dépensé</span>
              <span className="text-lg font-black text-rose-700 block">{formatMoney(periodStats.depenses)}</span>
            </div>
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
              <span className="text-[11px] font-bold text-slate-500 block">Solde net de caisse</span>
              <span className="text-lg font-black text-[#4F46E5] block">{formatMoney(periodStats.solde)}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-100 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">Écart de caisse — {periodRange.label.toLowerCase()} :</span>
            <span className="font-black text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              {formatMoney(periodEcartCumule)}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODALE 1 : OUVERTURE DE CAISSE */}
      {/* ========================================================================= */}
      {isOpenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center">
                  <Unlock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">Ouvrir la caisse</h3>
              </div>
              <button
                onClick={() => setIsOpenModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOpenRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Combien mets-tu dans la caisse pour démarrer ? (Fond de départ)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={startFundAmount || ''}
                    onChange={(e) => setStartFundAmount(Number(e.target.value))}
                    placeholder="Ex: 10 000"
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-lg font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-3 text-xs font-bold text-slate-400">F</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Cette somme est ta monnaie de départ, elle n'est pas considérée comme une vente.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpenModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Confirmer l'ouverture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALE 2 : FERMETURE DE CAISSE ET COMPTAGE (BLOC 7) */}
      {/* ========================================================================= */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Fermer la caisse et compter</h3>
                  <p className="text-[11px] text-slate-500">Comptage physique des espèces</p>
                </div>
              </div>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Récapitulatif attendu */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Montant attendu en caisse :</span>
                <span className="text-base font-black text-slate-900">{formatMoney(montantAttendu)}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Compte toutes les pièces et billets actuellement présents dans ton tiroir ou ta boîte.
              </p>
            </div>

            <form onSubmit={handleCloseRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Combien as-tu compté réellement ?
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={countedAmount || ''}
                    onChange={(e) => setCountedAmount(Number(e.target.value))}
                    placeholder="Saisis le montant compté"
                    className="w-full h-14 px-4 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-2xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-4 text-sm font-bold text-slate-400">F</span>
                </div>
              </div>

              {/* Écart en temps réel */}
              {(() => {
                const ecart = countedAmount - montantAttendu;
                const isJust = ecart === 0;
                return (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-center justify-between font-bold ${
                      isJust
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : ecart < 0
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <span>Écart constaté :</span>
                    <span className="text-sm font-black">
                      {isJust ? 'Compte juste (0 F)' : `${ecart > 0 ? '+' : ''}${formatMoney(ecart)}`}
                    </span>
                  </div>
                );
              })()}

              {/* Si écart non nul: commentaire OBLIGATOIRE */}
              {countedAmount !== montantAttendu && (
                <div className="space-y-1.5 animate-in fade-in">
                  <label className="text-xs font-bold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Commentaire d'écart obligatoire :</span>
                  </label>
                  <textarea
                    rows={2}
                    value={discrepancyComment}
                    onChange={(e) => setDiscrepancyComment(e.target.value)}
                    placeholder="Ex: Erreur rendu monnaie client pressé, pourboire non noté..."
                    className="w-full p-3 rounded-xl border border-rose-300 focus:ring-1 focus:ring-rose-500 text-xs text-slate-800 outline-none"
                    required
                  ></textarea>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Valider la fermeture définitive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALE 3 : SORTIE / AJOUT DE FONDS (BLOC 7: motif obligatoire si sortie) */}
      {/* ========================================================================= */}
      {isActionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${
                    isActionModalOpen === 'WITHDRAW' ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                >
                  {isActionModalOpen === 'WITHDRAW' ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {isActionModalOpen === 'WITHDRAW' ? 'Sortir de l’argent de la caisse' : 'Ajouter de l’argent dans la caisse'}
                </h3>
              </div>
              <button
                onClick={() => setIsActionModalOpen(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleActionSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Montant</label>
                <div className="relative">
                  <input
                    type="number"
                    value={actionAmount || ''}
                    onChange={(e) => setActionAmount(Number(e.target.value))}
                    placeholder="0"
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-3.5 text-xs font-bold text-slate-400">F</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Moyen</label>
                <select
                  value={actionMethod}
                  onChange={(e) => setActionMethod(e.target.value as PaymentMethod)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                >
                  <option value="CASH">Espèces</option>
                  <option value="WAVE">Wave</option>
                  <option value="ORANGE_MONEY">Orange Money</option>
                  <option value="MTN">MTN Mobile Money</option>
                  <option value="MOOV">Moov Money</option>
                  <option value="VIREMENT">Virement</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Motif {isActionModalOpen === 'WITHDRAW' && <span className="text-rose-600">* (Obligatoire)</span>}
                </label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={
                    isActionModalOpen === 'WITHDRAW'
                      ? 'Ex: Dépannage personnel, achat petit matériel...'
                      : 'Ex: Apport personnel monnaie'
                  }
                  required={isActionModalOpen === 'WITHDRAW'}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-xs text-slate-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer ${
                    isActionModalOpen === 'WITHDRAW' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
