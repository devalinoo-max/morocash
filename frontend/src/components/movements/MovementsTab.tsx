import React, { useState, useMemo } from 'react';
import { DATE_RANGE_LABEL } from '../common/DateRangeInputs';
import { getCustomRange, toDateInputValue } from '../../utils/period';
import { useApp } from '../../context/AppContext';
import {
  ArrowLeftRight,
  Truck,
  AlertTriangle,
  ShieldAlert,
  ClipboardList,
  Search,
  Filter,
  Download,
  Calendar,
  Package,
  TrendingDown,
  TrendingUp,
  RotateCcw,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers,
  RefreshCw,
  X,
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { StockCount, StockCountItem, StockMovement, StockMovementType } from '../../types';
import { ReceptionModal } from './ReceptionModal';
import { BreakageModal } from './BreakageModal';
import { LossModal } from './LossModal';
import { StockCountModal } from './StockCountModal';
import { MovementDetailModal } from './MovementDetailModal';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import { Segmented } from '../sales/SalesKit';

type PeriodFilter = 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM';

export const MovementsTab: React.FC = () => {
  const {
    stockMovements,
    stockCounts,
    products,
    settings,
    isWriteLocked,
    gateWrite,
    fetchStockCountDetail,
    refreshNow,
    isRefreshing,
  } = useApp();

  const isVendeur = settings.role === 'SELLER';

  // Modal states
  const [isReceptionOpen, setIsReceptionOpen] = useState(false);
  const [isBreakageOpen, setIsBreakageOpen] = useState(false);
  const [isLossOpen, setIsLossOpen] = useState(false);
  const [isCountOpen, setIsCountOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);
  // Feuille d'inventaire : le détail d'un comptage validé, relu depuis le
  // serveur. Il n'est pas chargé avec la liste — on ne tire pas des centaines
  // de lignes pour des cartes qui n'en montrent que les totaux.
  const [feuilleInventaire, setFeuilleInventaire] = useState<
    { count: StockCount; lines: StockCountItem[] } | null
  >(null);
  const [countEnChargement, setCountEnChargement] = useState<string | null>(null);

  const ouvrirFeuilleInventaire = async (count: StockCount) => {
    setCountEnChargement(count.id);
    const lines = await fetchStockCountDetail(count.id);
    setCountEnChargement(null);
    if (lines) setFeuilleInventaire({ count, lines });
  };

  // Active view mode: 'movements' | 'counts'
  const [viewMode, setViewMode] = useState<'movements' | 'counts'>('movements');

  // Filters state
  const [period, setPeriod] = useState<PeriodFilter>('30D');
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()));
  // Un mouvement ne peut pas avoir eu lieu demain : les deux bornes s'arrêtent
  // à aujourd'hui, plutôt que d'accepter une fin de plage dans le futur qui
  // n'ajoute jamais une seule ligne.
  const aujourdhui = toDateInputValue(new Date());
  const [typeFilter, setTypeFilter] = useState<'ALL' | StockMovementType>('ALL');
  const [productFilter, setProductFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Date range evaluation
  const now = new Date();
  const dateRange = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    let start = new Date();

    if (period === 'TODAY') {
      start.setHours(0, 0, 0, 0);
    } else if (period === '7D') {
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (period === '30D') {
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'THIS_MONTH') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      start.setHours(0, 0, 0, 0);
    } else if (period === 'CUSTOM') {
      // Dates lues en heure locale (new Date('2026-09-01') est lu en UTC), et
      // bornes inversées remises dans l'ordre : même calcul que partout.
      const range = getCustomRange(startDate, endDate);
      if (range) return { start: range.start, end: range.end };
    }
    return { start, end };
  }, [period, startDate, endDate]);

  /**
   * La période en toutes lettres, telle qu'elle est appliquée à la liste.
   * Le journal commence toujours par aujourd'hui : sans cette phrase, changer
   * les dates ne se voyait nulle part et le filtre passait pour cassé.
   */
  const periodeLabel = useMemo(() => {
    if (period === 'TODAY') return "Aujourd'hui";
    if (period === '7D') return 'Les 7 derniers jours';
    if (period === '30D') return 'Les 30 derniers jours';
    if (period === 'THIS_MONTH') return 'Ce mois-ci';
    return getCustomRange(startDate, endDate)?.label ?? DATE_RANGE_LABEL;
  }, [period, startDate, endDate]);

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      // Le journal se range par date d'opération : une marchandise reçue
      // samedi et saisie lundi appartient au samedi, c'est là qu'on la
      // cherche. Les mouvements d'avant cette date n'en portent pas : ils
      // retombent sur leur date de saisie, qui était alors la même chose.
      const movDate = new Date(m.date_operation ?? m.created_at);
      if (movDate < dateRange.start || movDate > dateRange.end) {
        return false;
      }
      if (typeFilter !== 'ALL' && m.type !== typeFilter) {
        return false;
      }
      if (productFilter !== 'ALL' && m.product_id !== productFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchProd = m.product_name.toLowerCase().includes(q);
        const matchMotif = m.motif?.toLowerCase().includes(q) || false;
        const matchSupplier = m.fournisseur?.toLowerCase().includes(q) || false;
        const matchOrder = m.order_reference?.toLowerCase().includes(q) || false;
        if (!matchProd && !matchMotif && !matchSupplier && !matchOrder) {
          return false;
        }
      }
      return true;
    });
  }, [stockMovements, dateRange, typeFilter, productFilter, searchQuery]);

  // Group filtered movements by date
  const groupedMovements = useMemo(() => {
    const groups: { [dateLabel: string]: StockMovement[] } = {};
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    filteredMovements.forEach((mov) => {
      const movDateStr = (mov.date_operation ?? mov.created_at).slice(0, 10);
      let label = '';
      if (movDateStr === todayStr) {
        label = "Aujourd'hui";
      } else if (movDateStr === yesterdayStr) {
        label = 'Hier';
      } else {
        label = new Date(mov.date_operation ?? mov.created_at).toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        // Capitalize first letter
        label = label.charAt(0).toUpperCase() + label.slice(1);
      }

      if (!groups[label]) {
        groups[label] = [];
      }
      groups[label].push(mov);
    });

    return groups;
  }, [filteredMovements]);

  // Dashboard 4 indicators on the period
  const stats = useMemo(() => {
    let entreesQty = 0;
    let entreesVal = 0;

    let sortiesQty = 0;
    let sortiesVal = 0;

    let pertesCassesQty = 0;
    let pertesCassesVal = 0;

    let soldeNetQty = 0;

    filteredMovements.forEach((m) => {
      if (m.annule) return; // exclude cancelled movements from net stats
      const qty = m.quantite;
      const cout = m.cout_unitaire || 0;

      soldeNetQty += qty;

      if (m.type === 'ENTREE' || m.type === 'RETOUR') {
        entreesQty += Math.abs(qty);
        entreesVal += Math.abs(qty) * (m.prix_achat_unitaire || cout);
      } else if (m.type === 'SORTIE') {
        sortiesQty += Math.abs(qty);
        sortiesVal += Math.abs(qty) * cout;
      } else if (m.type === 'CASSE' || m.type === 'PERTE') {
        pertesCassesQty += Math.abs(qty);
        pertesCassesVal += Math.abs(qty) * cout;
      }
    });

    return {
      entreesQty,
      entreesVal,
      sortiesQty,
      sortiesVal,
      pertesCassesQty,
      pertesCassesVal,
      soldeNetQty,
    };
  }, [filteredMovements]);

  // Reset filters helper
  const isFiltered =
    period !== '30D' ||
    typeFilter !== 'ALL' ||
    productFilter !== 'ALL' ||
    searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setPeriod('30D');
    setStartDate('');
    setEndDate('');
    setTypeFilter('ALL');
    setProductFilter('ALL');
    setSearchQuery('');
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'ID',
      'Date',
      'Heure',
      'Saisi le',
      'Type',
      'Produit',
      'Quantité',
      'Stock Avant',
      'Stock Après',
      'Motif',
      'Fournisseur/Commande',
      'Auteur',
      'Annulé',
    ];
    if (!isVendeur) {
      headers.push('Coût unitaire (CMP)');
    }

    const rows = filteredMovements.map((m) => {
      // « Date » est celle de l'opération, « Saisi le » celle de la saisie :
      // un comptable qui voit un écart daté d'hier doit pouvoir dire si la
      // ligne a été écrite hier ou ce matin.
      const dOperation = new Date(m.date_operation ?? m.created_at);
      const dSaisie = new Date(m.created_at);
      const row = [
        m.id,
        dOperation.toLocaleDateString('fr-FR'),
        dSaisie.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        dSaisie.toLocaleDateString('fr-FR'),
        m.type,
        `"${m.product_name.replace(/"/g, '""')}"`,
        m.quantite,
        m.stock_avant,
        m.stock_apres,
        `"${(m.motif || '').replace(/"/g, '""')}"`,
        `"${(m.fournisseur || m.order_reference || '').replace(/"/g, '""')}"`,
        `"${(m.user_name || '').replace(/"/g, '""')}"`,
        m.annule ? 'OUI' : 'NON',
      ];
      if (!isVendeur) {
        row.push(m.cout_unitaire || 0);
      }
      return row.join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `mouvements_stock_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Badge helper
  const getBadgeForType = (type: StockMovementType) => {
    switch (type) {
      case 'ENTREE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
            ENTRÉE
          </span>
        );
      case 'SORTIE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300">
            SORTIE
          </span>
        );
      case 'RETOUR':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300">
            RETOUR
          </span>
        );
      case 'CASSE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
            CASSE
          </span>
        );
      case 'PERTE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">
            PERTE
          </span>
        );
      case 'INVENTAIRE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-slate-200 text-mc-ink border border-slate-300">
            INVENTAIRE
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 pb-16">
      {/* 1. Header Section with Title + 4 Key Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Sur téléphone le titre est déjà dans la barre haute. */}
        <div className="min-w-0">
          <h1 className="hidden md:block text-[28px] font-extrabold text-mc-ink tracking-tight leading-tight">
            Mon stock
          </h1>
          <p className="text-[14px] text-mc-soft">Tout ce qui entre et sort de ta boutique, noté ligne par ligne.</p>
        </div>

        {/* 4 Primary Action Buttons */}
        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-center gap-2">
          {/* Action A: Marchandise reçue */}
          <button
            onClick={() => gateWrite(() => setIsReceptionOpen(true))}
            className={`min-h-11 px-3 py-1.5 leading-tight bg-mc-success hover:bg-[#15803D] text-white rounded-full text-[14px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <Truck className="w-4 h-4" />
            <span>Marchandise reçue</span>
          </button>

          {/* Action B: Cassé ou abîmé */}
          <button
            onClick={() => gateWrite(() => setIsBreakageOpen(true))}
            className={`min-h-11 px-3 py-1.5 leading-tight bg-mc-warning hover:bg-amber-600 text-slate-950 rounded-full text-[14px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <AlertTriangle className="w-4 h-4 text-slate-950" />
            <span>Cassé ou abîmé</span>
          </button>

          {/* Action C: Perdu ou volé */}
          <button
            onClick={() => gateWrite(() => setIsLossOpen(true))}
            className={`min-h-11 px-3 py-1.5 leading-tight bg-mc-danger hover:bg-[#DC2626] text-white rounded-full text-[14px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Perdu ou volé</span>
          </button>

          {/* Action D: Faire un comptage */}
          <button
            onClick={() => gateWrite(() => setIsCountOpen(true))}
            className={`min-h-11 px-3 py-1.5 leading-tight bg-mc-ink hover:bg-[#1E2140] text-white rounded-full text-[14px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <ClipboardList className="w-4 h-4 text-[#B9B2FF]" />
            <span>Comptage / Inventaire</span>
          </button>
        </div>
      </div>

      {/* 2. Top Dashboard : 4 Period Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Entrées */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-mc-line shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Entrées période
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-emerald-600">
              +{stats.entreesQty}
            </span>
            <span className="text-xs font-semibold text-mc-soft">unités</span>
          </div>
          {!isVendeur && (
            <p className="text-[11px] font-bold text-mc-soft mt-0.5">
              Valeur : {formatFCFA(stats.entreesVal)}
            </p>
          )}
        </div>

        {/* Sorties (Ventes) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-mc-line shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Vendu (sorties)
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-blue-600">
              −{stats.sortiesQty}
            </span>
            <span className="text-xs font-semibold text-mc-soft">unités</span>
          </div>
          {!isVendeur && (
            <p className="text-[11px] font-bold text-mc-soft mt-0.5">
              Coût CMP : {formatFCFA(stats.sortiesVal)}
            </p>
          )}
        </div>

        {/* Pertes & Casses */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-mc-line shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Pertes & Casses
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-extrabold text-rose-600">
              −{stats.pertesCassesQty}
            </span>
            <span className="text-xs font-semibold text-mc-soft">unités</span>
          </div>
          {!isVendeur && (
            <p className="text-[11px] font-bold text-rose-600 mt-0.5">
              Perte : {formatFCFA(stats.pertesCassesVal)}
            </p>
          )}
        </div>

        {/* Solde net */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-mc-line shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Variation nette
            </span>
            <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className={`text-xl sm:text-2xl font-extrabold ${
                stats.soldeNetQty >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {stats.soldeNetQty >= 0 ? `+${stats.soldeNetQty}` : stats.soldeNetQty}
            </span>
            <span className="text-xs font-semibold text-mc-soft">unités en stock</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {countLabel(filteredMovements.length, 'mouvement')}
          </p>
        </div>
      </div>

      {/* 3. Navigation between Journal and Inventories */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 md:flex-none">
          <Segmented<'movements' | 'counts'>
            id="btn-stock-view"
            label="Vue affichée"
            value={viewMode}
            onChange={setViewMode}
            options={[
              { id: 'movements', label: 'Mouvements', count: filteredMovements.length },
              { id: 'counts', label: 'Comptages / Inventaires', count: stockCounts.length },
            ]}
          />
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-mc-line bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          title="Exporter les mouvements en CSV"
        >
          <Download className="w-3.5 h-3.5 text-mc-soft" />
          <span className="hidden sm:inline">Exporter CSV</span>
        </button>
      </div>

      {/* 4. Filter Controls (Period, Type, Product, Search) */}
      {viewMode === 'movements' && (
        <div className="bg-white p-4 rounded-2xl border border-mc-line shadow-xs space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Period selector */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                Période
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
                className="w-full px-3 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-bold text-mc-ink focus:bg-white focus:outline-none focus:border-mc-primary"
              >
                <option value="TODAY">Aujourd’hui</option>
                <option value="7D">7 derniers jours</option>
                <option value="30D">30 derniers jours</option>
                <option value="THIS_MONTH">Ce mois-ci</option>
                <option value="CUSTOM">{DATE_RANGE_LABEL}</option>
              </select>
            </div>

            {/* Movement Type */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                Type de mouvement
              </label>
              <select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as 'ALL' | StockMovementType)
                }
                className="w-full px-3 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-bold text-mc-ink focus:bg-white focus:outline-none focus:border-mc-primary"
              >
                <option value="ALL">Tous les types</option>
                <option value="ENTREE">Entrées (Marchandise reçue)</option>
                <option value="SORTIE">Sorties (Ventes)</option>
                <option value="RETOUR">Retours clients</option>
                <option value="CASSE">Casses & abîmés</option>
                <option value="PERTE">Pertes & vols</option>
                <option value="INVENTAIRE">Ajustements comptage</option>
              </select>
            </div>

            {/* Product Filter */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                Filtrer par produit
              </label>
              <select
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-bold text-mc-ink focus:bg-white focus:outline-none focus:border-mc-primary"
              >
                <option value="ALL">Tous les articles</option>
                {products
                  .filter((p) => !p.isService)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Search query */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                Recherche mot-clé
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Motif, n° commande, fournisseur..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-mc-line rounded-xl text-xs font-medium text-mc-ink focus:bg-white focus:outline-none focus:border-mc-primary"
                />
              </div>
            </div>
          </div>

          {/* Custom Date Pickers if CUSTOM */}
          {period === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-mc-soft font-bold">Du</span>
                <input
                  type="date"
                  value={startDate}
                  max={aujourdhui}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-mc-line rounded-lg text-xs font-bold text-mc-ink"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-mc-soft font-bold">Au</span>
                <input
                  type="date"
                  value={endDate}
                  max={aujourdhui}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-mc-line rounded-lg text-xs font-bold text-mc-ink"
                />
              </div>
            </div>
          )}

          {/* Reset button indicator */}
          {isFiltered && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-mc-soft italic">
                Filtres actifs ({filteredMovements.length} résultat{filteredMovements.length > 1 ? 's' : ''})
              </span>
              <button
                onClick={handleResetFilters}
                className="text-xs font-bold text-mc-primary hover:text-mc-primary-dark hover:underline cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. Ce que la liste montre en ce moment, et de quand ça date.
          Le journal commence toujours par aujourd'hui : sans cette ligne,
          changer la période ne se voyait pas, et le seul moyen de recharger
          était le bouton du bandeau, à l'autre bout de l'écran. */}
      {viewMode === 'movements' && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-xs text-mc-soft min-w-0">
            <span className="font-extrabold text-mc-ink">{periodeLabel}</span>
            <span> · {countLabel(filteredMovements.length, 'mouvement')}</span>
            {filteredMovements.length !== stockMovements.length && (
              <span className="text-slate-400"> sur {stockMovements.length}</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => void refreshNow()}
            disabled={isRefreshing}
            title="Recharger les mouvements depuis le serveur"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-mc-line bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-mc-soft ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Mise à jour…' : 'Actualiser'}</span>
          </button>
        </div>
      )}

      {/* 6. Main Content: Grouped Movement List */}
      {viewMode === 'movements' ? (
        filteredMovements.length === 0 ? (
          <div className="bg-white p-12 rounded-mc border border-mc-line text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-mc-ink">
              Aucun mouvement trouvé
            </h3>
            <p className="text-xs text-mc-soft max-w-sm mx-auto">
              Aucun mouvement ne correspond aux filtres actuels. Modifiez la période ou
              enregistrez une nouvelle réception de marchandise.
            </p>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-4 py-2 bg-mc-primary-tint text-mc-primary-dark font-bold text-xs rounded-xl hover:bg-mc-primary-tint cursor-pointer"
              >
                Effacer les filtres
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {(Object.entries(groupedMovements) as [string, StockMovement[]][]).map(([dateLabel, movements]) => (
              <div key={dateLabel} className="space-y-2">
                {/* Date Group Header */}
                <div className="flex items-center gap-2 px-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <h3 className="text-xs font-extrabold uppercase text-mc-soft tracking-wider">
                    {dateLabel}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">
                    ({movements.length} mouvement{movements.length > 1 ? 's' : ''})
                  </span>
                </div>

                {/* Movements Table / Cards */}
                <div className="bg-white rounded-2xl border border-mc-line divide-y divide-slate-100 overflow-hidden shadow-xs">
                  {movements.map((mov) => {
                    const time = new Date(mov.created_at).toLocaleTimeString(
                      'fr-FR',
                      { hour: '2-digit', minute: '2-digit' }
                    );
                    const isPos = mov.quantite > 0;

                    return (
                      <div
                        key={mov.id}
                        onClick={() => setSelectedMovement(mov)}
                        className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          mov.annule ? 'opacity-60 bg-slate-50/40' : ''
                        }`}
                      >
                        {/* Left: Time & Type Badge & Info */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-bold text-slate-400 font-mono shrink-0 w-11">
                            {time}
                          </span>

                          <div className="shrink-0">{getBadgeForType(mov.type)}</div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p
                                className={`text-xs sm:text-sm font-extrabold text-mc-ink truncate ${
                                  mov.annule ? 'line-through' : ''
                                }`}
                              >
                                {mov.product_name}
                              </p>
                              {mov.annule && (
                                <span className="text-[9px] font-extrabold uppercase bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded shrink-0">
                                  Annulé
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-mc-soft truncate">
                              <span>{mov.motif || 'Mouvement de stock'}</span>
                              {mov.user_name && (
                                <>
                                  <span className="text-slate-300 mx-1.5">•</span>
                                  <span className="text-slate-400">{mov.user_name}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Right: Quantity + Evolution stock */}
                        <div className="flex items-center gap-4 shrink-0 text-right">
                          <div>
                            <div
                              className={`text-sm sm:text-base font-extrabold ${
                                isPos ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            >
                              {isPos ? `+${mov.quantite}` : mov.quantite}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400">
                              {mov.stock_avant} →{' '}
                              <span className="text-slate-700 font-extrabold">
                                {mov.stock_apres}
                              </span>
                            </div>
                          </div>

                          <ChevronRight className="w-4 h-4 text-slate-300 hidden sm:block" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        /* 6. Stock Count Sessions View */
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-mc-line shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-mc-ink">
                Historique des comptages / inventaires
              </h3>
              <p className="text-xs text-mc-soft">
                Retrouvez chaque session de contrôle physique des rayons
              </p>
            </div>
            <button
              onClick={() => gateWrite(() => setIsCountOpen(true))}
              className={`px-4 py-2 bg-mc-primary hover:bg-mc-primary-dark text-white rounded-xl text-xs font-bold cursor-pointer ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              Nouveau comptage / inventaire
            </button>
          </div>

          {stockCounts.length === 0 ? (
            <div className="bg-white p-12 rounded-mc border border-mc-line text-center space-y-2">
              <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-mc-ink">
                Aucune session de comptage enregistrée
              </p>
              <p className="text-xs text-mc-soft">
                Lancez un comptage pour auditer les quantités en magasin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stockCounts.map((count) => (
                <div
                  key={count.id}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-mc-line shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-mc-primary-tint text-mc-primary-dark border border-[#DAD6FC]">
                          {count.perimetre}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(count.date_operation ?? count.created_at).toLocaleDateString(
                            'fr-FR',
                            { day: 'numeric', month: 'short', year: 'numeric' }
                          )}
                        </span>
                      </div>
                      {count.commentaire && (
                        <p className="text-xs font-semibold text-slate-700 mt-1">
                          « {count.commentaire} »
                        </p>
                      )}
                    </div>

                    <span className="text-xs text-slate-400 font-medium">
                      Par {count.user_name}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Articles vérifiés
                      </span>
                      <span className="font-extrabold text-mc-ink">
                        {count.nb_produits}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Écarts constatés
                      </span>
                      <span
                        className={`font-extrabold ${
                          count.nb_ecarts > 0 ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {countLabel(count.nb_ecarts, 'produit')}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Solde unités
                      </span>
                      <span className="font-extrabold text-mc-ink">
                        {count.ecart_unites > 0
                          ? `+${count.ecart_unites}`
                          : count.ecart_unites}
                      </span>
                    </div>
                    {!isVendeur && (
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">
                          Impact financier
                        </span>
                        {/* `ecart_valeur` est une valeur absolue : il dit
                            combien d'argent les écarts représentent, jamais
                            dans quel sens. `ecart_valeur_nette`, signé, le
                            dit — les inventaires d'avant ne l'ont pas. */}
                        {(() => {
                          const net = count.ecart_valeur_nette;
                          if (net === undefined) {
                            return (
                              <span className="font-extrabold text-mc-ink">
                                {formatFCFA(count.ecart_valeur)}
                              </span>
                            );
                          }
                          return (
                            <span
                              className={`font-extrabold ${
                                net >= 0 ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {net >= 0 ? `+${formatFCFA(net)}` : formatFCFA(net)}
                            </span>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {!isVendeur && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      {count.valeur_stock_comptee !== undefined && (
                        <span className="text-xs text-mc-soft">
                          Valeur du stock compté :{' '}
                          <span className="font-extrabold text-mc-ink">
                            {formatFCFA(count.valeur_stock_comptee)}
                          </span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => ouvrirFeuilleInventaire(count)}
                        disabled={countEnChargement === count.id}
                        className="ml-auto px-3 py-1.5 rounded-lg border border-mc-line hover:border-mc-primary hover:text-mc-primary text-[11px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-wait inline-flex items-center gap-1.5"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                        {countEnChargement === count.id ? 'Ouverture…' : 'Feuille d’inventaire'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      <ReceptionModal
        isOpen={isReceptionOpen}
        onClose={() => setIsReceptionOpen(false)}
      />
      <BreakageModal
        isOpen={isBreakageOpen}
        onClose={() => setIsBreakageOpen(false)}
      />
      <LossModal isOpen={isLossOpen} onClose={() => setIsLossOpen(false)} />
      <StockCountModal
        isOpen={isCountOpen}
        onClose={() => setIsCountOpen(false)}
      />
      <MovementDetailModal
        movement={selectedMovement}
        onClose={() => setSelectedMovement(null)}
      />

      {feuilleInventaire && (
        <FeuilleInventaireModal
          count={feuilleInventaire.count}
          lines={feuilleInventaire.lines}
          shopName={settings.shopName}
          onClose={() => setFeuilleInventaire(null)}
        />
      )}
    </div>
  );
};

/**
 * La feuille d'inventaire : ce qui a été compté, article par article, écart ou
 * non. C'est la seule preuve qu'un article a été vérifié — un article conforme
 * ne produit aucun mouvement de stock et ne laisse donc rien d'autre derrière
 * lui. Les articles non comptés n'y figurent pas : l'inventaire ne prétend
 * rien à leur sujet.
 */
const FeuilleInventaireModal: React.FC<{
  count: StockCount;
  lines: StockCountItem[];
  shopName: string;
  onClose: () => void;
}> = ({ count, lines, shopName, onClose }) => {
  const dateInventaire = new Date(count.date_operation ?? count.created_at).toLocaleDateString(
    'fr-FR',
    { day: 'numeric', month: 'long', year: 'numeric' }
  );

  const exporterCSV = () => {
    const entetes = [
      'Produit',
      'Unité',
      'Stock théorique',
      'Stock compté',
      'Écart',
      'Coût unitaire',
      'Valeur écart',
      'Motif',
    ];
    const lignes = lines.map((l) =>
      [
        `"${l.productName.replace(/"/g, '""')}"`,
        `"${(l.unite ?? '').replace(/"/g, '""')}"`,
        l.stockTheorique,
        l.stockCompte,
        l.ecart,
        l.coutUnitaire ?? '',
        l.valeurEcart,
        `"${(l.motif ?? '').replace(/"/g, '""')}"`,
      ].join(',')
    );
    const contenu = [
      `"Inventaire ${shopName || ''} — ${dateInventaire} — ${count.perimetre}"`,
      '',
      entetes.join(','),
      ...lignes,
    ].join('\n');

    // Le BOM : sans lui, Excel lit les accents de travers.
    const blob = new Blob(['﻿' + contenu], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `inventaire-${(count.date_operation ?? count.created_at).slice(0, 10)}.csv`;
    lien.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl sm:rounded-mc shadow-2xl border border-mc-line w-full max-w-3xl my-auto overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-indigo-900 px-5 sm:px-6 py-4 text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
              Feuille d’inventaire
            </h2>
            <p className="text-xs text-indigo-200 font-medium truncate">
              {dateInventaire} · {count.perimetre} · par {count.user_name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 shrink-0 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {count.commentaire && (
            <p className="text-xs font-semibold text-slate-700">« {count.commentaire} »</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Comptés</span>
              <span className="font-extrabold text-mc-ink">{lines.length}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Écarts</span>
              <span className="font-extrabold text-mc-ink">{count.nb_ecarts}</span>
            </div>
            {count.valeur_stock_comptee !== undefined && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Valeur comptée
                </span>
                <span className="font-extrabold text-mc-ink">
                  {formatFCFA(count.valeur_stock_comptee)}
                </span>
              </div>
            )}
            {count.ecart_valeur_nette !== undefined && (
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase block">
                  Impact
                </span>
                <span
                  className={`font-extrabold ${
                    count.ecart_valeur_nette >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {count.ecart_valeur_nette >= 0
                    ? `+${formatFCFA(count.ecart_valeur_nette)}`
                    : formatFCFA(count.ecart_valeur_nette)}
                </span>
              </div>
            )}
          </div>

          <div className="border border-mc-line rounded-xl overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-[11px] font-extrabold uppercase text-slate-600">
                <tr>
                  <th className="py-2.5 px-3">Produit</th>
                  <th className="py-2.5 px-2 text-center">Théorique</th>
                  <th className="py-2.5 px-2 text-center">Compté</th>
                  <th className="py-2.5 px-3 text-right">Écart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {lines.map((l) => (
                  <tr key={l.productId} className={l.ecart !== 0 ? 'bg-amber-50/40' : ''}>
                    <td className="py-2.5 px-3">
                      <p className="font-bold text-mc-ink leading-tight">{l.productName}</p>
                      {l.motif && (
                        <span className="text-[11px] text-amber-700">{l.motif}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center text-mc-soft font-bold">
                      {l.stockTheorique}
                    </td>
                    <td className="py-2.5 px-2 text-center font-extrabold text-mc-ink">
                      {l.stockCompte}
                    </td>
                    <td className="py-2.5 px-3 text-right font-extrabold">
                      {l.ecart === 0 ? (
                        <span className="text-emerald-600">Conforme</span>
                      ) : l.ecart > 0 ? (
                        <span className="text-emerald-700">+{l.ecart}</span>
                      ) : (
                        <span className="text-rose-700">{l.ecart}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-2 border-t border-mc-line flex flex-wrap items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-mc-line rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2.5 border border-mc-line rounded-xl text-xs font-bold text-slate-700 hover:border-mc-primary hover:text-mc-primary cursor-pointer"
            >
              Imprimer
            </button>
            <button
              type="button"
              onClick={exporterCSV}
              className="px-5 py-2.5 bg-mc-primary hover:bg-mc-primary-dark text-white rounded-xl text-xs font-extrabold cursor-pointer inline-flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" />
              Exporter en CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
