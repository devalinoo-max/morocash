import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Receipt,
  Search,
  Calendar,
  User,
  Clock,
  MoreVertical,
  Eye,
  MessageCircle,
  Ban,
  Download,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  X,
  Filter,
  ArrowRight,
} from 'lucide-react';
import { formatMoney, formatDate, formatShortDate } from '../../utils/formatters';
import { Sale, Customer } from '../../types';

type PeriodFilter = 'today' | '7days' | '30days' | 'thisMonth' | 'custom';
type StatusFilter = 'ALL' | 'PAID' | 'PARTIAL' | 'CREDIT' | 'CANCELLED';

export const SalesTab: React.FC = () => {
  const {
    sales,
    customers,
    setSelectedSaleForReceipt,
    cancelSale,
    assignCustomerToSale,
    settings,
    showToast,
  } = useApp();

  // Search and Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('30days');
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');

  // Custom date range
  const todayObj = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [customStart, setCustomStart] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(todayObj.toISOString().slice(0, 10));

  // Export dropdown
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Row dropdown actions
  const [activeMenuSaleId, setActiveMenuSaleId] = useState<string | null>(null);

  // Cancellation confirm modal
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const [cancelReason, setCancelReason] = useState('Demande du client');

  // Assign customer modal
  const [saleForCustomerAssign, setSaleForCustomerAssign] = useState<Sale | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenuSaleId(null);
      setIsExportOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 1. Filter out debt repayments (Point 1: UN REMBOURSEMENT DE DETTE N'EST PAS UNE COMMANDE)
  // and normalize all references to CMD-AAAAMMJJ-NNNN (Point 3: UNE SEULE NUMÉROTATION)
  const baseSales = useMemo(() => {
    return sales
      .filter((s) => !s.items?.some((it) => it.productId === 'debt-payment'))
      .map((s) => {
        let ref = s.reference;
        if (ref.startsWith('VNT-')) ref = ref.replace('VNT-', 'CMD-');
        if (ref.startsWith('LOC-')) ref = ref.replace('LOC-', 'CMD-');
        return { ...s, reference: ref };
      });
  }, [sales]);

  // List of unique sellers for the seller filter (Point 7)
  const sellerNames = useMemo(() => {
    const set = new Set<string>();
    baseSales.forEach((s) => {
      if (s.sellerName) set.add(s.sellerName);
    });
    return Array.from(set);
  }, [baseSales]);

  // Compute date range for period filter
  const dateInterval = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (periodFilter === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (periodFilter === '7days') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    } else if (periodFilter === '30days') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
    } else if (periodFilter === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // custom
      const partsS = customStart.split('-');
      const partsE = customEnd.split('-');
      start = new Date(Number(partsS[0]), Number(partsS[1]) - 1, Number(partsS[2]), 0, 0, 0, 0);
      end = new Date(Number(partsE[0]), Number(partsE[1]) - 1, Number(partsE[2]), 23, 59, 59, 999);
    }

    return { start, end };
  }, [periodFilter, customStart, customEnd]);

  // Calculate status counts on the period selection (Point 6: Chaque filtre affiche son compteur)
  const statusCounts = useMemo(() => {
    const inPeriod = baseSales.filter((s) => {
      const d = new Date(s.createdAt);
      return d >= dateInterval.start && d <= dateInterval.end;
    });

    return {
      ALL: inPeriod.length,
      PAID: inPeriod.filter((s) => !s.isCancelled && s.paymentStatus === 'PAID').length,
      PARTIAL: inPeriod.filter((s) => !s.isCancelled && s.paymentStatus === 'PARTIAL').length,
      CREDIT: inPeriod.filter((s) => !s.isCancelled && s.paymentStatus === 'CREDIT').length,
      CANCELLED: inPeriod.filter((s) => s.isCancelled).length,
    };
  }, [baseSales, dateInterval]);

  // Full filtering logic
  const filteredSales = useMemo(() => {
    return baseSales.filter((s) => {
      // Date interval check
      const d = new Date(s.createdAt);
      if (d < dateInterval.start || d > dateInterval.end) return false;

      // Status check
      if (statusFilter === 'PAID' && (s.isCancelled || s.paymentStatus !== 'PAID')) return false;
      if (statusFilter === 'PARTIAL' && (s.isCancelled || s.paymentStatus !== 'PARTIAL')) return false;
      if (statusFilter === 'CREDIT' && (s.isCancelled || s.paymentStatus !== 'CREDIT')) return false;
      if (statusFilter === 'CANCELLED' && !s.isCancelled) return false;

      // Seller filter
      if (selectedSeller !== 'ALL' && s.sellerName !== selectedSeller) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchRef = s.reference.toLowerCase().includes(q);
        const matchCust = s.customerName && s.customerName.toLowerCase().includes(q);
        const matchSeller = s.sellerName && s.sellerName.toLowerCase().includes(q);
        const matchItem = s.items.some((it) => it.name.toLowerCase().includes(q));
        if (!matchRef && !matchCust && !matchSeller && !matchItem) return false;
      }

      return true;
    });
  }, [baseSales, dateInterval, statusFilter, selectedSeller, searchQuery]);

  // Point 2: CORRIGE LE TOTAL EN HAUT (hors annulées)
  const totalFilteredSum = useMemo(() => {
    return filteredSales
      .filter((s) => !s.isCancelled)
      .reduce((sum, s) => sum + s.totalAmount, 0);
  }, [filteredSales]);

  const totalRemainingSum = useMemo(() => {
    return filteredSales
      .filter((s) => !s.isCancelled)
      .reduce((sum, s) => sum + (s.remainingAmount || 0), 0);
  }, [filteredSales]);

  // Point 9: GROUPE PAR JOUR
  // Group orders by day with day header: "Aujourd'hui · 4 commandes · 21 300 F"
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, { dateKey: string; label: string; sales: Sale[] }>();

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

    for (const sale of filteredSales) {
      const dayKey = sale.createdAt.slice(0, 10);
      if (!groups.has(dayKey)) {
        let label = '';
        if (dayKey === todayStr) {
          label = "Aujourd'hui";
        } else if (dayKey === yesterdayStr) {
          label = 'Hier';
        } else {
          const dObj = new Date(sale.createdAt);
          const fullStr = dObj.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });
          label = fullStr.charAt(0).toUpperCase() + fullStr.slice(1);
        }

        groups.set(dayKey, {
          dateKey: dayKey,
          label,
          sales: [],
        });
      }
      groups.get(dayKey)!.sales.push(sale);
    }

    // Sort days newest to oldest
    return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredSales]);

  // Reset all filters (Point 12)
  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setPeriodFilter('30days');
    setSelectedSeller('ALL');
  };

  // WhatsApp Send helper
  const handleSendWhatsApp = (sale: Sale) => {
    const phone = sale.customerPhone || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const clientName = sale.customerName || 'Client';
    const shopName = settings.shopName || 'notre boutique';
    const itemsText = sale.items.map((it) => `- ${it.name} (x${it.quantity}) : ${formatMoney(it.total)}`).join('%0A');
    const remainingText =
      sale.remainingAmount > 0 ? `%0AReste à régler : ${formatMoney(sale.remainingAmount)}` : '';

    const text = `Bonjour ${clientName}, voici le récapitulatif de votre commande ${sale.reference} chez ${shopName} :%0A${itemsText}%0ATotal : ${formatMoney(sale.totalAmount)}${remainingText}%0AMerci pour votre confiance !`;

    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank');
  };

  // Confirm cancel action
  const handleConfirmCancel = async () => {
    if (!saleToCancel) return;
    await cancelSale(saleToCancel.id, cancelReason);
    setSaleToCancel(null);
  };

  // Export handlers (Point 8)
  const handleExportExcel = () => {
    const headers = [
      'N° Commande',
      'Date & Heure',
      'Client',
      'Téléphone',
      'Vendu par',
      'Articles',
      'Total (F)',
      'Payé (F)',
      'Reste à payer (F)',
      'Statut',
    ];

    const rows = filteredSales.map((s) => {
      const itemsStr = s.items.map((it) => `${it.quantity}x ${it.name}`).join(' | ');
      let statusStr = 'Payée';
      if (s.isCancelled) statusStr = 'Annulée';
      else if (s.paymentStatus === 'PARTIAL') statusStr = 'Partielle';
      else if (s.paymentStatus === 'CREDIT') statusStr = 'À crédit';

      return [
        s.reference,
        formatDate(s.createdAt),
        s.customerName || 'Non renseigné',
        s.customerPhone || '',
        s.sellerName || '',
        itemsStr,
        s.totalAmount,
        s.paidAmount,
        s.remainingAmount,
        statusStr,
      ];
    });

    const csvContent =
      '\uFEFF' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Commandes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export Excel/CSV téléchargé', 'success');
    setIsExportOpen(false);
  };

  const handleExportPDF = () => {
    setIsExportOpen(false);
    window.print();
  };

  // Filtered customer list for assignment modal
  const filteredCustomersForAssign = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
  }, [customers, customerSearch]);

  return (
    <div id="sales-tab-content" className="space-y-5 pb-20 max-w-[1440px] mx-auto animate-in fade-in duration-200">
      {/* =====================================================================
          HEADER (Point 2: Vrai total calculé, Point 10: Pas de doublon de bouton "+ Nouvelle commande")
          ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
            Mes commandes
          </h2>
          <p className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <strong>{filteredSales.filter((s) => !s.isCancelled).length}</strong> commande(s) active(s)
            </span>
            <span>•</span>
            <span>
              Total vendu :{' '}
              <strong className="text-slate-900 font-black">{formatMoney(totalFilteredSum)}</strong>
            </span>
            {totalRemainingSum > 0 && (
              <>
                <span>•</span>
                <span className="text-rose-600 font-bold">
                  Reste à payer : {formatMoney(totalRemainingSum)}
                </span>
              </>
            )}
          </p>
        </div>

        {/* Export Button (Point 8) */}
        <div className="relative self-start sm:self-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExportOpen(!isExportOpen);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exporter</span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

          {isExportOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 mt-2 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95"
            >
              <button
                onClick={handleExportPDF}
                className="w-full px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-indigo-50 hover:text-[#4F46E5] flex items-center gap-2 cursor-pointer"
              >
                <FileText className="w-4 h-4 text-rose-500" />
                <span>Imprimer / PDF</span>
              </button>
              <button
                onClick={handleExportExcel}
                className="w-full px-3.5 py-2 text-left text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Exporter Excel (.csv)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          BARRE DE FILTRES ET RECHERCHE
          Point 6: Filtres en langage simple sur une seule rangée avec compteurs
          Point 7: Filtre de période identique à Mes Chiffres + Filtre "Vendu par"
          ===================================================================== */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        {/* Row 1: Search + Seller Filter + Period Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher par n° CMD, client, article..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:bg-white transition-all"
            />
          </div>

          {/* Seller Filter (Point 7: "Vendu par" quand la boutique a plusieurs employés) */}
          {sellerNames.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-semibold whitespace-nowrap">Vendu par :</span>
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-bold text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-[#4F46E5] cursor-pointer"
              >
                <option value="ALL">Tous les vendeurs</option>
                {sellerNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Period Filter Pills (Point 7) */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none text-xs font-bold">
            {(
              [
                { id: 'today', label: "Aujourd'hui" },
                { id: '7days', label: '7 jours' },
                { id: '30days', label: '30 jours' },
                { id: 'thisMonth', label: 'Ce mois' },
                { id: 'custom', label: 'Période libre' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodFilter(p.id)}
                className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                  periodFilter === p.id
                    ? 'bg-[#4F46E5] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Date Inputs if custom period */}
        {periodFilter === 'custom' && (
          <div className="flex items-center gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 w-fit">
            <span className="text-slate-500 font-medium">Du</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
            <span className="text-slate-500 font-medium">au</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            />
          </div>
        )}

        {/* Row 2: Status Filter in Simple Language (Point 6: Une seule rangée, avec compteurs) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-2 border-t border-slate-100">
          {(
            [
              { id: 'ALL', label: `Toutes (${statusCounts.ALL})` },
              { id: 'PAID', label: `Payées (${statusCounts.PAID})` },
              { id: 'PARTIAL', label: `Payées en partie (${statusCounts.PARTIAL})` },
              { id: 'CREDIT', label: `Pas encore payées (${statusCounts.CREDIT})` },
              { id: 'CANCELLED', label: `Annulées (${statusCounts.CANCELLED})` },
            ] as const
          ).map((st) => {
            const active = statusFilter === st.id;
            return (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          EMPTY STATE (Point 12: Message explicatif + Bouton "Voir toutes les commandes")
          ===================================================================== */}
      {filteredSales.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-500 space-y-3">
          <Receipt className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
          <h3 className="text-base font-extrabold text-slate-800">
            Aucune commande ne correspond à ce filtre.
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Vérifie la période sélectionnée, le statut ou les termes de ta recherche.
          </p>
          <button
            onClick={resetAllFilters}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            <span>Voir toutes les commandes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        /* =====================================================================
           TABLEAU COMPLET & GROUPEMENT PAR JOUR (Points 4, 5, 9)
           ===================================================================== */
        <div className="space-y-6">
          {groupedByDay.map((dayGroup) => {
            const dayTotal = dayGroup.sales
              .filter((s) => !s.isCancelled)
              .reduce((sum, s) => sum + s.totalAmount, 0);

            return (
              <div
                key={dayGroup.dateKey}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
              >
                {/* Séparateur / En-tête de la journée (Point 9) */}
                <div className="bg-slate-50/90 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="font-black text-xs sm:text-sm text-slate-900">
                      {dayGroup.label}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-xs font-semibold text-slate-600">
                      {dayGroup.sales.length} commande{dayGroup.sales.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="text-xs font-black text-slate-900 tabular-nums">
                    Total jour : {formatMoney(dayTotal)}
                  </div>
                </div>

                {/* Table for this day */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider h-10 bg-white">
                        <th className="py-2.5 px-4">N°</th>
                        <th className="py-2.5 px-3">Date & heure</th>
                        <th className="py-2.5 px-4">Client</th>
                        <th className="py-2.5 px-3">Vendu par</th>
                        <th className="py-2.5 px-4">Articles</th>
                        <th className="py-2.5 px-4 text-right">Total</th>
                        <th className="py-2.5 px-4 text-right">Reste à payer</th>
                        <th className="py-2.5 px-3 text-center">Statut</th>
                        <th className="py-2.5 px-3 text-center">⋯</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {dayGroup.sales.map((sale) => {
                        const isCancelled = !!sale.isCancelled;
                        const hasCustomer = !!sale.customerName && sale.customerName !== 'Client de passage';
                        const firstItemName = sale.items[0]?.name || 'Article';
                        const otherItemsCount = Math.max(0, sale.items.length - 1);

                        return (
                          <tr
                            key={sale.id}
                            className={`h-[44px] hover:bg-slate-50/90 transition-colors ${
                              isCancelled ? 'bg-slate-50/50 opacity-60' : ''
                            }`}
                          >
                            {/* N° CMD (Point 3) */}
                            <td className="py-2 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className={isCancelled ? 'line-through text-slate-400' : ''}>
                                  {sale.reference}
                                </span>
                                {sale.syncStatus === 'PENDING_SYNC' && (
                                  <span
                                    title="En attente de synchronisation"
                                    className="px-1.5 py-0.2 rounded text-[9.5px] font-extrabold bg-amber-100 text-amber-900"
                                  >
                                    En attente
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Date & Heure */}
                            <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                              {formatShortDate(sale.createdAt)}
                            </td>

                            {/* Client (Point 4: Pas de 'Client de passage') */}
                            <td className="py-2 px-4 whitespace-nowrap">
                              {hasCustomer ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-indigo-50 text-[#4F46E5] font-bold text-[10px] flex items-center justify-center shrink-0">
                                    {sale.customerName!
                                      .split(' ')
                                      .map((n) => n[0])
                                      .slice(0, 2)
                                      .join('')
                                      .toUpperCase()}
                                  </div>
                                  <span className="font-extrabold text-slate-900">
                                    {sale.customerName}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span className="italic text-slate-400">
                                    Client non renseigné
                                  </span>
                                  <button
                                    onClick={() => setSaleForCustomerAssign(sale)}
                                    className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] hover:text-indigo-800 text-[11px] font-bold transition-all cursor-pointer"
                                  >
                                    Attribuer un client
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Vendu par */}
                            <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                              {sale.sellerName}
                            </td>

                            {/* Articles (Point 5: premier produit puis "+3 autres", jamais coupé) */}
                            <td className="py-2 px-4 text-slate-700 whitespace-nowrap max-w-[240px] truncate">
                              <span className="font-semibold">{firstItemName}</span>
                              {otherItemsCount > 0 && (
                                <span className="text-slate-400 font-medium ml-1">
                                  +{otherItemsCount} autre{otherItemsCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </td>

                            {/* Total (Point 5: montants à droite, tabular-nums, jamais tronqués) */}
                            <td className="py-2 px-4 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                              <span className={isCancelled ? 'line-through text-slate-400' : ''}>
                                {formatMoney(sale.totalAmount)}
                              </span>
                            </td>

                            {/* Reste à payer (Point 5: en rouge si > 0, en gris si 0) */}
                            <td className="py-2 px-4 text-right tabular-nums whitespace-nowrap font-bold">
                              {isCancelled ? (
                                <span className="text-slate-400 font-normal">—</span>
                              ) : sale.remainingAmount > 0 ? (
                                <span className="text-[#DC2626] font-black">
                                  {formatMoney(sale.remainingAmount)}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal">0 F</span>
                              )}
                            </td>

                            {/* Statut en pastille (Point 5) */}
                            <td className="py-2 px-3 text-center whitespace-nowrap">
                              {isCancelled ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 border border-slate-300">
                                  Annulée
                                </span>
                              ) : sale.paymentStatus === 'PAID' ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Payée
                                </span>
                              ) : sale.paymentStatus === 'PARTIAL' ? (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">
                                  Partielle
                                </span>
                              ) : (
                                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200">
                                  À crédit
                                </span>
                              )}
                            </td>

                            {/* Colonne "⋯" (Point 5: menu par ligne avec Voir le reçu · Renvoyer sur WhatsApp · Annuler la commande) */}
                            <td className="py-2 px-3 text-center relative whitespace-nowrap">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuSaleId(
                                    activeMenuSaleId === sale.id ? null : sale.id
                                  );
                                }}
                                className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 inline-flex items-center justify-center cursor-pointer transition-all"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {activeMenuSaleId === sale.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute right-4 top-10 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40 text-left text-xs font-bold animate-in fade-in zoom-in-95"
                                >
                                  {/* Voir le reçu */}
                                  <button
                                    onClick={() => {
                                      setSelectedSaleForReceipt(sale);
                                      setActiveMenuSaleId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-indigo-50 hover:text-[#4F46E5] flex items-center gap-2 cursor-pointer"
                                  >
                                    <Eye className="w-4 h-4 text-indigo-500" />
                                    <span>Voir le reçu</span>
                                  </button>

                                  {/* Renvoyer sur WhatsApp */}
                                  <button
                                    onClick={() => {
                                      handleSendWhatsApp(sale);
                                      setActiveMenuSaleId(null);
                                    }}
                                    className="w-full px-3.5 py-2 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2 cursor-pointer"
                                  >
                                    <MessageCircle className="w-4 h-4 text-emerald-500" />
                                    <span>Renvoyer sur WhatsApp</span>
                                  </button>

                                  {/* Annuler la commande (si non annulée) */}
                                  {!isCancelled && (
                                    <button
                                      onClick={() => {
                                        setSaleToCancel(sale);
                                        setActiveMenuSaleId(null);
                                      }}
                                      className="w-full px-3.5 py-2 text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer border-t border-slate-100"
                                    >
                                      <Ban className="w-4 h-4 text-rose-500" />
                                      <span>Annuler la commande</span>
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          MODAL D'ANNULATION DE COMMANDE
          ===================================================================== */}
      {saleToCancel && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-black text-slate-900">
                Annuler la commande {saleToCancel.reference} ?
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Les stocks vendus ({saleToCancel.items.reduce((sum, it) => sum + it.quantity, 0)}{' '}
                articles) seront automatiquement réintégrés à l'inventaire et les dettes
                associées seront ajustées.
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-slate-700">Motif de l'annulation :</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ex: Erreur de saisie, client désisté..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setSaleToCancel(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Garder la commande
              </button>
              <button
                onClick={handleConfirmCancel}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs cursor-pointer"
              >
                Confirmer l'annulation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL ATTRIBUER UN CLIENT (Point 4)
          ===================================================================== */}
      {saleForCustomerAssign && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Attribuer un client à {saleForCustomerAssign.reference}
                </h3>
                <p className="text-xs text-slate-500">
                  Sélectionne un client enregistré dans ton carnet
                </p>
              </div>
              <button
                onClick={() => setSaleForCustomerAssign(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Rechercher par nom ou numéro..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:bg-white"
              />
            </div>

            <div className="overflow-y-auto divide-y divide-slate-100 max-h-64 flex-1">
              {filteredCustomersForAssign.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Aucun client trouvé.</p>
              ) : (
                filteredCustomersForAssign.map((cust) => (
                  <button
                    key={cust.id}
                    onClick={() => {
                      assignCustomerToSale(
                        saleForCustomerAssign.id,
                        cust.id,
                        cust.name,
                        cust.phone
                      );
                      setSaleForCustomerAssign(null);
                    }}
                    className="w-full py-2.5 px-2 flex items-center justify-between text-left hover:bg-indigo-50/50 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-[#4F46E5] truncate">
                        {cust.name}
                      </div>
                      <div className="text-[11px] text-slate-500">{cust.phone}</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#4F46E5] opacity-0 group-hover:opacity-100 transition-opacity">
                      Choisir →
                    </span>
                  </button>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 text-right">
              <button
                onClick={() => setSaleForCustomerAssign(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
