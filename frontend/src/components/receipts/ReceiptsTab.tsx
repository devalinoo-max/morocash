import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileText,
  Search,
  Calendar,
  Share2,
  Printer,
  Download,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Send,
  X,
  Copy,
  Check,
  ChevronDown,
  User,
  ShieldCheck,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Sale, ReceiptDelivery, ReceiptDeliveryChannel } from '../../types';
import { formatMoney, formatDate, formatShortDate } from '../../utils/formatters';
import { ReceiptView } from './ReceiptView';
import {
  shareReceiptOnWhatsApp,
  copyReceiptToClipboard,
  printReceiptsPdf,
  downloadReceiptsPdf,
} from '../../utils/receiptHelpers';

type PeriodFilter = 'today' | 'week' | 'month' | 'all';
type StateFilter = 'ALL' | 'SENT' | 'UNSENT' | 'PAID' | 'REMAINING';

export const ReceiptsTab: React.FC = () => {
  const {
    sales,
    customers,
    settings,
    receiptDeliveries,
    recordReceiptDelivery,
    showToast,
  } = useApp();

  // Filters state
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drawer / Inspection state
  const [inspectingSale, setInspectingSale] = useState<Sale | null>(null);
  const [drawerMerchantCopy, setDrawerMerchantCopy] = useState(false);
  const [drawerCopied, setDrawerCopied] = useState(false);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);

  // 1. Filter sales based on Role & Permissions
  const roleFilteredSales = useMemo(() => {
    if (settings.role === 'SELLER') {
      const sellerName = settings.currentSellerName || 'Awa Traoré';
      return sales.filter(
        (s) => (s.sellerName || '').toLowerCase().trim() === sellerName.toLowerCase().trim()
      );
    }
    return sales;
  }, [sales, settings.role, settings.currentSellerName]);

  // List of distinct sellers for Owner filter
  const distinctSellers = useMemo(() => {
    const list = new Set<string>();
    sales.forEach((s) => {
      if (s.sellerName) list.add(s.sellerName);
    });
    return Array.from(list);
  }, [sales]);

  // 2. Deliveries lookup map by saleId
  const deliveriesBySaleId = useMemo(() => {
    const map = new Map<string, ReceiptDelivery[]>();
    receiptDeliveries.forEach((del) => {
      const existing = map.get(del.orderId) || [];
      existing.push(del);
      map.set(del.orderId, existing);
    });
    return map;
  }, [receiptDeliveries]);

  // 3. Apply all search & filter criteria
  const filteredSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return roleFilteredSales.filter((sale) => {
      // Period filter
      const saleTime = new Date(sale.createdAt).getTime();
      if (period === 'today' && saleTime < startOfToday) return false;
      if (period === 'week' && saleTime < startOfWeek) return false;
      if (period === 'month' && saleTime < startOfMonth) return false;

      // Seller filter (Owner only)
      if (settings.role !== 'SELLER' && selectedSeller !== 'ALL') {
        if (sale.sellerName !== selectedSeller) return false;
      }

      // Customer filter
      if (selectedCustomerId !== 'ALL') {
        const matchesName = (sale.customerName || '').toLowerCase() === selectedCustomerId.toLowerCase();
        const matchesId = sale.customerId === selectedCustomerId;
        if (!matchesName && !matchesId) return false;
      }

      // Deliveries status
      const dels = deliveriesBySaleId.get(sale.id) || [];
      const hasBeenSent = dels.length > 0;

      if (stateFilter === 'SENT' && !hasBeenSent) return false;
      if (stateFilter === 'UNSENT' && hasBeenSent) return false;
      if (stateFilter === 'PAID' && sale.remainingAmount > 0) return false;
      if (stateFilter === 'REMAINING' && sale.remainingAmount <= 0) return false;

      // Text search (reference, customer name, customer phone)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const refMatch = sale.reference.toLowerCase().includes(query);
        const nameMatch = (sale.customerName || '').toLowerCase().includes(query);
        const phoneMatch = (sale.customerPhone || '').includes(query);
        if (!refMatch && !nameMatch && !phoneMatch) return false;
      }

      return true;
    });
  }, [
    roleFilteredSales,
    period,
    selectedSeller,
    selectedCustomerId,
    stateFilter,
    searchQuery,
    settings.role,
    deliveriesBySaleId,
  ]);

  // 4. Calculate Key Indicators
  const metrics = useMemo(() => {
    const totalIssued = filteredSales.length;
    let sentCount = 0;
    let unsentCount = 0;
    let whatsappCount = 0;

    filteredSales.forEach((s) => {
      const dels = deliveriesBySaleId.get(s.id) || [];
      if (dels.length > 0) {
        sentCount += 1;
        if (dels.some((d) => d.canal === 'WHATSAPP')) {
          whatsappCount += 1;
        }
      } else {
        unsentCount += 1;
      }
    });

    const sentPercent = totalIssued > 0 ? Math.round((sentCount / totalIssued) * 100) : 0;

    return {
      totalIssued,
      sentCount,
      unsentCount,
      sentPercent,
      whatsappCount,
    };
  }, [filteredSales, deliveriesBySaleId]);

  // 5. Group filtered sales by day
  const groupedSales = useMemo(() => {
    const groups: { [dateStr: string]: { date: Date; label: string; items: Sale[] } } = {};
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;

    const yesterdayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterdayStr = `${yesterdayObj.getFullYear()}-${String(
      yesterdayObj.getMonth() + 1
    ).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

    filteredSales.forEach((sale) => {
      const d = new Date(sale.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;

      if (!groups[key]) {
        let label = formatDate(sale.createdAt).split(' à ')[0];
        if (key === todayStr) label = "Aujourd'hui";
        else if (key === yesterdayStr) label = 'Hier';

        groups[key] = {
          date: d,
          label,
          items: [],
        };
      }
      groups[key].items.push(sale);
    });

    // Sort descending by date
    return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [filteredSales]);

  // Selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredSales.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredSales.map((s) => s.id)));
    }
  };

  const selectedSalesList = useMemo(() => {
    return filteredSales.filter((s) => selectedIds.has(s.id));
  }, [filteredSales, selectedIds]);

  // Single Action Handlers
  const handleWhatsAppSingle = (sale: Sale) => {
    shareReceiptOnWhatsApp(sale, settings, (canal) => {
      recordReceiptDelivery(sale.id, canal, sale.reference);
      showToast('Ouverture de WhatsApp...', 'success');
    });
  };

  const handlePrintSingle = async (sale: Sale) => {
    setIsProcessingPdf(true);
    try {
      await printReceiptsPdf([sale], settings, false, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      showToast('Reçu PDF envoyé à l’impression', 'info');
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de l’impression du reçu', 'error');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleDownloadSingle = async (sale: Sale) => {
    setIsProcessingPdf(true);
    try {
      await downloadReceiptsPdf([sale], settings, false, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      showToast('Téléchargement du reçu PDF en cours', 'success');
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du téléchargement', 'error');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Bulk Actions
  const handleBulkPrint = async () => {
    if (selectedSalesList.length === 0) return;
    setIsProcessingPdf(true);
    try {
      await printReceiptsPdf(selectedSalesList, settings, false, (canal) => {
        selectedSalesList.forEach((s) => recordReceiptDelivery(s.id, canal, s.reference));
      });
      showToast(`${selectedSalesList.length} reçus envoyés à l’impression`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Erreur lors de l’impression groupée', 'error');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedSalesList.length === 0) return;
    setIsProcessingPdf(true);
    try {
      await downloadReceiptsPdf(selectedSalesList, settings, false, (canal) => {
        selectedSalesList.forEach((s) => recordReceiptDelivery(s.id, canal, s.reference));
      });
      showToast(`Téléchargement de ${selectedSalesList.length} reçus`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Erreur lors du téléchargement groupé', 'error');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Numéro de reçu',
      'Date',
      'Client',
      'Téléphone',
      'Vendu par',
      'Total (F CFA)',
      'Payé (F CFA)',
      'Reste à payer (F CFA)',
      'Mode de paiement',
      'Statut envoi',
      'Dernier canal',
    ];

    const rows = filteredSales.map((sale) => {
      const dels = deliveriesBySaleId.get(sale.id) || [];
      const statusEnvoi = dels.length > 0 ? 'Envoyé' : 'Non envoyé';
      const canal = dels.length > 0 ? dels[0].canal : '-';

      return [
        `"${sale.reference}"`,
        `"${sale.createdAt}"`,
        `"${sale.customerName || 'Client de passage'}"`,
        `"${sale.customerPhone || ''}"`,
        `"${sale.sellerName || 'Vendeur'}"`,
        sale.totalAmount,
        sale.paidAmount,
        sale.remainingAmount,
        `"${sale.paymentMethod}"`,
        `"${statusEnvoi}"`,
        `"${canal}"`,
      ].join(';');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `recus-morocash-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export CSV téléchargé', 'success');
  };

  // Helper formatting for articles summary
  const getArticlesSummary = (sale: Sale) => {
    const count = sale.items.reduce((acc, it) => acc + it.quantity, 0);
    const names = sale.items
      .slice(0, 2)
      .map((it) => `${it.name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`)
      .join(', ');
    const extra = sale.items.length > 2 ? ` +${sale.items.length - 2}` : '';
    return `${count} art. : ${names}${extra}`;
  };

  return (
    <div className="space-y-6 pb-20">
      {/* 1. BARRE HAUTE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-[#4F46E5] flex items-center justify-center shadow-2xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">Mes reçus</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Historique et réémission des reçus clients
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            id="btn-export-receipts-csv"
            onClick={handleExportCSV}
            className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Exporter</span>
          </button>
        </div>
      </div>

      {/* 2. INDICATEURS CLÉS (3 CARTES MODERNES) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Reçus émis */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Reçus émis
            </span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {metrics.totalIssued}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Commandes de la période
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        {/* Envoyés au client */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Envoyés au client
            </span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {metrics.sentCount}
            </div>
            <p className="text-[11px] text-emerald-600 font-medium mt-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>
                {metrics.whatsappCount} sur WhatsApp · {metrics.sentPercent} %
              </span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
        </div>

        {/* Jamais envoyés */}
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Jamais envoyés
            </span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {metrics.unsentCount}
            </div>
            <p className="text-[11px] text-amber-600 font-medium mt-0.5 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Le client n'a rien reçu</span>
            </p>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. BARRE DE FILTRES ET RECHERCHE */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        {/* Recherche + Filtres déroulants */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Recherche texte */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="search-receipts"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="N° reçu, client, téléphone..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5] outline-hidden transition-all text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filtre État */}
          <div>
            <select
              id="filter-receipt-state"
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as StateFilter)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#4F46E5] outline-hidden text-slate-800 font-medium cursor-pointer"
            >
              <option value="ALL">Tous les états</option>
              <option value="SENT">Envoyés au client</option>
              <option value="UNSENT">Jamais envoyés</option>
              <option value="PAID">Soldés intégralement</option>
              <option value="REMAINING">Avec reste à payer</option>
            </select>
          </div>

          {/* Filtre Client */}
          <div>
            <select
              id="filter-receipt-customer"
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#4F46E5] outline-hidden text-slate-800 font-medium cursor-pointer"
            >
              <option value="ALL">Tous les clients</option>
              {customers.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filtre Vendeur (Propriétaire uniquement) */}
          {settings.role !== 'SELLER' ? (
            <div>
              <select
                id="filter-receipt-seller"
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#4F46E5] outline-hidden text-slate-800 font-medium cursor-pointer"
              >
                <option value="ALL">Tous les vendeurs</option>
                {distinctSellers.map((seller) => (
                  <option key={seller} value={seller}>
                    {seller}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
              <User className="w-3.5 h-3.5 text-slate-400 mr-2" />
              <span>Mes reçus ({settings.currentSellerName || 'Vendeur'})</span>
            </div>
          )}
        </div>

        {/* Pilules de Période */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Période :
            </span>
            {(
              [
                { id: 'today', label: "Aujourd'hui" },
                { id: 'week', label: 'Cette semaine' },
                { id: 'month', label: 'Ce mois' },
                { id: 'all', label: 'Tout' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  period === p.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-800">{filteredSales.length}</span> reçu
            {filteredSales.length > 1 ? 's' : ''} trouvé
            {filteredSales.length > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* 4. TABLEAU GROUPÉ PAR JOUR */}
      {filteredSales.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Aucun reçu sur cette période</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            Modifie tes filtres ou enregistre une nouvelle commande pour générer des reçus.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupedSales.map((group) => (
            <div
              key={group.label}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden"
            >
              {/* En-tête de date du groupe */}
              <div className="px-5 py-2.5 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 tracking-wide flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-[#4F46E5]" />
                  {group.label}
                </span>
                <span className="text-slate-500 font-medium">
                  {group.items.length} reçu{group.items.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-white text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4 w-10">
                        <input
                          type="checkbox"
                          checked={
                            group.items.length > 0 &&
                            group.items.every((it) => selectedIds.has(it.id))
                          }
                          onChange={() => {
                            const allGroupSelected = group.items.every((it) => selectedIds.has(it.id));
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              group.items.forEach((it) => {
                                if (allGroupSelected) next.delete(it.id);
                                else next.add(it.id);
                              });
                              return next;
                            });
                          }}
                          className="rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5] cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3">N° Reçu</th>
                      <th className="py-3 px-3">Heure</th>
                      <th className="py-3 px-3">Client</th>
                      <th className="py-3 px-3">Vendu par</th>
                      <th className="py-3 px-3">Articles</th>
                      <th className="py-3 px-3 text-right">Total</th>
                      <th className="py-3 px-3 text-center">Paiement</th>
                      <th className="py-3 px-3 text-center">Envoyé</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.items.map((sale) => {
                      const isSelected = selectedIds.has(sale.id);
                      const dels = deliveriesBySaleId.get(sale.id) || [];
                      const lastDelivery = dels[0];

                      return (
                        <tr
                          key={sale.id}
                          className={`hover:bg-slate-50/80 transition-colors group ${
                            isSelected ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-4">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(sale.id)}
                              className="rounded border-slate-300 text-[#4F46E5] focus:ring-[#4F46E5] cursor-pointer"
                            />
                          </td>

                          {/* N° Reçu */}
                          <td className="py-3 px-3">
                            <button
                              onClick={() => {
                                setInspectingSale(sale);
                                setDrawerMerchantCopy(false);
                              }}
                              className="font-mono font-bold text-indigo-900 hover:text-[#4F46E5] hover:underline flex items-center gap-1 cursor-pointer"
                            >
                              <span>{sale.reference}</span>
                            </button>
                          </td>

                          {/* Heure */}
                          <td className="py-3 px-3 text-slate-500 font-mono">
                            {formatShortDate(sale.createdAt)}
                          </td>

                          {/* Client */}
                          <td className="py-3 px-3">
                            <div className="font-medium text-slate-900">
                              {sale.customerName?.trim() || 'Client de passage'}
                            </div>
                            {sale.customerPhone && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                {sale.customerPhone}
                              </div>
                            )}
                          </td>

                          {/* Vendu par */}
                          <td className="py-3 px-3 text-slate-600 font-medium">
                            {sale.sellerName || 'Vendeur'}
                          </td>

                          {/* Articles (résumé court) */}
                          <td className="py-3 px-3 text-slate-600 max-w-[200px] truncate" title={sale.items.map((it) => `${it.name} (${it.quantity})`).join(', ')}>
                            {getArticlesSummary(sale)}
                          </td>

                          {/* Total */}
                          <td className="py-3 px-3 text-right font-bold font-sans text-slate-900">
                            {formatMoney(sale.totalAmount)}
                          </td>

                          {/* Reste à payer / Paiement */}
                          <td className="py-3 px-3 text-center">
                            {sale.remainingAmount > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Reste {formatMoney(sale.remainingAmount)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Soldé
                              </span>
                            )}
                          </td>

                          {/* Statut Envoyé */}
                          <td className="py-3 px-3 text-center">
                            {lastDelivery ? (
                              lastDelivery.canal === 'WHATSAPP' ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#25D366]/15 text-[#1e9249] border border-[#25D366]/30"
                                  title={`Envoyé le ${formatDate(lastDelivery.createdAt)} par ${lastDelivery.userName || 'l’équipe'}`}
                                >
                                  <Send className="w-3 h-3" />
                                  <span>WhatsApp</span>
                                </span>
                              ) : (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-sky-50 text-sky-700 border border-sky-200"
                                  title={`Imprimé le ${formatDate(lastDelivery.createdAt)}`}
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>Imprimé</span>
                                </span>
                              )
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                Non envoyé
                              </span>
                            )}
                          </td>

                          {/* Actions rapides */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleWhatsAppSingle(sale)}
                                title="Envoyer par WhatsApp"
                                className="w-7 h-7 rounded-lg text-emerald-600 hover:bg-emerald-50 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Share2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handlePrintSingle(sale)}
                                title="Imprimer le reçu (PDF)"
                                className="w-7 h-7 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDownloadSingle(sale)}
                                title="Télécharger le reçu PDF"
                                className="w-7 h-7 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setInspectingSale(sale);
                                  setDrawerMerchantCopy(false);
                                }}
                                title="Voir l'aperçu complet"
                                className="w-7 h-7 rounded-lg text-indigo-600 hover:bg-indigo-50 flex items-center justify-center transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. BARRE FLOTTANTE SÉLECTION MULTIPLE */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 flex-wrap animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 pr-2 border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-[#4F46E5] text-white text-xs font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold">reçus sélectionnés</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkPrint}
              disabled={isProcessingPdf}
              className="px-3 py-1.5 bg-[#4F46E5] hover:bg-indigo-600 active:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimer la sélection</span>
            </button>

            <button
              onClick={handleBulkDownload}
              disabled={isProcessingPdf}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Télécharger les PDF</span>
            </button>

            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-slate-400 hover:text-white px-2 py-1 transition-colors cursor-pointer"
            >
              Désélectionner tout
            </button>
          </div>
        </div>
      )}

      {/* 6. VOLET D'APERÇU LATÉRAL (DRAWER) */}
      {inspectingSale && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/50 backdrop-blur-2xs animate-in fade-in duration-150"
          onClick={() => setInspectingSale(null)}
        >
          <div
            className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Drawer */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-[#4F46E5] flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    Détail du reçu {inspectingSale.reference}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Émis le {formatDate(inspectingSale.createdAt)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectingSale(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toggle Copie client / Copie commerçant */}
            <div className="px-5 py-2.5 bg-slate-100/60 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Type de copie :</span>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setDrawerMerchantCopy(false)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    !drawerMerchantCopy
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Copie client</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDrawerMerchantCopy(true)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    drawerMerchantCopy
                      ? 'bg-amber-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Copie commerçant</span>
                </button>
              </div>
            </div>

            {/* Corps défilant */}
            <div className="flex-1 overflow-y-auto p-5 bg-slate-100/50 space-y-5">
              {/* Rendu du ticket via ReceiptView */}
              <div className="flex justify-center">
                <ReceiptView
                  sale={inspectingSale}
                  settings={settings}
                  isMerchantCopy={drawerMerchantCopy}
                  customerTotalDebt={
                    customers.find((c) => c.name === inspectingSale.customerName)?.totalDebt ||
                    (inspectingSale.remainingAmount > 0 ? inspectingSale.remainingAmount : 0)
                  }
                />
              </div>

              {/* Historique des envois pour ce reçu */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Historique des transmissions</span>
                </h4>

                {(deliveriesBySaleId.get(inspectingSale.id) || []).length === 0 ? (
                  <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Ce reçu n'a encore jamais été transmis ou imprimé pour le client.
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(deliveriesBySaleId.get(inspectingSale.id) || []).map((del) => (
                      <div
                        key={del.id}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-6 h-6 rounded-md flex items-center justify-center text-white ${
                              del.canal === 'WHATSAPP'
                                ? 'bg-[#25D366]'
                                : del.canal === 'IMPRESSION'
                                ? 'bg-sky-600'
                                : 'bg-slate-700'
                            }`}
                          >
                            {del.canal === 'WHATSAPP' ? (
                              <Share2 className="w-3.5 h-3.5" />
                            ) : del.canal === 'IMPRESSION' ? (
                              <Printer className="w-3.5 h-3.5" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </span>
                          <div>
                            <div className="font-semibold text-slate-800">
                              {del.canal === 'WHATSAPP'
                                ? 'Envoyé sur WhatsApp'
                                : del.canal === 'IMPRESSION'
                                ? 'Imprimé sur papier'
                                : del.canal === 'COPIE_TEXTE'
                                ? 'Texte copié'
                                : 'PDF téléchargé'}
                            </div>
                            <div className="text-[10.5px] text-slate-400">
                              Par {del.userName || 'Commerçant'}
                            </div>
                          </div>
                        </div>
                        <span className="text-[10.5px] text-slate-500 font-mono">
                          {formatDate(del.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions Footer Drawer */}
            <div className="p-4 bg-white border-t border-slate-200 space-y-2">
              <button
                onClick={() => handleWhatsAppSingle(inspectingSale)}
                className="w-full py-2.5 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Renvoyer sur WhatsApp</span>
              </button>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handlePrintSingle(inspectingSale)}
                  disabled={isProcessingPdf}
                  className="py-2 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Réimprimer</span>
                </button>

                <button
                  onClick={() => handleDownloadSingle(inspectingSale)}
                  disabled={isProcessingPdf}
                  className="py-2 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5 text-slate-600" />
                  <span>PDF</span>
                </button>

                <button
                  onClick={async () => {
                    try {
                      await copyReceiptToClipboard(inspectingSale, settings, (canal) => {
                        recordReceiptDelivery(inspectingSale.id, canal, inspectingSale.reference);
                      });
                      setDrawerCopied(true);
                      showToast('Texte copié !', 'success');
                      setTimeout(() => setDrawerCopied(false), 2000);
                    } catch {
                      showToast('Erreur copie', 'error');
                    }
                  }}
                  className="py-2 px-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {drawerCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copié</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-600" />
                      <span>Copier texte</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
