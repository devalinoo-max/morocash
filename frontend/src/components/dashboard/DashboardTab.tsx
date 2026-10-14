import React, { useState, useMemo, lazy, Suspense } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { useActivity } from '../../hooks/useActivity';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Sparkles,
  ChevronRight,
  Wallet,
  CheckCircle2,
  ArrowRight,
  Package,
} from 'lucide-react';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import {
  CountUp,
  EmptyState,
  KpiCard,
  MC_EASE,
  PASTILLES_STATUT,
  Segmented,
  TrialPill,
  staggerChild,
  staggerParent,
} from '../sales/SalesKit';

// recharts ne sert qu'au graphique horaire du mode détaillé : chargé à part.
const HourlyChart = lazy(() => import('./HourlyChart'));
import { formatMoney, formatMoneyCompact, formatDate, formatPaymentMethod, getTerminology } from '../../utils/formatters';
import type { CashMovement, Expense, Sale } from '../../types';
import { DashboardDetailSheet, type DashboardDetail, type DetailRow } from './DashboardDetailSheet';
import { CustomerDetailPanel } from '../customers/CustomerDetailPanel';
import {
  getCustomRange,
  getPeriodRange,
  getPreviousCustomRange,
  getPreviousPeriodRange,
  isWithinRange,
  percentChange,
  SimplePeriod,
  toDateInputValue,
} from '../../utils/period';
import { DateRangeInputs, DATE_RANGE_LABEL } from '../common/DateRangeInputs';

/** Les quatre raccourcis, plus une plage choisie à la main (date de début → date de fin). */
type DashboardPeriod = SimplePeriod | 'RANGE';
import { PaywallOverlay } from '../common/PaywallOverlay';
import { saleStatusStyle } from '../../utils/saleStatus';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';

const WEEKDAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const formatDayLabel = (d: Date) =>
  `${WEEKDAYS_SHORT[d.getDay()]}. ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;

type DetailKind = 'VENDU' | 'DEPENSES' | 'GAGNE' | 'RECEVOIR' | 'CAISSE' | 'ANNULEES' | 'ANNULEES_TOUT';

const CASH_ORIGIN_LABEL: Record<CashMovement['origine'], string> = {
  COMMANDE: 'Vente encaissée',
  REMBOURSEMENT: 'Remboursement de dette',
  DEPENSE: 'Dépense',
  APPORT: 'Argent ajouté',
  RETRAIT: 'Argent sorti',
};

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
    isWriteLocked,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    setSelectedSaleForReceipt,
    addToCart,
    updateSettings,
    setIsNewProductOpen,
  } = useApp();

  const terminology = getTerminology(settings.activityType);
  const isOwner = settings.role === 'OWNER';

  // Period filter state (§ BLOC 4: 1. Filtres, synchronized with Settings)
  const [period, setPeriod] = useState<DashboardPeriod>(settings.periodeParDefaut || 'TODAY');
  // Plage libre : par défaut, du 1er du mois à aujourd'hui.
  const [rangeStart, setRangeStart] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toDateInputValue(new Date()));
  const [compareYesterday, setCompareYesterday] = useState<boolean>(
    settings.comparerParDefaut !== undefined ? settings.comparerParDefaut : true
  );

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
  const customRange = useMemo(() => getCustomRange(rangeStart, rangeEnd), [rangeStart, rangeEnd]);
  const periodRange = useMemo(
    () => (period === 'RANGE' && customRange ? customRange : getPeriodRange(period === 'RANGE' ? 'TODAY' : period)),
    [period, customRange]
  );
  const previousRange = useMemo(
    () =>
      period === 'RANGE' && customRange
        ? getPreviousCustomRange(customRange)
        : getPreviousPeriodRange(period === 'RANGE' ? 'TODAY' : period),
    [period, customRange]
  );

  // Une commande annulée reste dans l'historique (« Dernières ventes ») mais
  // ne compte dans aucun chiffre : ventes, bénéfice, graphique horaire.
  const validSales = useMemo(() => sales.filter((s) => !s.isCancelled), [sales]);
  const periodSales = useMemo(() => validSales.filter((s) => isWithinRange(s.createdAt, periodRange)), [validSales, periodRange]);
  const previousSales = useMemo(() => validSales.filter((s) => isWithinRange(s.createdAt, previousRange)), [validSales, previousRange]);
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
  // « Total vendu » affiché = somme des paiements reçus sur la période,
  // calculée par le serveur : le même chiffre que la page Commandes et que les
  // entrées de la caisse. `totalVendu` ci-dessus (montant des commandes) ne
  // sert plus qu'au calcul inchangé de « Ce que tu as gagné ».
  const { activity } = useActivity(periodRange.start, periodRange.end);
  const { activity: previousActivity } = useActivity(previousRange.start, previousRange.end);
  const totalVenduServeur = activity ? activity.totalVendu : null;
  const venduPercentChange =
    activity && previousActivity ? percentChange(activity.totalVendu, previousActivity.totalVendu) : null;
  const ventesDuJourLabel = activity
    ? `${activity.nbCommandes} commande${activity.nbCommandes > 1 ? 's' : ''} · ${activity.nbVersements} versement${activity.nbVersements > 1 ? 's' : ''}`
    : 'Lecture du serveur…';
  // Un tap sur la carte ouvre la liste du jour, là où chaque paiement est visible.
  const ouvrirListeDuJour = () => {
    setDetailKind(null);
    setActiveTab('sales');
  };
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
    validSales
      .filter((s) => isWithinRange(s.createdAt, range))
      .forEach((s) => {
        const hour = new Date(s.createdAt).getHours();
        if (hour >= HOURLY_START && hour <= HOURLY_END) {
          totals[hour - HOURLY_START] += s.totalAmount;
        }
      });
    return totals;
  };
  const todayHourlyTotals = useMemo(() => buildHourlyTotals(getPeriodRange('TODAY')), [validSales]);
  const yesterdayHourlyTotals = useMemo(() => buildHourlyTotals(getPeriodRange('YESTERDAY')), [validSales]);
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
    period === 'TODAY'
      ? "aujourd'hui"
      : period === 'YESTERDAY'
      ? 'hier'
      : period === 'WEEK'
      ? 'cette semaine'
      : period === 'MONTH'
      ? 'ce mois'
      : 'sur cette période';

  // ========================================================================
  // DÉTAIL DES CARTES — chaque chiffre de l'Accueil s'ouvre sur les lignes
  // qui le composent (voir DashboardDetailSheet).
  // ========================================================================
  const [detailKind, setDetailKind] = useState<DetailKind | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null);
  const detailCustomer = customers.find((c) => c.id === detailCustomerId) ?? null;

  // Une vente annulée est rangée dans la période où elle a été faite : c'est
  // de ce total-là qu'elle a été retirée.
  const cancelledPeriodSales = useMemo(
    () => sales.filter((s) => s.isCancelled && isWithinRange(s.createdAt, periodRange)),
    [sales, periodRange]
  );
  const cancelledPeriodTotal = cancelledPeriodSales.reduce((acc, s) => acc + s.totalAmount, 0);

  const openReceipt = (sale: Sale) => {
    setDetailKind(null);
    setSelectedSaleForReceipt(sale);
  };

  const saleRow = (sale: Sale): DetailRow => {
    const statut = saleStatusStyle(sale);
    return {
      id: sale.id,
      date: sale.createdAt,
      title: sale.customerName?.trim() || 'Client de passage',
      subtitle: sale.reference,
      note: sale.isCancelled && sale.cancelReason ? `Motif : ${sale.cancelReason}` : undefined,
      amount: sale.totalAmount,
      tone: sale.isCancelled ? 'muted' : 'default',
      badge: { label: statut.label, bg: statut.bg, fg: statut.fg },
      onClick: () => openReceipt(sale),
    };
  };

  const expenseRow = (e: Expense): DetailRow => ({
    id: e.id,
    date: e.date,
    title: e.category,
    subtitle: e.paymentMethod ? formatPaymentMethod(e.paymentMethod) : undefined,
    note: e.note,
    amount: e.amount,
    tone: 'negative',
  });

  const byDateDesc = (a: DetailRow, b: DetailRow) => new Date(b.date).getTime() - new Date(a.date).getTime();
  const periodLabel = periodRange.label;

  const buildDetail = (kind: DetailKind): DashboardDetail => {
    switch (kind) {
      case 'VENDU':
        return {
          title: 'Total vendu',
          subtitle: `${periodLabel} · ventes annulées non comptées`,
          total: { label: 'Total vendu', value: totalVenduServeur ?? 0 },
          rowsTitle: 'Ventes',
          rows: periodSales.map(saleRow).sort(byDateDesc),
          emptyText: 'Aucune vente sur cette période.',
          footer: { label: 'Voir toutes les commandes', onClick: () => { setDetailKind(null); setActiveTab('sales'); } },
        };
      case 'DEPENSES':
        return {
          title: 'Ce que tu as dépensé',
          subtitle: periodLabel,
          total: { label: 'Total des dépenses', value: totalDepenses, tone: 'negative' },
          rowsTitle: 'Dépenses',
          rows: periodExpenses.map(expenseRow).sort(byDateDesc),
          emptyText: 'Aucune dépense notée sur cette période.',
          footer: {
            label: 'Ouvrir mes dépenses',
            onClick: () => {
              setDetailKind(null);
              setActiveTab('more');
              setActiveMoreSubTab('expenses');
            },
          },
        };
      case 'GAGNE':
        return {
          title: `Ce que tu as gagné ${periodWord}`,
          subtitle: 'Ventes − coût de la marchandise vendue − frais',
          summary: [
            { label: 'Ventes', value: totalVendu },
            { label: 'Coût de la marchandise vendue', value: totalCostOfGoods, sign: '-' },
            { label: 'Frais', value: totalDepenses, sign: '-' },
          ],
          total: {
            label: 'Ce que tu as gagné',
            value: beneficeNetReel,
            tone: beneficeNetReel >= 0 ? 'positive' : 'negative',
          },
          rowsTitle: 'Ventes et dépenses',
          rows: [...periodSales.map(saleRow), ...periodExpenses.map(expenseRow)].sort(byDateDesc),
          emptyText: 'Aucune vente ni dépense sur cette période.',
        };
      case 'RECEVOIR':
        return {
          title: 'Argent à recevoir',
          subtitle: "Ce que tes clients te doivent aujourd'hui, toutes périodes confondues",
          total: { label: 'Total dû', value: argentARecevoir, tone: 'negative' },
          rowsTitle: 'Clients',
          rows: customers
            .filter((c) => c.totalDebt > 0)
            .sort((a, b) => b.totalDebt - a.totalDebt)
            .map((c) => ({
              id: c.id,
              date: c.lastActivity,
              title: c.name,
              subtitle: `dette depuis ${c.debtAgeDays} j`,
              amount: c.totalDebt,
              tone: 'negative' as const,
              onClick: () => {
                setDetailKind(null);
                setDetailCustomerId(c.id);
              },
            })),
          emptyText: 'Aucun client ne te doit d’argent.',
          footer: {
            label: 'Ouvrir la liste des clients',
            onClick: () => {
              setDetailKind(null);
              setCustomersDebtorsFilter(true);
              setActiveTab('customers');
            },
          },
        };
      case 'CAISSE':
        return {
          title: 'Argent en caisse',
          subtitle: activeCashSession ? 'Caisse ouverte en ce moment' : 'Caisse fermée',
          summary: [
            { label: 'Fond de départ', value: fondDepart },
            { label: 'Entrées en espèces', value: encaisseEspeces },
            { label: 'Entrées en mobile money', value: encaisseMobileMoney },
            { label: 'Sorties', value: sortiesEspeces, sign: '-' },
          ],
          total: { label: 'Ce que tu dois avoir', value: soldeCaisseTheorique },
          rowsTitle: 'Mouvements',
          rows: currentSessionMovements
            .map((m) => ({
              id: m.id,
              date: m.createdAt,
              title: CASH_ORIGIN_LABEL[m.origine],
              subtitle: formatPaymentMethod(m.methode),
              note: m.motif,
              amount: m.montant,
              tone: m.type === 'SORTIE' ? ('negative' as const) : ('positive' as const),
            }))
            .sort(byDateDesc),
          emptyText: 'Aucun mouvement de caisse.',
          footer: { label: 'Ouvrir ma caisse', onClick: () => { setDetailKind(null); setActiveTab('cash'); } },
        };
      case 'ANNULEES':
        return {
          title: 'Ventes annulées',
          subtitle: `${periodLabel} · retirées de tous les chiffres`,
          total: { label: 'Montant annulé', value: cancelledPeriodTotal },
          rowsTitle: 'Ventes annulées',
          rows: cancelledPeriodSales.map(saleRow).sort(byDateDesc),
          emptyText: 'Aucune vente annulée sur cette période.',
          footer: { label: 'Voir toutes les ventes annulées', onClick: () => setDetailKind('ANNULEES_TOUT') },
        };
      case 'ANNULEES_TOUT': {
        const all = sales.filter((s) => s.isCancelled);
        return {
          title: 'Toutes les ventes annulées',
          subtitle: 'Depuis le début',
          total: { label: 'Montant annulé', value: all.reduce((acc, s) => acc + s.totalAmount, 0) },
          rowsTitle: 'Ventes annulées',
          rows: all.map(saleRow).sort(byDateDesc),
          emptyText: 'Aucune vente annulée.',
        };
      }
    }
  };

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

  const prenom = settings.ownerName?.trim().split(/\s+/)[0] || '';
  const nbDebiteurs = customers.filter((c) => c.totalDebt > 0).length;
  const dernieresVentes = sales.slice(0, 5);

  // Carte vedette, commune aux deux modes. Sur le dégradé, le vert et le rouge
  // sont éclaircis pour rester lisibles : positif = vert, négatif = rouge avec « - ».
  const renderHero = (detaille: boolean) => (
    <motion.div
      id={detaille ? 'hero-net-profit-card' : 'hero-net-profit-card-simple'}
      variants={staggerChild}
      role="button"
      tabIndex={0}
      onClick={() => setDetailKind('GAGNE')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDetailKind('GAGNE');
        }
      }}
      className="mc-lift mc-gradient text-white rounded-mc shadow-mc-card p-5 md:px-8 md:py-5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-3 md:space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-semibold text-white/80">Ce que tu as gagné {periodWord}</span>
            {renderBeneficeDeltaBadge()}
          </div>

          <div
            className={`text-[36px] md:text-[40px] font-extrabold tracking-tight leading-none tabular-nums whitespace-nowrap ${
              beneficeNetReel >= 0 ? 'text-[#86EFAC]' : 'text-[#FCA5A5]'
            }`}
          >
            <CountUp
              value={Math.abs(beneficeNetReel)}
              format={(n) => `${beneficeNetReel >= 0 ? '+' : '-'}${formatMoney(n)}`}
            />
          </div>

          <p className={`text-[14px] text-white/80 leading-relaxed ${detaille ? 'max-w-xl' : 'max-w-4xl'}`}>
            Tu as vendu pour <strong className="text-white">{formatMoney(totalVendu)}</strong>. Après tes
            achats ({formatMoney(totalCostOfGoods)}) et tes frais ({formatMoney(totalDepenses)}),{' '}
            {beneficeNetReel >= 0 ? 'voici ton bénéfice réel.' : 'il te reste moins que rien.'}
          </p>
        </div>

        {detaille && (
          /* Téléphone : trois lignes, libellé à gauche et montant à droite —
             trois colonnes de 90 px coupaient les libellés. Ordinateur : trois colonnes. */
          <div className="bg-white/10 px-4 py-1 lg:py-4 rounded-2xl lg:shrink-0 divide-y lg:divide-y-0 lg:divide-x divide-white/20 lg:grid lg:grid-cols-3">
            {[
              {
                libelle: 'Marge sur tes ventes',
                montant: margeVentes,
                note: totalVendu > 0 ? `${Math.round((margeVentes / totalVendu) * 100)}% s/ CA` : '—',
                noteClasse: 'text-[#86EFAC] font-bold',
              },
              {
                libelle: 'Frais de la période',
                montant: totalDepenses,
                note: `${periodExpenses.length} note${periodExpenses.length > 1 ? 's' : ''} de frais`,
                noteClasse: 'text-white/60',
              },
              {
                libelle: 'Marchandise achetée',
                montant: totalCostOfGoods,
                note: 'Coût de revient',
                noteClasse: 'text-white/60',
              },
            ].map((ligne) => (
              <div
                key={ligne.libelle}
                className="flex lg:block items-center justify-between gap-3 py-3 lg:py-0 lg:px-4 lg:first:pl-0 lg:last:pr-0 lg:space-y-1 min-w-0"
              >
                <span className="text-[12px] font-semibold text-white/70 block">{ligne.libelle}</span>
                <span className="text-right lg:text-left shrink-0">
                  <span className="text-[16px] font-extrabold block tabular-nums whitespace-nowrap">
                    {formatMoney(ligne.montant)}
                  </span>
                  <span className={`text-[12px] block ${ligne.noteClasse}`}>{ligne.note}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <div id="dashboard-tab-content" className="font-jakarta text-mc-ink pb-20 max-w-[1460px] mx-auto">
      <MotionConfig reducedMotion="user">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: MC_EASE }}
          className="space-y-4 md:space-y-6"
        >
          {/* ================================================================
              EN-TÊTE — bonjour, date, pastille d'essai, nouvelle commande
              ================================================================ */}
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h1 className="text-[20px] md:text-[28px] font-extrabold tracking-tight leading-tight">
                  Bonjour{prenom ? ` ${prenom}` : ''}
                </h1>
                <TrialPill />
              </div>
              <p className="text-[14px] text-mc-soft">
                {period === 'WEEK' || period === 'MONTH' || period === 'RANGE'
                  ? `Du ${formatDayLabel(periodRange.start)} au ${formatDayLabel(periodRange.end)}`
                  : formatDayLabel(periodRange.start)}
              </p>
            </div>
            <button
              id="btn-home-new-order"
              type="button"
              onClick={attemptNewSale}
              className={`hidden md:inline-flex h-10 px-4 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-[14px] font-bold items-center gap-1.5 shadow-mc-card cursor-pointer transition-all duration-200 active:scale-[0.97] ${
                isWriteLocked ? LOCKED_BTN_CLASS : ''
              }`}
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Nouvelle commande</span>
            </button>
          </header>

          {/* Premiers pas : la carte « premier produit » seule laissait le
              commerçant devant un tableau de bord vide dès le produit créé, sans
              rien indiquer ensuite. La liste se retire d'elle-même une fois les
              trois étapes faites — c'est une invitation, jamais un blocage. */}
          <StartupChecklist
            hasProduct={products.length > 0}
            hasSale={sales.length > 0}
            hasCustomer={customers.length > 0}
            isServices={settings.activityType === 'SERVICES'}
            onAddProduct={() => {
              setActiveTab('products');
              setIsNewProductOpen(true);
            }}
            onNewSale={() => attemptNewSale()}
            onAddCustomer={() => setActiveTab('customers')}
          />

          {/* ================================================================
              FILTRES — période segmentée, plage libre, comparaison
              ================================================================ */}
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <Segmented<DashboardPeriod>
              id="btn-home-period"
              label="Période"
              value={period}
              onChange={setPeriod}
              options={
                [
                  { id: 'TODAY', label: "Aujourd'hui" },
                  { id: 'YESTERDAY', label: 'Hier' },
                  { id: 'WEEK', label: 'Cette semaine' },
                  { id: 'MONTH', label: 'Ce mois' },
                  { id: 'RANGE', label: DATE_RANGE_LABEL },
                ] as const
              }
            />

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {period === 'RANGE' && (
                <DateRangeInputs
                  id="dashboard-range"
                  start={rangeStart}
                  end={rangeEnd}
                  onStartChange={setRangeStart}
                  onEndChange={setRangeEnd}
                />
              )}
              <label className="flex items-center gap-2 text-[14px] font-medium text-mc-soft cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={compareYesterday}
                  onChange={(e) => setCompareYesterday(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#5B4BF0] cursor-pointer"
                />
                <span>Comparer avec {previousRange.label}</span>
              </label>
            </div>
          </div>

          {/* ================================================================
              MODE SIMPLE VS MODE DÉTAILLÉ
              ================================================================ */}
          {isSimpleMode ? (
            <motion.div variants={staggerParent} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
              {renderHero(false)}

              {/* Les chiffres essentiels */}
              <motion.div variants={staggerParent} className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
                <KpiCard
                  label="Total vendu"
                  value={totalVenduServeur}
                  format={formatMoneyCompact}
                  hint={ventesDuJourLabel}
                  onOpen={ouvrirListeDuJour}
                  openLabel="Voir les commandes"
                />
                <KpiCard
                  label="Dépenses totales"
                  value={totalDepenses}
                  format={formatMoneyCompact}
                  tone="danger"
                  hint={`${periodExpenses.length} dépense${periodExpenses.length > 1 ? 's' : ''} notée${periodExpenses.length > 1 ? 's' : ''}`}
                  onOpen={() => setDetailKind('DEPENSES')}
                  openLabel="Voir le détail des dépenses"
                />
                <KpiCard
                  label="Reste à encaisser"
                  value={argentARecevoir}
                  format={formatMoneyCompact}
                  tone="warning"
                  hint={`${nbDebiteurs} client${nbDebiteurs > 1 ? 's' : ''} avec crédit`}
                  onOpen={() => setDetailKind('RECEVOIR')}
                  openLabel="Voir qui me doit"
                />
                <KpiCard
                  label="Ventes annulées"
                  value={cancelledPeriodTotal}
                  format={formatMoneyCompact}
                  tone="muted"
                  hint={`${cancelledPeriodSales.length} vente${cancelledPeriodSales.length > 1 ? 's' : ''} annulée${cancelledPeriodSales.length > 1 ? 's' : ''}`}
                  onOpen={() => setDetailKind('ANNULEES')}
                  openLabel="Voir les ventes annulées"
                />
              </motion.div>

              {/* Actions rapides */}
              <motion.div
                variants={staggerChild}
                className="p-4 rounded-mc bg-white border border-mc-line shadow-mc-card flex flex-wrap items-center justify-between gap-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={attemptNewSale}
                    className={`h-10 px-4 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white font-bold text-[14px] flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nouvelle vente</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('more');
                      setActiveMoreSubTab('expenses');
                    }}
                    className="h-10 px-4 rounded-full bg-white hover:border-mc-primary hover:text-mc-primary text-mc-ink border border-mc-line font-semibold text-[14px] flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.97]"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Saisir une dépense</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('cash')}
                    className="h-10 px-4 rounded-full bg-white hover:border-mc-primary hover:text-mc-primary text-mc-ink border border-mc-line font-semibold text-[14px] flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.97]"
                  >
                    <Wallet className="w-4 h-4 text-mc-success" />
                    <span>Ma caisse</span>
                  </button>
                </div>

                <button
                  onClick={() => updateSettings({ dashboardMode: 'DETAILED' })}
                  className="text-[14px] font-bold text-mc-primary hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>Afficher les graphiques et alertes (mode détaillé)</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div variants={staggerParent} initial="hidden" animate="show" className="space-y-4 md:space-y-6">
              <div className="flex justify-start md:justify-end">
                <button
                  onClick={() => updateSettings({ dashboardMode: 'SIMPLE' })}
                  className="min-h-[36px] text-[14px] md:text-[12px] font-bold text-mc-primary md:text-mc-soft hover:text-mc-ink cursor-pointer text-left"
                >
                  Basculer en vue simple (l'essentiel)
                </button>
              </div>

              {/* ============================================================
                  À FAIRE — les alertes qui demandent un geste, une ligne chacune
                  ============================================================ */}
              {(overdueCustomers.length > 0 || outOfStockProducts.length > 0) && (
                <motion.section
                  id="actionable-alert-banner"
                  variants={staggerChild}
                  className="rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <h2 className="text-[16px] font-bold">À faire</h2>
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-mc-danger text-white text-[12px] font-bold flex items-center justify-center tabular-nums">
                      {(overdueCustomers.length > 0 ? 1 : 0) + (outOfStockProducts.length > 0 ? 1 : 0)}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {overdueCustomers.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setCustomersDebtorsFilter(true);
                          setActiveTab('customers');
                        }}
                        className="mc-lift w-full flex items-center gap-3 p-3 rounded-2xl bg-mc-danger-bg text-left cursor-pointer"
                      >
                        <span className="w-10 h-10 rounded-full bg-white text-[#DC2626] flex items-center justify-center shrink-0">
                          <Clock className="w-5 h-5" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-bold text-mc-ink">
                            {overdueCustomers.length} client{overdueCustomers.length > 1 ? 's te doivent' : ' te doit'} depuis
                            plus de 30 jours
                          </span>
                          <span className="block text-[12px] text-[#B91C1C] font-semibold tabular-nums">
                            {formatMoney(totalOverdueAmount)} à récupérer
                          </span>
                        </span>
                        <span className="shrink-0 hidden sm:inline-flex items-center gap-1 h-8 px-3 rounded-full bg-[#DC2626] text-white text-[12px] font-bold">
                          M'en occuper
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                        <ChevronRight className="sm:hidden w-5 h-5 text-[#DC2626] shrink-0" />
                      </button>
                    )}
                    {outOfStockProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('products')}
                        className="mc-lift w-full flex items-center gap-3 p-3 rounded-2xl bg-mc-warning-bg text-left cursor-pointer"
                      >
                        <span className="w-10 h-10 rounded-full bg-white text-[#B45309] flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-bold text-mc-ink">
                            {outOfStockProducts.length} produit{outOfStockProducts.length > 1 ? 's' : ''} en rupture
                          </span>
                          <span className="block text-[12px] text-[#92400E] font-semibold truncate">
                            {outOfStockProducts
                              .slice(0, 3)
                              .map((p) => p.name)
                              .join(', ')}
                            {outOfStockProducts.length > 3 ? '…' : ''}
                          </span>
                        </span>
                        <ChevronRight className="w-5 h-5 text-[#B45309] shrink-0" />
                      </button>
                    )}
                  </div>
                </motion.section>
              )}

              {/* Chiffre : vert si positif, rouge avec « - » si négatif (jamais 0 si négatif) */}
              {renderHero(true)}

              {/* ============================================================
                  LES CINQ INDICATEURS
                  ============================================================ */}
              <motion.div
                variants={staggerParent}
                className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4"
              >
                <KpiCard
                  label="Total vendu"
                  value={totalVenduServeur}
                  format={formatMoneyCompact}
                  variation={venduPercentChange}
                  hint={`${ventesDuJourLabel}${
                    periodSales.length > 0
                      ? ` · ${[
                          paidSalesCount > 0 ? `${paidSalesCount} payée${paidSalesCount > 1 ? 's' : ''}` : null,
                          partialSalesCount > 0 ? `${partialSalesCount} partielle${partialSalesCount > 1 ? 's' : ''}` : null,
                          creditSalesCount > 0 ? `${creditSalesCount} à crédit` : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}`
                      : ''
                  }`}
                  onOpen={ouvrirListeDuJour}
                  openLabel="Voir les commandes"
                />
                <KpiCard
                  label="Argent à recevoir"
                  value={argentARecevoir}
                  format={formatMoneyCompact}
                  tone="danger"
                  badge={
                    overdueCustomers.length > 0 ? (
                      <span className="px-2 py-0.5 rounded-full bg-mc-danger-bg text-[#DC2626] text-[12px] font-bold">
                        {overdueCustomers.length} en retard
                      </span>
                    ) : undefined
                  }
                  hint={`${nbDebiteurs} client${nbDebiteurs > 1 ? 's' : ''} avec dette`}
                  onOpen={() => setDetailKind('RECEVOIR')}
                  openLabel="Voir qui me doit"
                />
                <KpiCard
                  label="Ce que tu as dépensé"
                  value={totalDepenses}
                  format={formatMoneyCompact}
                  variation={depensesPercentChange}
                  variationGoodWhen="down"
                  hint={`${periodExpenses.length} dépense${periodExpenses.length > 1 ? 's' : ''}${
                    merchandiseExpenses > 0 ? ` · dont ${formatMoney(merchandiseExpenses)} marchandise` : ''
                  }`}
                  onOpen={() => setDetailKind('DEPENSES')}
                  openLabel="Voir le détail des dépenses"
                />
                <KpiCard
                  label="Argent en caisse"
                  value={soldeCaisseTheorique}
                  format={formatMoneyCompact}
                  badge={
                    <span
                      className={`px-2 py-0.5 rounded-full text-[12px] font-bold ${
                        activeCashSession ? 'bg-mc-success-bg text-[#15803D]' : 'bg-mc-bg text-mc-soft'
                      }`}
                    >
                      {activeCashSession ? 'Session active' : 'Fermée'}
                    </span>
                  }
                  hint={`Espèces ${formatMoney(encaisseEspeces)} · MM ${formatMoney(encaisseMobileMoney)}`}
                  onOpen={() => setDetailKind('CAISSE')}
                  openLabel="Voir le détail de la caisse"
                />
                <KpiCard
                  label="Ventes annulées"
                  value={cancelledPeriodTotal}
                  format={formatMoneyCompact}
                  tone="muted"
                  hint={`${cancelledPeriodSales.length} vente${cancelledPeriodSales.length > 1 ? 's' : ''} annulée${cancelledPeriodSales.length > 1 ? 's' : ''} · non comptée${cancelledPeriodSales.length > 1 ? 's' : ''}`}
                  onOpen={() => setDetailKind('ANNULEES')}
                  openLabel="Voir les ventes annulées"
                />
              </motion.div>

              {/* ============================================================
                  VENTES HEURE PAR HEURE + CE QUI VA MANQUER
                  Vue détaillée réservée à l'abonnement actif — floutée si expiré.
                  ============================================================ */}
              <PaywallOverlay title="Débloque tes analyses détaillées" message="Le graphique heure par heure et les alertes de stock font partie de ton abonnement.">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <motion.section
                    variants={staggerChild}
                    className="lg:col-span-2 min-w-0 rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <h2 className="text-[16px] font-bold">Tes ventes heure par heure</h2>
                        <p className="text-[12px] text-mc-soft">
                          Aujourd'hui vs hier, de 07h à 16h — toujours ces deux jours, quel que soit le filtre choisi plus haut
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-[12px] font-bold px-3 py-1 rounded-full bg-mc-primary-tint text-mc-primary-dark tabular-nums">
                          {hasTodaySales
                            ? `Ta meilleure heure : ${hourlyData[peakHourIndex].hour} (${formatMoney(hourlyData[peakHourIndex].today)})`
                            : "Pas encore de vente aujourd'hui"}
                        </span>
                        <div className="flex items-center gap-3 text-[12px] font-semibold text-mc-soft">
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-mc-primary" />
                            Aujourd'hui
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-full bg-[#DAD6FC]" />
                            Hier
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 h-[200px] md:h-[220px]">
                      <Suspense fallback={<div className="w-full h-full rounded-2xl mc-shimmer" />}>
                        <HourlyChart data={hourlyData} />
                      </Suspense>
                    </div>
                  </motion.section>

                  <motion.section
                    variants={staggerChild}
                    className="min-w-0 rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6 flex flex-col gap-4"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-[16px] font-bold">Ce qui va manquer</h2>
                        {lowStockProducts.length > 0 && (
                          <span className="text-[12px] font-bold text-[#B45309] bg-mc-warning-bg px-2.5 py-0.5 rounded-full">
                            {lowStockProducts.length} alerte{lowStockProducts.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-mc-soft">Articles approchant de la rupture</p>
                    </div>

                    {lowStockProducts.length === 0 ? (
                      <div className="flex-1 flex items-center justify-center p-4 rounded-2xl bg-mc-success-bg text-[14px] text-[#15803D] font-semibold text-center">
                        Aucun produit proche de la rupture pour le moment.
                      </div>
                    ) : (
                      <div className="flex-1 space-y-4">
                        {lowStockProducts.map((p) => {
                          const target = Math.max(1, p.alertThreshold);
                          const ratio = Math.min(100, Math.round((p.stock / target) * 100));
                          return (
                            <div key={p.id} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2 text-[14px]">
                                <span className="font-bold truncate">{p.name}</span>
                                <span
                                  className={`shrink-0 text-[12px] font-bold tabular-nums ${
                                    p.stock === 0 ? 'text-[#DC2626]' : 'text-[#B45309]'
                                  }`}
                                >
                                  {p.stock === 0 ? 'Rupture (0)' : `Reste ${p.stock} / ${p.alertThreshold}`}
                                </span>
                              </div>
                              <div className="w-full bg-mc-bg h-2 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${Math.max(4, ratio)}%` }}
                                  transition={{ duration: 0.6, ease: MC_EASE }}
                                  className={`h-full rounded-full ${p.stock === 0 ? 'bg-mc-danger' : 'bg-mc-warning'}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <button
                      onClick={() => setActiveTab('products')}
                      className="w-full h-10 rounded-full border border-mc-line hover:border-mc-primary hover:text-mc-primary text-[14px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-[0.97]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Réapprovisionner le stock</span>
                    </button>
                  </motion.section>
                </div>
              </PaywallOverlay>

              {/* ============================================================
                  CE QUE DISENT TES CHIFFRES — 5 phrases calculées
                  Vue détaillée réservée à l'abonnement actif — floutée si expiré.
                  ============================================================ */}
              <PaywallOverlay title="Débloque tes analyses détaillées" message="Ces 5 indicateurs calculés font partie de ton abonnement.">
                <motion.section
                  variants={staggerChild}
                  className="rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-mc-primary" />
                    <h2 className="text-[16px] font-bold">
                      Ce que disent tes chiffres — {periodRange.label.toLowerCase()}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    <div className="p-4 rounded-2xl bg-mc-primary-tint text-[14px] space-y-1">
                      <span className="font-bold text-mc-primary-dark block">Vente record de la période</span>
                      <p className="text-mc-ink/80 leading-snug">
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

                    <div className="p-4 rounded-2xl bg-mc-bg text-[14px] space-y-1">
                      <span className="font-bold text-mc-ink block">Rotation la plus rapide</span>
                      <p className="text-mc-ink/80 leading-snug">
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

                    <div className="p-4 rounded-2xl bg-mc-danger-bg text-[14px] space-y-1">
                      <span className="font-bold text-[#DC2626] block">Argent bloqué</span>
                      <p className="text-mc-ink/80 leading-snug">
                        {totalOverdueAmount > 0 ? (
                          <>
                            Tu as <strong>{formatMoney(totalOverdueAmount)}</strong> en attente chez {overdueCustomers.length} client
                            {overdueCustomers.length > 1 ? 's' : ''} depuis plus de 30 jours.
                          </>
                        ) : (
                          'Aucune dette de plus de 30 jours en ce moment.'
                        )}
                      </p>
                    </div>

                    <div className="p-4 rounded-2xl bg-mc-warning-bg text-[14px] space-y-1">
                      <span className="font-bold text-[#B45309] block">Pression des frais</span>
                      <p className="text-mc-ink/80 leading-snug">
                        {pressionFrais !== null ? (
                          <>
                            Tes dépenses de la période représentent <strong>{pressionFrais} %</strong> de tes encaissements bruts.
                          </>
                        ) : (
                          'Pas encore de vente sur cette période pour calculer ce ratio.'
                        )}
                      </p>
                    </div>

                    <div
                      onClick={
                        topOverdueCustomer
                          ? () => {
                              setCustomersDebtorsFilter(true);
                              setActiveTab('customers');
                            }
                          : undefined
                      }
                      className={`p-4 rounded-2xl bg-mc-success-bg text-[14px] space-y-1 md:col-span-2 ${
                        topOverdueCustomer ? 'mc-lift cursor-pointer' : ''
                      }`}
                    >
                      <span className="font-bold text-[#15803D] block">Conseil d'action immédiat</span>
                      <p className="text-mc-ink/80 leading-snug">
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
                </motion.section>
              </PaywallOverlay>

              {/* ============================================================
                  TES DERNIÈRES VENTES — une ligne par vente, un clic ouvre le reçu
                  ============================================================ */}
              <motion.section variants={staggerChild}>
                <div className="flex items-end justify-between gap-3 mb-3">
                  <div>
                    <h2 className="text-[16px] font-bold">Tes dernières ventes</h2>
                    <p className="text-[12px] text-mc-soft">Flux des encaissements en temps réel</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('sales')}
                    className="text-[14px] font-bold text-mc-primary hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Voir tout l'historique ({sales.length}) →
                  </button>
                </div>

                {dernieresVentes.length === 0 ? (
                  <EmptyState
                    title="Aucune vente pour l’instant"
                    text="Dès que tu enregistres une vente, elle apparaît ici."
                    actionLabel="Faire une vente"
                    onAction={attemptNewSale}
                    withPlus
                  />
                ) : (
                  <div className="space-y-2">
                    {dernieresVentes.map((sale) => {
                      const statut = saleStatusStyle(sale);
                      const pastille = PASTILLES_STATUT[statut.key];
                      const nom = sale.customerName || 'Client de passage';
                      return (
                        <div
                          key={sale.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedSaleForReceipt(sale)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedSaleForReceipt(sale);
                            }
                          }}
                          className="mc-lift flex items-center gap-3 md:gap-4 px-3 md:px-4 py-3 bg-white border border-mc-line rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-mc-primary"
                        >
                          <div
                            className="w-10 h-10 rounded-full text-white font-bold text-[14px] flex items-center justify-center shrink-0"
                            style={{ backgroundColor: avatarColor(nom) }}
                            aria-hidden="true"
                          >
                            {avatarInitials(nom)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-bold truncate">{nom}</p>
                            <p className="text-[12px] text-mc-soft truncate">
                              {new Date(sale.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              {sale.sellerName ? ` · ${sale.sellerName}` : ''}
                            </p>
                          </div>
                          <div className="hidden lg:block w-[26%] min-w-0 text-[14px] text-mc-soft truncate">
                            {sale.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={`text-[16px] font-extrabold tabular-nums whitespace-nowrap ${
                                sale.isCancelled ? 'line-through text-slate-400' : ''
                              }`}
                            >
                              {formatMoney(sale.totalAmount)}
                            </p>
                            {!sale.isCancelled && sale.remainingAmount > 0 && (
                              <p className="text-[12px] font-bold text-[#DC2626] tabular-nums whitespace-nowrap">
                                Reste {formatMoney(sale.remainingAmount)}
                              </p>
                            )}
                          </div>
                          <span
                            className="shrink-0 px-2 sm:px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap"
                            style={{ backgroundColor: pastille.bg, color: pastille.fg }}
                          >
                            {statut.label}
                          </span>
                          <span className="hidden md:inline-flex shrink-0 h-8 px-3 rounded-full bg-mc-bg text-mc-soft text-[12px] font-bold items-center">
                            Voir reçu
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.section>

              {/* ============================================================
                  CAISSE DU JOUR — le calcul se lit de gauche à droite
                  ============================================================ */}
              <motion.section
                variants={staggerChild}
                className="rounded-mc bg-white border border-mc-line shadow-mc-card p-4 md:p-6 space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[16px] font-bold">Caisse du jour</h2>
                      {activeCashSession ? (
                        <span className="flex items-center gap-1.5 text-[12px] font-bold text-[#15803D] bg-mc-success-bg px-2.5 py-0.5 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-mc-success animate-pulse" />
                          Session ouverte ({new Date(activeCashSession.ouverteLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[12px] font-bold text-mc-soft bg-mc-bg px-2.5 py-0.5 rounded-full">
                          <span className="w-2 h-2 rounded-full bg-mc-soft/60" />
                          Caisse fermée
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-mc-soft mt-0.5">
                      Contrôle, encaissements et réconciliation des espèces physiques
                    </p>
                  </div>

                  <button
                    onClick={() => setActiveTab('cash')}
                    className="h-10 px-4 rounded-full bg-mc-ink hover:bg-[#1E2140] text-white font-bold text-[14px] transition-all cursor-pointer self-start sm:self-auto flex items-center gap-1.5 active:scale-[0.97]"
                  >
                    <span>{activeCashSession ? 'Gérer & Clôturer la caisse' : 'Ouvrir la caisse'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-4 rounded-2xl bg-mc-bg space-y-1 min-w-0">
                    <span className="text-[12px] font-semibold text-mc-soft block">Fond de départ</span>
                    <span className="text-[16px] font-extrabold block tabular-nums truncate">{formatMoney(fondDepart)}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-mc-success-bg space-y-1 min-w-0">
                    <span className="text-[12px] font-semibold text-[#15803D] block">+ Espèces encaissées</span>
                    <span className="text-[16px] font-extrabold text-[#15803D] block tabular-nums truncate">
                      +{formatMoney(encaisseEspeces)}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-mc-primary-tint space-y-1 min-w-0">
                    <span className="text-[12px] font-semibold text-mc-primary-dark block">+ Mobile Money</span>
                    <span className="text-[16px] font-extrabold text-mc-primary-dark block tabular-nums truncate">
                      +{formatMoney(encaisseMobileMoney)}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl bg-mc-danger-bg space-y-1 min-w-0">
                    <span className="text-[12px] font-semibold text-[#DC2626] block">− Sorties d'espèces</span>
                    <span className="text-[16px] font-extrabold text-[#DC2626] block tabular-nums truncate">
                      -{formatMoney(sortiesEspeces)}
                    </span>
                  </div>
                  <div className="p-4 rounded-2xl mc-gradient text-white space-y-1 col-span-2 sm:col-span-1 min-w-0">
                    <span className="text-[12px] font-semibold text-white/80 block">= Ce que tu dois avoir</span>
                    <span className="text-[16px] font-extrabold block tabular-nums truncate">
                      {formatMoney(soldeCaisseTheorique)}
                    </span>
                  </div>
                </div>
              </motion.section>
            </motion.div>
          )}
        </motion.div>
      </MotionConfig>

      {detailKind && <DashboardDetailSheet detail={buildDetail(detailKind)} onClose={() => setDetailKind(null)} />}
      {detailCustomer && (
        <CustomerDetailPanel customer={detailCustomer} sales={sales} onClose={() => setDetailCustomerId(null)} />
      )}
    </div>
  );
};

/** Une étape de la liste de démarrage. */
interface StartupStep {
  titre: string;
  aide: string;
  fait: boolean;
  action: () => void;
  cta: string;
}

/**
 * Liste de démarrage — les trois gestes qui rendent l'application utile.
 *
 * Elle ne s'affiche que tant qu'il reste une étape à faire, et disparaît
 * définitivement une fois les trois cochées : un commerçant qui vend depuis
 * six mois n'a pas à revoir « Enregistre ta première vente ». Chaque étape
 * reste cliquable même déjà faite — on peut ajouter un deuxième produit sans
 * chercher l'onglet.
 */
const StartupChecklist: React.FC<{
  hasProduct: boolean;
  hasSale: boolean;
  hasCustomer: boolean;
  isServices: boolean;
  onAddProduct: () => void;
  onNewSale: () => void;
  onAddCustomer: () => void;
}> = ({ hasProduct, hasSale, hasCustomer, isServices, onAddProduct, onNewSale, onAddCustomer }) => {
  const steps: StartupStep[] = [
    {
      titre: isServices ? 'Ajoute ta première prestation' : 'Ajoute ton premier produit',
      aide: 'Il apparaîtra ensuite dans tes commandes, en un clic.',
      fait: hasProduct,
      action: onAddProduct,
      cta: isServices ? 'Ajouter une prestation' : 'Ajouter un produit',
    },
    {
      titre: 'Enregistre ta première vente',
      aide: 'Le reçu se crée tout seul : texte, image ou PDF à envoyer au client.',
      fait: hasSale,
      action: onNewSale,
      cta: 'Faire une vente',
    },
    {
      titre: 'Ajoute un client',
      aide: 'Pour suivre ses achats, ses dettes et le relancer sur WhatsApp.',
      fait: hasCustomer,
      action: onAddCustomer,
      cta: 'Ajouter un client',
    },
  ];

  const faits = steps.filter((s) => s.fait).length;
  if (faits === steps.length) return null;

  return (
    <div
      id="dashboard-startup-checklist"
      className="bg-white p-4 md:p-6 rounded-mc border border-dashed border-[#C9C3FB] shadow-mc-card space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-mc-ink">Tes premiers pas</h3>
          <p className="text-xs text-mc-soft mt-0.5">
            Trois gestes pour être opérationnel. Tu peux les faire dans l’ordre que tu veux.
          </p>
        </div>
        <span className="shrink-0 text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-mc-primary-tint text-mc-primary-dark">
          {faits} / {steps.length}
        </span>
      </div>

      {/* Progression : la barre se remplit à chaque étape franchie. */}
      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden" aria-hidden="true">
        <div
          className="bg-[#5B4BF0] h-full rounded-full transition-all duration-500"
          style={{ width: `${(faits / steps.length) * 100}%` }}
        />
      </div>

      <ol className="space-y-2.5">
        {steps.map((step, index) => (
          <li
            key={step.titre}
            className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-2xl border ${
              step.fait ? 'bg-emerald-50/60 border-emerald-200' : 'bg-slate-50/70 border-mc-line'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-extrabold ${
                step.fait ? 'bg-emerald-500 text-white' : 'bg-white text-[#5B4BF0] border-2 border-[#DAD6FC]'
              }`}
            >
              {step.fait ? <CheckCircle2 className="w-4 h-4" /> : index + 1}
            </div>
            <div className="flex-1 min-w-0">
              <span
                className={`text-xs font-extrabold block ${
                  step.fait ? 'text-emerald-900 line-through decoration-emerald-400' : 'text-mc-ink'
                }`}
              >
                {step.titre}
              </span>
              <span className="text-[11px] text-mc-soft block mt-0.5">{step.aide}</span>
            </div>
            {!step.fait && (
              <button
                type="button"
                onClick={step.action}
                className="shrink-0 inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-[12px] font-bold cursor-pointer transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {step.cta}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};
