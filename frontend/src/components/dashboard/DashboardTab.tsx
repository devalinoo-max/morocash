import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  TrendingUp,
  AlertCircle,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Sparkles,
  Users,
  ChevronRight,
  Receipt,
  Wallet,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  Store,
  CreditCard,
  Banknote,
  Send,
} from 'lucide-react';
import { formatMoney, formatDate, getTerminology } from '../../utils/formatters';
import { getPeriodRange, getPreviousPeriodRange, isWithinRange, percentChange, SimplePeriod } from '../../utils/period';
import { PaywallOverlay } from '../common/PaywallOverlay';

const WEEKDAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const formatDayLabel = (d: Date) =>
  `${WEEKDAYS_SHORT[d.getDay()]}. ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;

const HOURLY_START = 7;
const HOURLY_END = 16;

export const DashboardTab: React.FC = () => {
  const {
    sales,
    customers,
    products,
    expenses,
    settings,
    activeCashSession,
    cashMovements,
    attemptNewSale,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    setSelectedSaleForReceipt,
    addToCart,
    updateSettings,
  } = useApp();

  const terminology = getTerminology(settings.activityType);
  const isOwner = settings.role === 'OWNER';

  // Period filter state (§ BLOC 4: 1. Filtres, synchronized with Settings)
  const [period, setPeriod] = useState<SimplePeriod>(settings.periodeParDefaut || 'TODAY');
  const [compareYesterday, setCompareYesterday] = useState<boolean>(
    settings.comparerParDefaut !== undefined ? settings.comparerParDefaut : true
  );
  const [activeHourlyTooltip, setActiveHourlyTooltip] = useState<number | null>(null);

  React.useEffect(() => {
    if (settings.periodeParDefaut) {
      setPeriod(settings.periodeParDefaut);
    }
  }, [settings.periodeParDefaut]);

  React.useEffect(() => {
    if (settings.comparerParDefaut !== undefined) {
      setCompareYesterday(settings.comparerParDefaut);
    }
  }, [settings.comparerParDefaut]);

  const isSimpleMode = (settings.dashboardMode || 'SIMPLE') === 'SIMPLE';

  // ========================================================================
  // PLAGES DE DATES — le sélecteur en haut d'écran ne changeait auparavant
  // aucun chiffre : tout était toujours calculé sur l'historique complet,
  // quel que soit le bouton actif ("Aujourd'hui" affichait en réalité tout
  // depuis le début). Tout ce qui suit est maintenant borné à la période
  // choisie, sauf les soldes qui n'ont de sens qu'à l'instant présent
  // (dettes clients, stock, caisse en cours).
  // ========================================================================
  const periodRange = useMemo(() => getPeriodRange(period), [period]);
  const previousRange = useMemo(() => getPreviousPeriodRange(period), [period]);

  const periodSales = useMemo(() => sales.filter((s) => isWithinRange(s.createdAt, periodRange)), [sales, periodRange]);
  const previousSales = useMemo(() => sales.filter((s) => isWithinRange(s.createdAt, previousRange)), [sales, previousRange]);
  const periodExpenses = useMemo(() => expenses.filter((e) => isWithinRange(e.date, periodRange)), [expenses, periodRange]);
  const previousExpenses = useMemo(() => expenses.filter((e) => isWithinRange(e.date, previousRange)), [expenses, previousRange]);

  const computeCostOfGoods = (list: typeof sales) =>
    list.reduce(
      (acc, s) =>
        acc +
        s.items.reduce((itemAcc, it) => {
          const prod = products.find((p) => p.id === it.productId);
          const unitCost = prod?.purchasePrice || it.unitPrice * 0.65;
          return itemAcc + unitCost * it.quantity;
        }, 0),
      0
    );

  // 1. Calculations according to rules in BLOC 4 & BLOC 1 — bornés à la période choisie
  const totalVendu = periodSales.reduce((acc, s) => acc + s.totalAmount, 0);
  // Solde actuel, pas un flux de la période : ce qu'un client doit ne dépend pas de la date choisie ici.
  const argentARecevoir = customers.reduce((acc, c) => acc + c.totalDebt, 0);
  const totalDepenses = periodExpenses.reduce((acc, e) => acc + e.amount, 0);
  const totalCostOfGoods = computeCostOfGoods(periodSales);

  const margeVentes = totalVendu - totalCostOfGoods;
  // What remains after purchases & daily expenses:
  const beneficeNetReel = margeVentes - totalDepenses;

  // Comparaison avec la période équivalente précédente (remplace les pourcentages
  // fixes qui s'affichaient jusqu'ici quel que soit l'état réel de la boutique).
  const previousVendu = previousSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const previousDepenses = previousExpenses.reduce((acc, e) => acc + e.amount, 0);
  const previousBenefice = previousVendu - computeCostOfGoods(previousSales) - previousDepenses;
  const beneficeDelta = beneficeNetReel - previousBenefice;
  const venduPercentChange = percentChange(totalVendu, previousVendu);
  const depensesPercentChange = percentChange(totalDepenses, previousDepenses);
  const hasAnyDataToCompare = totalVendu > 0 || previousVendu > 0 || totalDepenses > 0 || previousDepenses > 0;

  const paidSalesCount = periodSales.filter((s) => s.paymentStatus === 'PAID').length;
  const partialSalesCount = periodSales.filter((s) => s.paymentStatus === 'PARTIAL').length;
  const creditSalesCount = periodSales.filter((s) => s.paymentStatus === 'CREDIT').length;
  const merchandiseExpenses = periodExpenses
    .filter((e) => e.category === 'Achat marchandise')
    .reduce((acc, e) => acc + e.amount, 0);

  // Overdue customers & low stock alerts — soldes actuels, jamais filtrés par période
  const overdueCustomers = customers.filter((c) => c.debtAgeDays >= 30 && c.totalDebt > 0);
  const totalOverdueAmount = overdueCustomers.reduce((acc, c) => acc + c.totalDebt, 0);
  const topOverdueCustomer = [...overdueCustomers].sort((a, b) => b.totalDebt - a.totalDebt)[0] || null;
  const outOfStockProducts = products.filter((p) => !p.isService && p.stock <= 0);
  const lowStockProducts = products
    .filter((p) => !p.isService && p.stock <= p.alertThreshold)
    .sort((a, b) => a.stock / Math.max(1, a.alertThreshold) - b.stock / Math.max(1, b.alertThreshold))
    .slice(0, 3);

  // "Meilleure vente" et "produit vedette" de la période — remplace les exemples fixes
  const bestSaleOfPeriod = periodSales.length
    ? [...periodSales].sort((a, b) => b.totalAmount - a.totalAmount)[0]
    : null;
  const topProductOfPeriod = useMemo(() => {
    const qtyByProduct = new Map<string, { name: string; qty: number }>();
    periodSales.forEach((s) =>
      s.items.forEach((it) => {
        const entry = qtyByProduct.get(it.productId) || { name: it.name, qty: 0 };
        entry.qty += it.quantity;
        qtyByProduct.set(it.productId, entry);
      })
    );
    return [...qtyByProduct.values()].sort((a, b) => b.qty - a.qty)[0] || null;
  }, [periodSales]);
  const pressionFrais = totalVendu > 0 ? Math.round((totalDepenses / totalVendu) * 100) : null;

  // Graphique heure par heure : toujours "aujourd'hui vs hier", indépendant du
  // filtre ci-dessus (qui sert aux totaux) — comparer des heures n'a de sens
  // que pour une seule journée à la fois.
  const buildHourlyTotals = (range: ReturnType<typeof getPeriodRange>) => {
    const totals = Array.from({ length: HOURLY_END - HOURLY_START + 1 }, () => 0);
    sales
      .filter((s) => isWithinRange(s.createdAt, range))
      .forEach((s) => {
        const hour = new Date(s.createdAt).getHours();
        if (hour >= HOURLY_START && hour <= HOURLY_END) {
          totals[hour - HOURLY_START] += s.totalAmount;
        }
      });
    return totals;
  };
  const todayHourlyTotals = useMemo(() => buildHourlyTotals(getPeriodRange('TODAY')), [sales]);
  const yesterdayHourlyTotals = useMemo(() => buildHourlyTotals(getPeriodRange('YESTERDAY')), [sales]);
  const hasTodaySales = todayHourlyTotals.some((v) => v > 0);
  const peakHourIndex = hasTodaySales
    ? todayHourlyTotals.reduce((bestIdx, v, idx, arr) => (v > arr[bestIdx] ? idx : bestIdx), 0)
    : -1;
  const hourlyData = todayHourlyTotals.map((today, idx) => ({
    hour: `${HOURLY_START + idx}h`,
    today,
    yesterday: yesterdayHourlyTotals[idx],
    isPeak: idx === peakHourIndex,
  }));
  const maxHourlyValue = Math.max(1, ...hourlyData.map((d) => Math.max(d.today, d.yesterday)));

  // Cash register balances (§ BLOC 4: 9. Caisse du jour)
  const currentSessionMovements = activeCashSession
    ? cashMovements.filter((m) => m.cashRegisterId === activeCashSession.id)
    : cashMovements;

  const fondDepart = activeCashSession ? activeCashSession.fondDepart : 0;
  const encaisseEspeces = currentSessionMovements
    .filter((m) => m.type === 'ENTREE' && m.methode === 'CASH')
    .reduce((acc, m) => acc + m.montant, 0);
  const encaisseMobileMoney = currentSessionMovements
    .filter((m) => m.type === 'ENTREE' && m.methode !== 'CASH')
    .reduce((acc, m) => acc + m.montant, 0);
  const sortiesEspeces = currentSessionMovements
    .filter((m) => m.type === 'SORTIE')
    .reduce((acc, m) => acc + m.montant, 0);

  const soldeCaisseTheorique = fondDepart + encaisseEspeces + encaisseMobileMoney - sortiesEspeces;

  const periodWord =
    period === 'TODAY' ? "aujourd'hui" : period === 'YESTERDAY' ? 'hier' : period === 'WEEK' ? 'cette semaine' : 'ce mois';

  // Badge de comparaison du bénéfice — remplace le "21 300 F de moins qu'hier" fixe,
  // partagé entre la carte héros du mode simple et celle du mode détaillé.
  const renderBeneficeDeltaBadge = () => {
    if (!compareYesterday || !hasAnyDataToCompare) return null;
    const isUp = beneficeDelta >= 0;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
          isUp ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}
      >
        {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
        {formatMoney(Math.abs(beneficeDelta))} {isUp ? 'de plus' : 'de moins'} que {previousRange.label}
      </span>
    );
  };

  return (
    <div id="dashboard-tab-content" className="space-y-6 pb-20 max-w-[1460px] mx-auto animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. FILTRES (BLOC 4: Segment [Aujourd'hui | Cette semaine | Ce mois] + Date + Switch) */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2.5 sm:p-3.5 rounded-2xl border border-slate-200/80 shadow-xs">
        {/* Segment buttons — même vocabulaire que Caisse et Réglages > Mon affichage */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'TODAY' as const, label: "Aujourd'hui" },
              { id: 'YESTERDAY' as const, label: 'Hier' },
              { id: 'WEEK' as const, label: 'Cette semaine' },
              { id: 'MONTH' as const, label: 'Ce mois' },
            ]
          ).map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                period === p.id
                  ? 'bg-white text-[#4F46E5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date Selector & Compare Switch */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
            <Calendar className="w-3.5 h-3.5 text-[#4F46E5]" />
            <span>
              {period === 'WEEK' || period === 'MONTH'
                ? `Du ${formatDayLabel(periodRange.start)} au ${formatDayLabel(periodRange.end)}`
                : formatDayLabel(periodRange.start)}
            </span>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={compareYesterday}
              onChange={(e) => setCompareYesterday(e.target.checked)}
              className="w-4 h-4 rounded text-[#4F46E5] focus:ring-[#4F46E5] cursor-pointer"
            />
            <span>Comparer avec {previousRange.label}</span>
          </label>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODE SIMPLE VS MODE DÉTAILLÉ */}
      {/* ========================================================================= */}
      {isSimpleMode ? (
        <div className="space-y-6">
          {/* Main Hero Net Profit Card */}
          <div
            id="hero-net-profit-card-simple"
            className="bg-white rounded-3xl border border-slate-200/90 shadow-xs relative overflow-hidden flex flex-col justify-between"
          >
            <div className="p-6 sm:p-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {period === 'TODAY'
                      ? 'Ce que tu as gagné aujourd’hui'
                      : period === 'YESTERDAY'
                      ? 'Ce que tu as gagné hier'
                      : period === 'WEEK'
                      ? 'Ce que tu as gagné cette semaine'
                      : 'Ce que tu as gagné ce mois'}
                  </span>
                  {renderBeneficeDeltaBadge()}
                </div>

                {/* 54px number */}
                <div
                  className={`text-4xl sm:text-[54px] font-black tracking-tight leading-none ${
                    beneficeNetReel >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
                  }`}
                >
                  {beneficeNetReel >= 0
                    ? `+${formatMoney(beneficeNetReel)}`
                    : `-${formatMoney(Math.abs(beneficeNetReel))}`}
                </div>

                {/* Plain language explanation */}
                <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xl leading-relaxed">
                  Tu as vendu pour <strong className="text-slate-900">{formatMoney(totalVendu)}</strong>.
                  Après tes achats ({formatMoney(totalCostOfGoods)}) et tes frais ({formatMoney(totalDepenses)}), voici ton bénéfice réel.
                </p>
              </div>
            </div>

            <div
              className={`h-1.5 w-full ${
                beneficeNetReel >= 0 ? 'bg-[#059669]' : 'bg-[#DC2626]'
              }`}
            />
          </div>

          {/* 3 chiffres essentiels */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                1. Ventes totales
              </span>
              <div className="text-2xl font-black text-slate-900">
                {formatMoney(totalVendu)}
              </div>
              <p className="text-xs text-slate-400">
                {periodSales.length} vente{periodSales.length > 1 ? 's' : ''} enregistrée{periodSales.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                2. Dépenses totales
              </span>
              <div className="text-2xl font-black text-[#DC2626]">
                {formatMoney(totalDepenses)}
              </div>
              <p className="text-xs text-slate-400">
                {periodExpenses.length} dépense{periodExpenses.length > 1 ? 's' : ''} notée{periodExpenses.length > 1 ? 's' : ''}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                3. Reste à encaisser
              </span>
              <div className="text-2xl font-black text-amber-600">
                {formatMoney(argentARecevoir)}
              </div>
              <p className="text-xs text-slate-400">
                {customers.filter((c) => c.totalDebt > 0).length} clients avec crédit
              </p>
            </div>
          </div>

          {/* Actions rapides */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={attemptNewSale}
                className="px-4 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Nouvelle vente</span>
              </button>
              <button
                onClick={() => {
                  setActiveTab('more');
                  setActiveMoreSubTab('expenses');
                }}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Saisir une dépense</span>
              </button>
              <button
                onClick={() => setActiveTab('cash')}
                className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>Ma caisse</span>
              </button>
            </div>

            <button
              onClick={() => updateSettings({ dashboardMode: 'DETAILED' })}
              className="text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Afficher les graphiques et alertes (mode détaillé)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => updateSettings({ dashboardMode: 'SIMPLE' })}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer flex items-center gap-1"
            >
              <span>Basculer en vue simple (l'essentiel)</span>
            </button>
          </div>

          {/* ========================================================================= */}
          {/* 2. BANDEAU D'ALERTE ACTIONNABLE (BLOC 4: fond rouge doux, seulement si alertes) */}
          {/* ========================================================================= */}
          {(overdueCustomers.length > 0 || outOfStockProducts.length > 0) && (
        <div
          id="actionable-alert-banner"
          className="p-3.5 sm:p-4 rounded-2xl bg-[#FEF2F2] border border-[#FCA5A5] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <p className="font-extrabold text-rose-950">
                {overdueCustomers.length} clients te doivent depuis plus de 30 jours ·{' '}
                {formatMoney(totalOverdueAmount)} à récupérer · {outOfStockProducts.length} produit en rupture
              </p>
              <p className="text-[11px] text-rose-800/80 mt-0.5">
                Des actions immédiates sont requises pour préserver ta trésorerie.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setCustomersDebtorsFilter(true);
              setActiveTab('customers');
            }}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <span>M'en occuper</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. CARTE PRINCIPALE : "Ce que tu as gagné aujourd'hui" (BLOC 4) */}
      {/* Chiffre 54px VERT si positif, ROUGE avec - si négatif (JAMAIS 0 si négatif) */}
      {/* ========================================================================= */}
      <div
        id="hero-net-profit-card"
        className="bg-white rounded-3xl border border-slate-200/90 shadow-xs relative overflow-hidden flex flex-col justify-between"
      >
        <div className="p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Left side: The Big Metric */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Ce que tu as gagné {periodWord}
                </span>
                {renderBeneficeDeltaBadge()}
              </div>

              {/* 54px number: Green if positive, Red with minus sign if negative */}
              <div
                className={`text-4xl sm:text-[54px] font-black tracking-tight leading-none ${
                  beneficeNetReel >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'
                }`}
              >
                {beneficeNetReel >= 0
                  ? `+${formatMoney(beneficeNetReel)}`
                  : `-${formatMoney(Math.abs(beneficeNetReel))}`}
              </div>

              {/* Plain language explanation (§ BLOC 4 mandate) */}
              <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xl leading-relaxed">
                Tu as vendu pour <strong className="text-slate-900">{formatMoney(totalVendu)}</strong>.
                Après tes achats et tes frais, il te reste{' '}
                {beneficeNetReel >= 0 ? 'un résultat positif' : 'moins que rien'}. Marge sur les ventes{' '}
                <strong className="text-slate-900">{formatMoney(margeVentes)}</strong> − frais{' '}
                <strong className="text-slate-900">{formatMoney(totalDepenses)}</strong>.
              </p>
            </div>

            {/* Right side: 3 Detailed figures */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 shrink-0">
              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-500 block">
                  Marge sur tes ventes
                </span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 block">
                  {formatMoney(margeVentes)}
                </span>
                <span className="text-[10px] text-emerald-600 font-bold block">
                  {totalVendu > 0 ? `${Math.round((margeVentes / totalVendu) * 100)}% s/ CA` : '—'}
                </span>
              </div>
              <div className="space-y-1 border-l border-slate-200 pl-3 sm:pl-4">
                <span className="text-[11px] font-bold text-slate-500 block">
                  Frais de la période
                </span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 block">
                  {formatMoney(totalDepenses)}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">
                  {periodExpenses.length} note{periodExpenses.length > 1 ? 's' : ''} de frais
                </span>
              </div>
              <div className="space-y-1 border-l border-slate-200 pl-3 sm:pl-4">
                <span className="text-[11px] font-bold text-slate-500 block">
                  Marchandise achetée
                </span>
                <span className="text-sm sm:text-base font-extrabold text-slate-900 block">
                  {formatMoney(totalCostOfGoods)}
                </span>
                <span className="text-[10px] text-slate-400 font-medium block">
                  Coût de revient
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4px colored bottom bar (BLOC 4) */}
        <div
          className={`h-1 w-full ${
            beneficeNetReel >= 0 ? 'bg-[#059669]' : 'bg-[#DC2626]'
          }`}
        ></div>
      </div>

      {/* ========================================================================= */}
      {/* 4. QUATRE INDICATEURS EN LIGNE (BLOC 4: Indigo, Rouge, Ambre, Vert) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. TOTAL VENDU (Barre indigo) */}
        <div
          onClick={() => setActiveTab('sales')}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-indigo-300 transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
        >
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Total vendu</span>
              {venduPercentChange !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                    venduPercentChange >= 0 ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50'
                  }`}
                >
                  {venduPercentChange >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {venduPercentChange >= 0 ? '+' : ''}
                  {venduPercentChange } %
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatMoney(totalVendu)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {periodSales.length} vente{periodSales.length > 1 ? 's' : ''}
              {periodSales.length > 0 &&
                ` · ${[
                  paidSalesCount > 0 ? `${paidSalesCount} payée${paidSalesCount > 1 ? 's' : ''}` : null,
                  partialSalesCount > 0 ? `${partialSalesCount} partielle${partialSalesCount > 1 ? 's' : ''}` : null,
                  creditSalesCount > 0 ? `${creditSalesCount} à crédit` : null,
                ]
                  .filter(Boolean)
                  .join(', ')}`}
            </p>
          </div>
          <div className="h-1 w-full bg-[#4F46E5]"></div>
        </div>

        {/* 2. ARGENT À RECEVOIR (Barre rouge - hausse est ROUGE) */}
        <div
          onClick={() => {
            setCustomersDebtorsFilter(true);
            setActiveTab('customers');
          }}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-rose-300 transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
        >
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Argent à recevoir</span>
              {overdueCustomers.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[11px] font-extrabold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                  {overdueCustomers.length} en retard
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-[#DC2626] tracking-tight">
              {formatMoney(argentARecevoir)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {customers.filter((c) => c.totalDebt > 0).length} client{customers.filter((c) => c.totalDebt > 0).length > 1 ? 's' : ''} avec dette
              {overdueCustomers.length > 0 && ` · ${overdueCustomers.length} depuis plus de 30 j`}
            </p>
          </div>
          <div className="h-1 w-full bg-[#DC2626]"></div>
        </div>

        {/* 3. CE QUE TU AS DÉPENSÉ (Barre ambre - hausse est ROUGE) */}
        <div
          onClick={() => {
            setActiveTab('more');
            setActiveMoreSubTab('expenses');
          }}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-amber-300 transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
        >
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Ce que tu as dépensé</span>
              {depensesPercentChange !== null && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-extrabold px-2 py-0.5 rounded-full ${
                    depensesPercentChange > 0 ? 'text-rose-600 bg-rose-50' : 'text-emerald-600 bg-emerald-50'
                  }`}
                >
                  {depensesPercentChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {depensesPercentChange > 0 ? '+' : ''}
                  {depensesPercentChange} %
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatMoney(totalDepenses)}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              {periodExpenses.length} dépense{periodExpenses.length > 1 ? 's' : ''}
              {merchandiseExpenses > 0 && ` · dont ${formatMoney(merchandiseExpenses)} marchandise`}
            </p>
          </div>
          <div className="h-1 w-full bg-[#D97706]"></div>
        </div>

        {/* 4. ARGENT EN CAISSE (Barre verte) */}
        <div
          onClick={() => {
            setActiveTab('home');
          }}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-emerald-300 transition-all cursor-pointer overflow-hidden flex flex-col justify-between"
        >
          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Argent en caisse</span>
              <span className="text-[11px] font-bold text-slate-400">
                {activeCashSession ? 'Session active' : 'Fermée'}
              </span>
            </div>
            <div className="text-2xl font-black text-slate-900 tracking-tight">
              {formatMoney(soldeCaisseTheorique)}
            </div>
            <p className="text-xs text-slate-500 font-medium truncate">
              Espèces {formatMoney(encaisseEspeces)} · MM {formatMoney(encaisseMobileMoney)}
            </p>
          </div>
          <div className="h-1 w-full bg-[#059669]"></div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. GRAPHIQUE "TES VENTES HEURE PAR HEURE" (BLOC 4: DOUBLE BARRE) */}
      {/* Inspiré de la maquette 1: barres aujourd'hui (--indigo-600) vs hier (--indigo-50 avec bordure) */}
      {/* Vue détaillée réservée à l'abonnement actif (§ paywall) — floutée si expiré. */}
      {/* ========================================================================= */}
      <PaywallOverlay title="Débloque tes analyses détaillées" message="Le graphique heure par heure et les alertes de stock font partie de ton abonnement.">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Tes ventes heure par heure
              </h3>
              <p className="text-xs text-slate-500">
                Aujourd'hui vs hier, de 07h à 16h — toujours ces deux jours, quel que soit le filtre choisi plus haut
              </p>
            </div>

            {/* Tag / Badge: "Ta meilleure heure" & Legend */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-indigo-50 text-[#4F46E5] border border-indigo-100">
                {hasTodaySales
                  ? `Ta meilleure heure : ${hourlyData[peakHourIndex].hour} (${formatMoney(hourlyData[peakHourIndex].today)})`
                  : "Pas encore de vente aujourd'hui"}
              </span>
              <div className="hidden sm:flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#4F46E5]"></span>
                  Aujourd'hui
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-[#EEF2FF] border border-[#C7D2FE]"></span>
                  Hier
                </span>
              </div>
            </div>
          </div>

          {/* Double Bar Chart Canvas */}
          <div className="h-56 w-full flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-slate-100">
            {hourlyData.map((d, index) => {
              const todayHeight = d.today > 0 ? Math.max(12, (d.today / maxHourlyValue) * 160) : 2;
              const yesterdayHeight = d.yesterday > 0 ? Math.max(12, (d.yesterday / maxHourlyValue) * 160) : 2;
              const isHovered = activeHourlyTooltip === index;

              return (
                <div
                  key={d.hour}
                  className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
                  onMouseEnter={() => setActiveHourlyTooltip(index)}
                  onMouseLeave={() => setActiveHourlyTooltip(null)}
                >
                  {/* Tooltip on hover */}
                  {isHovered && (
                    <div className="absolute -top-12 z-20 px-2.5 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-bold shadow-lg pointer-events-none whitespace-nowrap animate-in fade-in">
                      <div>Auj : {formatMoney(d.today)}</div>
                      <div className="text-indigo-300">Hier : {formatMoney(d.yesterday)}</div>
                    </div>
                  )}

                  {/* Dual Bars Container */}
                  <div className="flex items-end justify-center gap-1 w-full max-w-[28px]">
                    {/* Yesterday Bar (lighter with border) */}
                    <div
                      style={{ height: `${yesterdayHeight}px` }}
                      className="w-1/2 rounded-t-md bg-[#EEF2FF] border border-[#C7D2FE] transition-all group-hover:bg-indigo-100"
                    ></div>

                    {/* Today Bar (Solid indigo) */}
                    <div
                      style={{ height: `${todayHeight}px` }}
                      className={`w-1/2 rounded-t-md transition-all ${
                        d.isPeak
                          ? 'bg-[#4F46E5] ring-2 ring-indigo-400 ring-offset-1'
                          : 'bg-[#4F46E5] group-hover:bg-indigo-700'
                      }`}
                    ></div>
                  </div>

                  {/* X-axis label */}
                  <span
                    className={`text-[11px] mt-2 font-medium ${
                      d.isPeak ? 'font-black text-[#4F46E5]' : 'text-slate-400'
                    }`}
                  >
                    {d.hour}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 6. "CE QUI VA MANQUER" (BLOC 4: barres de progression colorées) */}
        {/* ========================================================================= */}
        <div className="lg:col-span-4 bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Ce qui va manquer
              </h3>
              {lowStockProducts.length > 0 && (
                <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  {lowStockProducts.length} alerte{lowStockProducts.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Articles approchant de la rupture
            </p>
          </div>

          {lowStockProducts.length === 0 ? (
            <div className="my-2 p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-xs text-emerald-800 font-medium text-center">
              🎉 Aucun produit proche de la rupture pour le moment.
            </div>
          ) : (
            <div className="space-y-3.5 my-2">
              {lowStockProducts.map((p) => {
                const target = Math.max(1, p.alertThreshold);
                const ratio = Math.min(100, Math.round((p.stock / target) * 100));
                return (
                  <div key={p.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-extrabold text-slate-900 truncate">
                        {p.name}
                      </span>
                      <span
                        className={`font-black ${
                          p.stock === 0 ? 'text-[#DC2626]' : 'text-[#D97706]'
                        }`}
                      >
                        {p.stock === 0
                          ? 'Rupture (0)'
                          : `Reste ${p.stock} / ${p.alertThreshold}`}
                      </span>
                    </div>

                    {/* Progress bar (BLOC 4 mandate) */}
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          p.stock === 0 ? 'bg-[#DC2626] w-1' : 'bg-[#D97706]'
                        }`}
                        style={{ width: `${Math.max(4, ratio)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            onClick={() => setActiveTab('products')}
            className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Réapprovisionner le stock</span>
          </button>
        </div>
      </div>
      </PaywallOverlay>

      {/* ========================================================================= */}
      {/* 7. "CE QUE DISENT TES CHIFFRES" (BLOC 4: 5 phrases calculées selon règles) */}
      {/* Vue détaillée réservée à l'abonnement actif (§ paywall) — floutée si expiré. */}
      {/* ========================================================================= */}
      <PaywallOverlay title="Débloque tes analyses détaillées" message="Ces 5 indicateurs calculés font partie de ton abonnement.">
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#4F46E5]" />
          <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
            Ce que disent tes chiffres — {periodRange.label.toLowerCase()}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {/* 1. Meilleure vente */}
          <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100/80 text-xs space-y-1">
            <span className="font-extrabold text-[#4F46E5] block">🏆 Vente record de la période</span>
            <p className="text-slate-700 leading-snug">
              {bestSaleOfPeriod ? (
                <>
                  Ta meilleure vente est de <strong>{formatMoney(bestSaleOfPeriod.totalAmount)}</strong> avec{' '}
                  {bestSaleOfPeriod.customerName || 'un client de passage'} à{' '}
                  {new Date(bestSaleOfPeriod.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
                </>
              ) : (
                'Aucune vente enregistrée sur cette période pour le moment.'
              )}
            </p>
          </div>

          {/* 2. Produit star */}
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs space-y-1">
            <span className="font-extrabold text-slate-900 block">⚡ Rotation la plus rapide</span>
            <p className="text-slate-700 leading-snug">
              {topProductOfPeriod ? (
                <>
                  Le produit le plus vendu est <strong>{topProductOfPeriod.name}</strong> avec {topProductOfPeriod.qty} unité
                  {topProductOfPeriod.qty > 1 ? 's' : ''} écoulée{topProductOfPeriod.qty > 1 ? 's' : ''}.
                </>
              ) : (
                'Pas encore de vente sur cette période.'
              )}
            </p>
          </div>

          {/* 3. Dettes critiques */}
          <div className="p-3.5 rounded-2xl bg-rose-50/50 border border-rose-100 text-xs space-y-1">
            <span className="font-extrabold text-[#DC2626] block">⚠️ Argent bloqué</span>
            <p className="text-slate-700 leading-snug">
              {totalOverdueAmount > 0 ? (
                <>
                  Tu as <strong>{formatMoney(totalOverdueAmount)}</strong> en attente chez {overdueCustomers.length} client
                  {overdueCustomers.length > 1 ? 's' : ''} depuis plus de 30 jours.
                </>
              ) : (
                'Aucune dette de plus de 30 jours en ce moment. 👍'
              )}
            </p>
          </div>

          {/* 4. Ratio dépenses/ventes */}
          <div className="p-3.5 rounded-2xl bg-amber-50/50 border border-amber-100 text-xs space-y-1">
            <span className="font-extrabold text-[#D97706] block">📊 Pression des frais</span>
            <p className="text-slate-700 leading-snug">
              {pressionFrais !== null ? (
                <>
                  Tes dépenses de la période représentent <strong>{pressionFrais} %</strong> de tes encaissements bruts.
                </>
              ) : (
                'Pas encore de vente sur cette période pour calculer ce ratio.'
              )}
            </p>
          </div>

          {/* 5. Conseil pratique d'action */}
          <div
            onClick={
              topOverdueCustomer
                ? () => {
                    setCustomersDebtorsFilter(true);
                    setActiveTab('customers');
                  }
                : undefined
            }
            className={`p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 text-xs space-y-1 md:col-span-2 ${
              topOverdueCustomer ? 'cursor-pointer hover:bg-emerald-50 transition-colors' : ''
            }`}
          >
            <span className="font-extrabold text-[#059669] block">💡 Conseil d'action immédiat</span>
            <p className="text-slate-700 leading-snug">
              {topOverdueCustomer ? (
                <>
                  Relance <strong>{topOverdueCustomer.name}</strong> pour récupérer ses {formatMoney(topOverdueCustomer.totalDebt)} de
                  reliquat.
                </>
              ) : (
                "Rien à relancer aujourd'hui : aucun client en retard de plus de 30 jours."
              )}
            </p>
          </div>
        </div>
      </div>
      </PaywallOverlay>

      {/* ========================================================================= */}
      {/* 8. "TES DERNIÈRES VENTES" (BLOC 4: VRAI TABLEAU SUR ORDINATEUR) */}
      {/* Colonnes: Heure, Client (avatar initiales), Vendu par, Articles, Total, Reste, Statut */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
              Tes dernières ventes
            </h3>
            <p className="text-xs text-slate-500">
              Flux des encaissements en temps réel
            </p>
          </div>
          <button
            onClick={() => setActiveTab('sales')}
            className="text-xs font-extrabold text-[#4F46E5] hover:underline cursor-pointer"
          >
            Voir tout l'historique ({sales.length}) →
          </button>
        </div>

        {/* Real Table on Desktop (BLOC 3 & BLOC 4 mandate) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="py-3 px-4">Heure</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Vendu par</th>
                <th className="py-3 px-4">Articles</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Reste</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-center">Reçu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sales.slice(0, 5).map((sale) => {
                const clientInitials = sale.customerName
                  ? sale.customerName
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : 'C';

                return (
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedSaleForReceipt(sale)}
                    className="h-[46px] hover:bg-slate-50/80 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-semibold text-slate-600 whitespace-nowrap">
                      {new Date(sale.createdAt).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                          {clientInitials}
                        </div>
                        <span className="font-extrabold text-slate-900">
                          {sale.customerName || 'Client de passage'}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                      {sale.sellerName}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 max-w-[200px] truncate">
                      {sale.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                    </td>
                    <td className="py-2.5 px-4 text-right font-black text-slate-900 whitespace-nowrap">
                      {formatMoney(sale.totalAmount)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-500 whitespace-nowrap">
                      {sale.remainingAmount > 0 ? (
                        <span className="text-[#DC2626] font-black">
                          {formatMoney(sale.remainingAmount)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          sale.paymentStatus === 'PAID'
                            ? 'bg-[#ECFDF5] text-[#059669]'
                            : sale.paymentStatus === 'PARTIAL'
                            ? 'bg-[#FFFBEB] text-[#D97706]'
                            : 'bg-[#FEF2F2] text-[#DC2626]'
                        }`}
                      >
                        {sale.paymentStatus === 'PAID'
                          ? 'Payée'
                          : sale.paymentStatus === 'PARTIAL'
                          ? 'Partielle'
                          : 'À crédit'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSaleForReceipt(sale);
                        }}
                        className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-[#4F46E5] font-bold text-[10px] transition-colors"
                      >
                        Voir reçu
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 9. "CAISSE DU JOUR" (BLOC 4: Fond départ, Espèces, MM, Sorties, Ce que tu dois avoir) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                Caisse du jour
              </h3>
              {activeCashSession ? (
                <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Session ouverte ({new Date(activeCashSession.ouverteLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                  Caisse fermée
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Contrôle, encaissements et réconciliation des espèces physiques
            </p>
          </div>

          <button
            onClick={() => setActiveTab('cash')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs transition-all cursor-pointer self-start sm:self-auto flex items-center gap-1.5"
          >
            <span>{activeCashSession ? 'Gérer & Clôturer la caisse' : 'Ouvrir la caisse'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Breakdown row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 block">Fond de départ</span>
            <span className="text-sm font-black text-slate-900 block">
              {formatMoney(fondDepart)}
            </span>
            <span className="text-[10px] text-slate-400 block">Ouverture caisse</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/40 border border-emerald-100 space-y-1">
            <span className="text-[11px] font-bold text-emerald-700 block">+ Espèces encaissées</span>
            <span className="text-sm font-black text-[#059669] block">
              +{formatMoney(encaisseEspeces)}
            </span>
            <span className="text-[10px] text-slate-400 block">Tiroir-caisse</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-indigo-50/40 border border-indigo-100 space-y-1">
            <span className="text-[11px] font-bold text-indigo-700 block">+ Mobile Money</span>
            <span className="text-sm font-black text-[#4F46E5] block">
              +{formatMoney(encaisseMobileMoney)}
            </span>
            <span className="text-[10px] text-slate-400 block">Wave & OM</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-rose-50/40 border border-rose-100 space-y-1">
            <span className="text-[11px] font-bold text-rose-700 block">- Sorties d'espèces</span>
            <span className="text-sm font-black text-[#DC2626] block">
              -{formatMoney(sortiesEspeces)}
            </span>
            <span className="text-[10px] text-slate-400 block">Achats & frais</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-1 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-slate-300 block">Ce que tu dois avoir</span>
            <span className="text-base font-black text-emerald-400 block">
              {formatMoney(soldeCaisseTheorique)}
            </span>
            <span className="text-[10px] text-slate-400 block">Espèces physiques</span>
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
