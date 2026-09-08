import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { formatFCFA } from '../../utils/formatters';
import { StockMovement, StockMovementType } from '../../types';
import { ReceptionModal } from './ReceptionModal';
import { BreakageModal } from './BreakageModal';
import { LossModal } from './LossModal';
import { StockCountModal } from './StockCountModal';
import { MovementDetailModal } from './MovementDetailModal';

type PeriodFilter = 'TODAY' | '7D' | '30D' | 'THIS_MONTH' | 'CUSTOM';

export const MovementsTab: React.FC = () => {
  const { stockMovements, stockCounts, products, settings } = useApp();

  const isVendeur = settings.role === 'SELLER';

  // Modal states
  const [isReceptionOpen, setIsReceptionOpen] = useState(false);
  const [isBreakageOpen, setIsBreakageOpen] = useState(false);
  const [isLossOpen, setIsLossOpen] = useState(false);
  const [isCountOpen, setIsCountOpen] = useState(false);
  const [selectedMovement, setSelectedMovement] = useState<StockMovement | null>(null);

  // Active view mode: 'movements' | 'counts'
  const [viewMode, setViewMode] = useState<'movements' | 'counts'>('movements');

  // Filters state
  const [period, setPeriod] = useState<PeriodFilter>('30D');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
      if (startDate) {
        start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
      } else {
        start = new Date(0);
      }
      if (endDate) {
        const customEnd = new Date(endDate);
        customEnd.setHours(23, 59, 59, 999);
        return { start, end: customEnd };
      }
    }
    return { start, end };
  }, [period, startDate, endDate]);

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return stockMovements.filter((m) => {
      const movDate = new Date(m.created_at);
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
      const movDateStr = mov.created_at.slice(0, 10);
      let label = '';
      if (movDateStr === todayStr) {
        label = "Aujourd'hui";
      } else if (movDateStr === yesterdayStr) {
        label = 'Hier';
      } else {
        label = new Date(mov.created_at).toLocaleDateString('fr-FR', {
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
      const d = new Date(m.created_at);
      const row = [
        m.id,
        d.toLocaleDateString('fr-FR'),
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
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
          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 border border-slate-300">
            INVENTAIRE
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header Section with Title + 4 Key Action Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl sm:rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Mouvements de stock
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-200">
              Journal d’audit
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Traçabilité intégrale : chaque sac, bouteille ou carton entrant ou sortant
            est enregistré et vérifiable.
          </p>
        </div>

        {/* 4 Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Action A: Marchandise reçue */}
          <button
            onClick={() => setIsReceptionOpen(true)}
            className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-sm shadow-emerald-700/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <Truck className="w-4 h-4" />
            <span>+ Marchandise reçue</span>
          </button>

          {/* Action B: Cassé ou abîmé */}
          <button
            onClick={() => setIsBreakageOpen(true)}
            className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4 text-slate-950" />
            <span>Cassé ou abîmé</span>
          </button>

          {/* Action C: Perdu ou volé */}
          <button
            onClick={() => setIsLossOpen(true)}
            className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold shadow-sm shadow-rose-700/20 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Perdu ou volé</span>
          </button>

          {/* Action D: Faire un comptage */}
          <button
            onClick={() => setIsCountOpen(true)}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ClipboardList className="w-4 h-4 text-indigo-300" />
            <span>Faire un comptage</span>
          </button>
        </div>
      </div>

      {/* 2. Top Dashboard : 4 Period Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Entrées */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Entrées période
            </span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-emerald-600">
              +{stats.entreesQty}
            </span>
            <span className="text-xs font-semibold text-slate-500">unités</span>
          </div>
          {!isVendeur && (
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              Valeur : {formatFCFA(stats.entreesVal)}
            </p>
          )}
        </div>

        {/* Sorties (Ventes) */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Vendu (sorties)
            </span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-blue-600">
              −{stats.sortiesQty}
            </span>
            <span className="text-xs font-semibold text-slate-500">unités</span>
          </div>
          {!isVendeur && (
            <p className="text-[11px] font-bold text-slate-500 mt-0.5">
              Coût CMP : {formatFCFA(stats.sortiesVal)}
            </p>
          )}
        </div>

        {/* Pertes & Casses */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
              Pertes & Casses
            </span>
            <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black text-rose-600">
              −{stats.pertesCassesQty}
            </span>
            <span className="text-xs font-semibold text-slate-500">unités</span>
          </div>
          {!isVendeur && (
            <p className="text-[11px] font-bold text-rose-600 mt-0.5">
              Perte : {formatFCFA(stats.pertesCassesVal)}
            </p>
          )}
        </div>

        {/* Solde net */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
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
              className={`text-xl sm:text-2xl font-black ${
                stats.soldeNetQty >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {stats.soldeNetQty >= 0 ? `+${stats.soldeNetQty}` : stats.soldeNetQty}
            </span>
            <span className="text-xs font-semibold text-slate-500">unités en stock</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {filteredMovements.length} mouvement(s)
          </p>
        </div>
      </div>

      {/* 3. Navigation between Journal and Inventories */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('movements')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              viewMode === 'movements'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Journal des mouvements ({filteredMovements.length})
          </button>
          <button
            onClick={() => setViewMode('counts')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              viewMode === 'counts'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Sessions d’inventaire ({stockCounts.length})
          </button>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
          title="Exporter les mouvements en CSV"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline">Exporter CSV</span>
        </button>
      </div>

      {/* 4. Filter Controls (Period, Type, Product, Search) */}
      {viewMode === 'movements' && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Period selector */}
            <div>
              <label className="block text-[10px] font-extrabold uppercase text-slate-400 mb-1">
                Période
              </label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
              >
                <option value="TODAY">Aujourd’hui</option>
                <option value="7D">7 derniers jours</option>
                <option value="30D">30 derniers jours</option>
                <option value="THIS_MONTH">Ce mois-ci</option>
                <option value="CUSTOM">Personnalisée...</option>
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
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
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
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
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
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Custom Date Pickers if CUSTOM */}
          {period === 'CUSTOM' && (
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">Du</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500 font-bold">Au</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                />
              </div>
            </div>
          )}

          {/* Reset button indicator */}
          {isFiltered && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500 italic">
                Filtres actifs ({filteredMovements.length} résultat{filteredMovements.length > 1 ? 's' : ''})
              </span>
              <button
                onClick={handleResetFilters}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
              >
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. Main Content: Grouped Movement List */}
      {viewMode === 'movements' ? (
        filteredMovements.length === 0 ? (
          <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <ArrowLeftRight className="w-6 h-6" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900">
              Aucun mouvement trouvé
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Aucun mouvement ne correspond aux filtres actuels. Modifiez la période ou
              enregistrez une nouvelle réception de marchandise.
            </p>
            {isFiltered && (
              <button
                onClick={handleResetFilters}
                className="mt-2 px-4 py-2 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl hover:bg-indigo-100 cursor-pointer"
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
                  <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                    {dateLabel}
                  </h3>
                  <span className="text-[10px] font-bold text-slate-400">
                    ({movements.length} mouvement{movements.length > 1 ? 's' : ''})
                  </span>
                </div>

                {/* Movements Table / Cards */}
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-xs">
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
                                className={`text-xs sm:text-sm font-extrabold text-slate-900 truncate ${
                                  mov.annule ? 'line-through' : ''
                                }`}
                              >
                                {mov.product_name}
                              </p>
                              {mov.annule && (
                                <span className="text-[9px] font-black uppercase bg-rose-100 text-rose-700 px-1.5 py-0.2 rounded shrink-0">
                                  Annulé
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                              <span>{mov.motif || 'Mouvement de stock'}</span>
                              {mov.user_name && (
                                <>
                                  <span className="text-slate-300">•</span>
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
                              className={`text-sm sm:text-base font-black ${
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
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900">
                Historique des comptages (Inventaires)
              </h3>
              <p className="text-xs text-slate-500">
                Retrouvez chaque session de contrôle physique des rayons
              </p>
            </div>
            <button
              onClick={() => setIsCountOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Nouveau comptage
            </button>
          </div>

          {stockCounts.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-2">
              <ClipboardList className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-800">
                Aucune session de comptage enregistrée
              </p>
              <p className="text-xs text-slate-500">
                Lancez un comptage pour auditer les quantités en magasin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {stockCounts.map((count) => (
                <div
                  key={count.id}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {count.perimetre}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(count.created_at).toLocaleString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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
                      <span className="font-extrabold text-slate-900">
                        {count.nb_produits}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Écarts constatés
                      </span>
                      <span
                        className={`font-black ${
                          count.nb_ecarts > 0 ? 'text-amber-600' : 'text-emerald-600'
                        }`}
                      >
                        {count.nb_ecarts} produit(s)
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Solde unités
                      </span>
                      <span className="font-extrabold text-slate-900">
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
                        <span
                          className={`font-black ${
                            count.ecart_valeur >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {count.ecart_valeur >= 0
                            ? `+${formatFCFA(count.ecart_valeur)}`
                            : formatFCFA(count.ecart_valeur)}
                        </span>
                      </div>
                    )}
                  </div>
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
    </div>
  );
};
