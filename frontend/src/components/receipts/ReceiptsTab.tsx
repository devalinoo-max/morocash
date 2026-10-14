import React, { useState, useMemo } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import { KpiCard, MC_EASE, Segmented, TrialPill, staggerParent } from '../sales/SalesKit';
import {
  FileText,
  Search,
  SlidersHorizontal,
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
import { ReceiptPreview } from './ReceiptPreview';
import { PrintReceiptModal } from './PrintReceiptModal';
import { WhatsAppRecipientModal, type ReceiptRecipient } from './WhatsAppRecipientModal';
import { downloadReceiptsPdf, receiptErrorMessage } from '../../utils/receiptHelpers';
import { getCustomRange, isWithinRange, toDateInputValue } from '../../utils/period';
import { DateRangeInputs, DATE_RANGE_LABEL } from '../common/DateRangeInputs';
import type { Versement } from '../../types';
import { versementsOfSale } from '../../utils/versements';
import { VersementRow } from '../payments/VersementRow';
import { VersementReceiptModal } from '../payments/VersementReceiptModal';

type PeriodFilter = 'today' | 'week' | 'month' | 'range' | 'all';
type StateFilter = 'ALL' | 'SENT' | 'UNSENT' | 'PAID' | 'REMAINING';

export const ReceiptsTab: React.FC = () => {
  const {
    sales,
    customers,
    settings,
    receiptDeliveries,
    recordReceiptDelivery,
    showToast,
    pendingVersements,
    openOrder,
  } = useApp();

  const [versementOuvert, setVersementOuvert] = useState<Versement | null>(null);
  const [filtresOuverts, setFiltresOuverts] = useState(false);
  const [vue, setVue] = useState<'orders' | 'payments'>('orders');

  // Filters state
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [rangeStart, setRangeStart] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [rangeEnd, setRangeEnd] = useState(() => toDateInputValue(new Date()));
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Drawer / Inspection state
  const [inspectingSale, setInspectingSale] = useState<Sale | null>(null);
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  // Actions rapides d'une ligne ou d'une sélection : mêmes fenêtres que le
  // reçu après une vente (WhatsApp demande à qui, impression en 5 formats).
  const [whatsAppSale, setWhatsAppSale] = useState<Sale | null>(null);
  const [printingSales, setPrintingSales] = useState<Sale[] | null>(null);

  // 1. Filter sales based on Role & Permissions
  const roleFilteredSales = useMemo(() => {
    if (settings.role === 'SELLER') {
      const sellerName = settings.currentSellerName || settings.ownerName || 'Vendeur';
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
      if (period === 'range') {
        const range = getCustomRange(rangeStart, rangeEnd);
        if (range && !isWithinRange(sale.createdAt, range)) return false;
      }

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
      // Une commande annulée n'est ni soldée ni en attente de paiement.
      if (stateFilter === 'PAID' && (sale.isCancelled || sale.remainingAmount > 0)) return false;
      if (stateFilter === 'REMAINING' && (sale.isCancelled || sale.remainingAmount <= 0)) return false;

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
    rangeStart,
    rangeEnd,
    selectedSeller,
    selectedCustomerId,
    stateFilter,
    searchQuery,
    settings.role,
    deliveriesBySaleId,
  ]);

  // 4. Calculate Key Indicators
  // Reçus de versement : un par versement reçu après la commande (le paiement
  // fait à la commande figure, lui, sur le reçu de la commande). Mêmes filtres
  // de période, de client, de vendeur et de recherche que les reçus de commande.
  const versementReceipts = useMemo(() => {
    if (stateFilter !== 'ALL') return [];
    const now = new Date();
    const debut =
      period === 'today'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
        : period === 'week'
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime()
        : period === 'month'
        ? new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        : 0;
    const range = period === 'range' ? getCustomRange(rangeStart, rangeEnd) : null;
    const moi = (settings.currentSellerName || settings.ownerName || '').toLowerCase().trim();
    const query = searchQuery.toLowerCase().trim();

    return [...pendingVersements, ...sales.flatMap(versementsOfSale).filter((v) => !v.atOrder)]
      .filter((v) => {
        if (new Date(v.createdAt).getTime() < debut) return false;
        if (range && !isWithinRange(v.createdAt, range)) return false;
        const auteur = (v.collectedBy || '').toLowerCase().trim();
        if (settings.role === 'SELLER' && !v.isPending && auteur !== moi) return false;
        if (settings.role !== 'SELLER' && selectedSeller !== 'ALL' && v.collectedBy !== selectedSeller) return false;
        if (
          selectedCustomerId !== 'ALL' &&
          v.customerId !== selectedCustomerId &&
          (v.customerName || '').toLowerCase() !== selectedCustomerId.toLowerCase()
        ) {
          return false;
        }
        if (!query) return true;
        return [v.receiptNumber, v.orderReference, v.customerName, v.customerPhone].some(
          (champ) => Boolean(champ) && String(champ).toLowerCase().includes(query)
        );
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [
    sales,
    pendingVersements,
    period,
    rangeStart,
    rangeEnd,
    stateFilter,
    selectedSeller,
    selectedCustomerId,
    searchQuery,
    settings.role,
    settings.currentSellerName,
    settings.ownerName,
  ]);

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
  const debtsFor = (list: Sale[]): Record<string, number> =>
    Object.fromEntries(
      list.map((sale) => {
        const customer =
          customers.find((c) => c.id === sale.customerId) ?? customers.find((c) => c.name === sale.customerName);
        return [sale.id, customer ? customer.totalDebt : Math.max(0, sale.remainingAmount)];
      })
    );

  const handleWhatsAppSingle = (sale: Sale) => setWhatsAppSale(sale);

  const handlePrintSingle = (sale: Sale) => setPrintingSales([sale]);

  const handleDownloadSingle = async (sale: Sale) => {
    setIsProcessingPdf(true);
    try {
      await downloadReceiptsPdf([sale], settings, { isMerchantCopy: false, customerDebts: debtsFor([sale]) }, (canal) => {
        recordReceiptDelivery(sale.id, canal, sale.reference);
      });
      showToast('Téléchargement du reçu PDF en cours', 'success');
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Téléchargement impossible', err), 'error');
    } finally {
      setIsProcessingPdf(false);
    }
  };

  // Bulk Actions
  const handleBulkPrint = () => {
    if (selectedSalesList.length === 0) return;
    setPrintingSales(selectedSalesList);
  };

  const handleBulkDownload = async () => {
    if (selectedSalesList.length === 0) return;
    setIsProcessingPdf(true);
    try {
      await downloadReceiptsPdf(selectedSalesList, settings, { isMerchantCopy: false, customerDebts: debtsFor(selectedSalesList) }, (canal) => {
        selectedSalesList.forEach((s) => recordReceiptDelivery(s.id, canal, s.reference));
      });
      showToast(`Téléchargement de ${selectedSalesList.length} reçus`, 'success');
    } catch (err) {
      console.error(err);
      showToast(receiptErrorMessage('Téléchargement groupé impossible', err), 'error');
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
      'Statut',
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
        sale.isCancelled ? 0 : sale.remainingAmount,
        `"${sale.paymentMethod}"`,
        `"${statusEnvoi}"`,
        `"${canal}"`,
        `"${sale.isCancelled ? 'Annulée' : sale.remainingAmount > 0 ? 'Reste à payer' : 'Soldée'}"`,
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

  // Plus aucun reçu de paiement dans le filtre : on retombe sur les commandes,
  // jamais sur un écran vide.
  const vueAffichee = versementReceipts.length === 0 ? 'orders' : vue;

  // Sur téléphone, les listes déroulantes sont repliées : un filtre actif doit
  // alors rester annoncé sur le bouton, sinon il manque des reçus sans raison visible.
  const nbFiltresActifs =
    (stateFilter !== 'ALL' ? 1 : 0) + (selectedCustomerId !== 'ALL' ? 1 : 0) + (selectedSeller !== 'ALL' ? 1 : 0);

  const selectClass =
    'w-full h-11 px-4 text-[14px] rounded-full bg-white border border-mc-line focus:border-mc-primary focus:ring-1 focus:ring-mc-primary outline-hidden text-mc-ink font-medium cursor-pointer';

  return (
    <div className="font-jakarta text-mc-ink space-y-4 md:space-y-6 pb-20">
      <MotionConfig reducedMotion="user">
      {/* 1. EN-TÊTE — sur téléphone le titre est déjà dans la barre haute */}
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 hidden md:block">
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">Mes reçus</h1>
            <TrialPill />
          </div>
          <p className="text-[14px] text-mc-soft">Historique et réémission des reçus clients</p>
        </div>
        <div className="md:hidden">
          <TrialPill />
        </div>

        <button
          id="btn-export-receipts-csv"
          onClick={handleExportCSV}
          className="hidden md:inline-flex ml-auto h-10 px-4 rounded-full border border-mc-line bg-white text-[14px] font-semibold items-center gap-2 cursor-pointer hover:border-mc-primary hover:text-mc-primary transition-all duration-200 active:scale-[0.97]"
        >
          <Download className="w-4 h-4" />
          <span>Exporter</span>
        </button>
      </header>

      {/* 2. INDICATEURS CLÉS — la flèche de chaque carte filtre la liste */}
      <motion.div
        variants={staggerParent}
        initial="hidden"
        animate="show"
        className="grid grid-cols-3 gap-2 md:gap-4"
      >
        <KpiCard
          compact
          featured
          label="Reçus émis"
          value={metrics.totalIssued}
          hint={<span className="hidden md:inline">Commandes de la période</span>}
          onOpen={() => setStateFilter('ALL')}
          openLabel="Afficher tous les reçus"
        />
        <KpiCard
          compact
          label="Envoyés"
          value={metrics.sentCount}
          badge={
            <span
              className={`px-2 py-0.5 rounded-full text-[12px] font-bold tabular-nums ${
                metrics.sentPercent > 0 ? 'bg-mc-success-bg text-[#15803D]' : 'bg-mc-bg text-mc-soft'
              }`}
            >
              {metrics.sentPercent} %
            </span>
          }
          hint={<span className="hidden md:inline">{metrics.whatsappCount} sur WhatsApp</span>}
          onOpen={() => setStateFilter('SENT')}
          openLabel="N’afficher que les reçus envoyés"
        />
        <KpiCard
          compact
          label="Jamais envoyés"
          value={metrics.unsentCount}
          tone={metrics.unsentCount > 0 ? 'warning' : 'default'}
          hint={<span className="hidden md:inline">Le client n'a rien reçu</span>}
          onOpen={() => setStateFilter('UNSENT')}
          openLabel="N’afficher que les reçus jamais envoyés"
        />
      </motion.div>

      {/* 3. FILTRES ET RECHERCHE */}
      <div className="space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <Segmented<PeriodFilter>
            id="btn-receipts-period"
            label="Période"
            value={period}
            onChange={setPeriod}
            options={
              [
                { id: 'today', label: "Aujourd'hui" },
                { id: 'week', label: 'Cette semaine' },
                { id: 'month', label: 'Ce mois' },
                { id: 'range', label: DATE_RANGE_LABEL },
                { id: 'all', label: 'Tout' },
              ] as const
            }
          />
          <div className="flex flex-wrap items-center gap-3">
            {period === 'range' && (
              <DateRangeInputs
                id="receipts-range"
                start={rangeStart}
                end={rangeEnd}
                onStartChange={setRangeStart}
                onEndChange={setRangeEnd}
              />
            )}
            <span className="text-[14px] text-mc-soft">
              <span className="font-bold text-mc-ink tabular-nums">{filteredSales.length}</span> reçu
              {filteredSales.length > 1 ? 's' : ''} trouvé
              {filteredSales.length > 1 ? 's' : ''}
            </span>
            {/* Téléphone : les trois listes déroulantes se rangent derrière
                « Filtres », la recherche reste visible. */}
            <button
              id="btn-receipts-filters"
              type="button"
              aria-expanded={filtresOuverts}
              onClick={() => setFiltresOuverts((o) => !o)}
              className={`md:hidden ml-auto h-9 px-3 rounded-full border text-[14px] font-semibold inline-flex items-center gap-1.5 cursor-pointer active:scale-[0.97] ${
                nbFiltresActifs > 0
                  ? 'bg-mc-primary-tint border-mc-primary text-mc-primary-dark'
                  : 'bg-white border-mc-line text-mc-ink'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtres{nbFiltresActifs > 0 ? ` (${nbFiltresActifs})` : ''}
            </button>
            <button
              type="button"
              aria-label="Exporter"
              onClick={handleExportCSV}
              className="md:hidden w-9 h-9 rounded-full border border-mc-line bg-white inline-flex items-center justify-center cursor-pointer active:scale-[0.97]"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          className={`grid grid-cols-2 lg:grid-cols-4 gap-3 [&>*:nth-child(-n+2)]:col-span-2 lg:[&>*:nth-child(-n+2)]:col-span-1 ${
            filtresOuverts ? '' : 'max-md:[&>*:nth-child(n+2)]:hidden'
          }`}
        >
          {/* Recherche texte */}
          <div className="relative">
            <Search className="w-4 h-4 text-mc-soft absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="search-receipts"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="N° reçu, client, téléphone..."
              className="w-full h-11 pl-11 pr-9 text-[14px] rounded-full bg-white border border-mc-line focus:border-mc-primary focus:ring-1 focus:ring-mc-primary outline-hidden transition-all text-mc-ink placeholder:text-mc-soft/70"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Effacer la recherche"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-mc-soft hover:text-mc-ink p-0.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtre État */}
          <select
            id="filter-receipt-state"
            aria-label="État du reçu"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
            className={selectClass}
          >
            <option value="ALL">Tous les états</option>
            <option value="SENT">Envoyés au client</option>
            <option value="UNSENT">Jamais envoyés</option>
            <option value="PAID">Soldés intégralement</option>
            <option value="REMAINING">Avec reste à payer</option>
          </select>

          {/* Filtre Client */}
          <select
            id="filter-receipt-customer"
            aria-label="Client"
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            className={selectClass}
          >
            <option value="ALL">Tous les clients</option>
            {customers.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Filtre Vendeur (Propriétaire uniquement) */}
          {settings.role !== 'SELLER' ? (
            <select
              id="filter-receipt-seller"
              aria-label="Vendeur"
              value={selectedSeller}
              onChange={(e) => setSelectedSeller(e.target.value)}
              className={selectClass}
            >
              <option value="ALL">Tous les vendeurs</option>
              {distinctSellers.map((seller) => (
                <option key={seller} value={seller}>
                  {seller}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center h-11 px-4 bg-white rounded-full border border-mc-line text-[14px] text-mc-soft">
              <User className="w-4 h-4 mr-2" />
              <span className="truncate">Mes reçus ({settings.currentSellerName || 'Vendeur'})</span>
            </div>
          )}
        </div>
      </div>

      {/* Deux sortes de reçus, une seule à l'écran : les reçus de commande
          d'abord, ceux des versements derrière le second onglet. Empilés, les
          versements obligeaient à défiler avant de voir le premier reçu. */}
      {versementReceipts.length > 0 && (
        <Segmented<'orders' | 'payments'>
          id="btn-receipts-view"
          label="Sorte de reçus"
          tone="ink"
          value={vueAffichee}
          onChange={setVue}
          options={[
            { id: 'orders', label: 'Reçus de commande', count: filteredSales.length },
            { id: 'payments', label: 'Reçus de versement', count: versementReceipts.length },
          ]}
        />
      )}

      {/* REÇUS DE PAIEMENT — un par versement, ouvert d'un tap */}
      {vueAffichee === 'payments' && versementReceipts.length > 0 && (
        <section id="versement-receipts">
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="text-[16px] font-bold">Reçus de versement</h2>
            <span className="text-[12px] font-medium text-mc-soft">
              {versementReceipts.length} reçu{versementReceipts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {versementReceipts.map((v) => (
              <VersementRow
                key={v.id}
                versement={v}
                showCustomer
                inline
                onOpenReceipt={setVersementOuvert}
                onOpenOrder={openOrder}
              />
            ))}
          </div>
        </section>
      )}

      {versementOuvert && (
        <VersementReceiptModal versement={versementOuvert} onClose={() => setVersementOuvert(null)} />
      )}

      {/* 4. LISTE GROUPÉE PAR JOUR */}
      {vueAffichee === 'orders' && (filteredSales.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: MC_EASE }}
          className="bg-white rounded-mc border border-mc-line shadow-mc-card px-6 py-12 text-center"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-mc-primary-tint text-mc-primary flex items-center justify-center mb-4">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-[20px] font-extrabold">Aucun reçu sur cette période</h3>
          <p className="text-[14px] text-mc-soft max-w-sm mx-auto mt-1">
            Modifie tes filtres ou enregistre une nouvelle commande pour générer des reçus.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-6">
          {groupedSales.map((group) => {
            const allGroupSelected =
              group.items.length > 0 && group.items.every((it) => selectedIds.has(it.id));
            return (
              <section key={group.label}>
                {/* En-tête de date du groupe, avec la case « tout le jour » */}
                <div className="flex items-center gap-3 px-1 pb-2">
                  <input
                    type="checkbox"
                    aria-label={`Sélectionner tous les reçus — ${group.label}`}
                    checked={allGroupSelected}
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        group.items.forEach((it) => {
                          if (allGroupSelected) next.delete(it.id);
                          else next.add(it.id);
                        });
                        return next;
                      });
                    }}
                    className="hidden md:block w-4 h-4 rounded accent-[#5B4BF0] cursor-pointer"
                  />
                  <h2 className="text-[16px] font-bold">{group.label}</h2>
                  <span className="text-[12px] font-medium text-mc-soft">
                    {group.items.length} reçu{group.items.length > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-2">
                  {group.items.map((sale) => {
                    const isSelected = selectedIds.has(sale.id);
                    const lastDelivery = (deliveriesBySaleId.get(sale.id) || [])[0];
                    const nom = sale.customerName?.trim() || 'Client de passage';

                    return (
                      <div
                        key={sale.id}
                        className={`mc-lift rounded-2xl border px-3 md:px-4 py-3 ${
                          isSelected ? 'bg-mc-primary-tint/60 border-mc-primary' : 'bg-white border-mc-line'
                        }`}
                      >
                        {/* TÉLÉPHONE — une carte par reçu, rien hors de l'écran */}
                        <div className="md:hidden flex gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(sale.id)}
                            aria-label={`Sélectionner le reçu ${sale.reference}`}
                            className="mt-1 w-4 h-4 shrink-0 rounded accent-[#5B4BF0] cursor-pointer"
                          />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                onClick={() => setInspectingSale(sale)}
                                className="min-w-0 text-left cursor-pointer"
                              >
                                <span className="block font-bold text-[14px] truncate">{nom}</span>
                                <span className="block font-mono text-[12px] font-bold text-mc-primary-dark break-all">
                                  {sale.reference}
                                </span>
                              </button>
                              <span className="shrink-0 font-extrabold text-[16px] tabular-nums">
                                {formatMoney(sale.totalAmount)}
                              </span>
                            </div>

                            <p className="text-[12px] text-mc-soft truncate">
                              <span className="font-mono">{formatShortDate(sale.createdAt)}</span>
                              {' · '}
                              {getArticlesSummary(sale)}
                            </p>
                            <p className="text-[12px] text-mc-soft/80 truncate">
                              {sale.customerPhone ? `${sale.customerPhone} · ` : ''}
                              Vendu par {sale.sellerName || 'Vendeur'}
                            </p>

                            <div className="flex items-center justify-between gap-2 pt-0.5">
                              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                <PaymentBadge sale={sale} />
                                <DeliveryBadge delivery={lastDelivery} />
                              </div>
                              <div className="flex items-center shrink-0 -mr-2">
                                <ReceiptActions
                                  size="md"
                                  onWhatsApp={() => handleWhatsAppSingle(sale)}
                                  onPrint={() => handlePrintSingle(sale)}
                                  onDownload={() => handleDownloadSingle(sale)}
                                  onView={() => setInspectingSale(sale)}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* ORDINATEUR — une ligne : mêmes informations que l'ancien tableau */}
                        <div className="hidden md:flex items-center gap-4">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(sale.id)}
                            aria-label={`Sélectionner le reçu ${sale.reference}`}
                            className="w-4 h-4 shrink-0 rounded accent-[#5B4BF0] cursor-pointer"
                          />
                          <button
                            onClick={() => setInspectingSale(sale)}
                            className="flex-1 basis-0 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                          >
                            <span
                              className="w-10 h-10 rounded-full text-white font-bold text-[14px] flex items-center justify-center shrink-0"
                              style={{ backgroundColor: avatarColor(nom) }}
                              aria-hidden="true"
                            >
                              {avatarInitials(nom)}
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[14px] font-bold truncate">
                                {nom}
                                {sale.customerPhone && (
                                  <span className="ml-2 text-[12px] font-mono font-normal text-mc-soft">
                                    {sale.customerPhone}
                                  </span>
                                )}
                              </span>
                              <span className="block text-[12px] text-mc-soft truncate">
                                <span className="font-mono font-bold text-mc-primary-dark">{sale.reference}</span>
                                {' · '}
                                <span className="font-mono">{formatShortDate(sale.createdAt)}</span>
                                {' · '}
                                {sale.sellerName || 'Vendeur'}
                              </span>
                            </span>
                          </button>

                          <div
                            className="hidden xl:block w-[24%] shrink-0 min-w-0 text-[14px] text-mc-soft truncate"
                            title={sale.items.map((it) => `${it.name} (${it.quantity})`).join(', ')}
                          >
                            {getArticlesSummary(sale)}
                          </div>

                          <div className="w-28 shrink-0 text-right text-[16px] font-extrabold tabular-nums whitespace-nowrap">
                            {formatMoney(sale.totalAmount)}
                          </div>

                          <div className="hidden lg:flex w-[232px] shrink-0 items-center gap-1.5">
                            <PaymentBadge sale={sale} />
                            <DeliveryBadge delivery={lastDelivery} />
                          </div>

                          <div className="flex items-center justify-end gap-1 shrink-0">
                            <ReceiptActions
                              size="sm"
                              onWhatsApp={() => handleWhatsAppSingle(sale)}
                              onPrint={() => handlePrintSingle(sale)}
                              onDownload={() => handleDownloadSingle(sale)}
                              onView={() => setInspectingSale(sale)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ))}
      </MotionConfig>

      {/* 5. BARRE FLOTTANTE SÉLECTION MULTIPLE */}
      {selectedIds.size > 0 && (
        // Sur téléphone, au-dessus de la barre de navigation du bas (sinon ses
        // boutons passaient dessous, hors d'atteinte).
        <div className="fixed bottom-24 inset-x-3 md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2 z-40 bg-mc-ink text-white px-4 md:px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-x-4 gap-y-2 flex-wrap animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2 pr-2 md:border-r border-slate-700">
            <span className="w-6 h-6 rounded-full bg-[#5B4BF0] text-white text-xs font-bold flex items-center justify-center">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold">reçus sélectionnés</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleBulkPrint}
              disabled={isProcessingPdf}
              className="px-3 py-1.5 bg-mc-primary hover:bg-mc-primary-dark active:bg-mc-primary-dark text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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
            <ReceiptPreview sale={inspectingSale} onClose={() => setInspectingSale(null)}>
              {/* Historique des envois pour ce reçu */}
              <div className="bg-white p-4 rounded-xl border border-mc-line shadow-2xs space-y-2.5">
                <h4 className="text-xs font-bold text-mc-ink uppercase tracking-wider flex items-center gap-1.5">
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
                        className="p-2.5 rounded-lg bg-slate-50 border border-mc-line flex items-center justify-between text-xs"
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
                            <div className="font-semibold text-mc-ink">
                              {del.canal === 'WHATSAPP'
                                ? del.destinataireNom
                                  ? `Envoyé sur WhatsApp à ${del.destinataireNom}`
                                  : 'Envoyé sur WhatsApp'
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
                        <span className="text-[10.5px] text-mc-soft font-mono">
                          {formatDate(del.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ReceiptPreview>
          </div>
        </div>
      )}

      {whatsAppSale && (
        <WhatsAppRecipientModal
          sale={whatsAppSale}
          customer={
            customers.find((c) => c.id === whatsAppSale.customerId) ??
            customers.find((c) => c.name === whatsAppSale.customerName)
          }
          onClose={() => setWhatsAppSale(null)}
          onSent={(recipient: ReceiptRecipient) => {
            recordReceiptDelivery(whatsAppSale.id, 'WHATSAPP', whatsAppSale.reference, {
              nom: recipient.nom,
              telephone: recipient.telephone,
            });
            showToast(recipient.confirmation, 'success');
            setWhatsAppSale(null);
          }}
        />
      )}

      {printingSales && (
        <PrintReceiptModal
          sales={printingSales}
          isMerchantCopy={false}
          customerDebts={debtsFor(printingSales)}
          onClose={() => setPrintingSales(null)}
          onPrinted={() =>
            printingSales.forEach((s) => recordReceiptDelivery(s.id, 'IMPRESSION', s.reference))
          }
        />
      )}
    </div>
  );
};

// Pastilles et actions partagées par le tableau (écran large) et les cartes (téléphone).

const PaymentBadge: React.FC<{ sale: Sale }> = ({ sale }) =>
  sale.isCancelled ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
      Annulée
    </span>
  ) : sale.remainingAmount > 0 ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
      Reste {formatMoney(sale.remainingAmount)}
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
      Soldé
    </span>
  );

const DeliveryBadge: React.FC<{ delivery?: ReceiptDelivery }> = ({ delivery }) => {
  if (!delivery) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium bg-slate-100 text-mc-soft border border-mc-line whitespace-nowrap">
        Non envoyé
      </span>
    );
  }
  if (delivery.canal === 'WHATSAPP') {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#25D366]/15 text-[#1e9249] border border-[#25D366]/30"
        title={`Envoyé le ${formatDate(delivery.createdAt)} par ${delivery.userName || 'l’équipe'}`}
      >
        <Send className="w-3 h-3" />
        <span>WhatsApp</span>
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-sky-50 text-sky-700 border border-sky-200"
      title={`Imprimé le ${formatDate(delivery.createdAt)}`}
    >
      <Printer className="w-3 h-3" />
      <span>Imprimé</span>
    </span>
  );
};

/** `md` : cibles de 36 px, touchables au doigt sur téléphone. */
const ReceiptActions: React.FC<{
  size: 'sm' | 'md';
  onWhatsApp: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onView: () => void;
}> = ({ size, onWhatsApp, onPrint, onDownload, onView }) => {
  const box = size === 'md' ? 'w-9 h-9 rounded-xl' : 'w-7 h-7 rounded-lg';
  const icon = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  const base = `${box} flex items-center justify-center transition-colors cursor-pointer`;
  return (
    <>
      <button
        onClick={onWhatsApp}
        title="Envoyer par WhatsApp"
        aria-label="Envoyer par WhatsApp"
        className={`${base} text-emerald-600 hover:bg-emerald-50`}
      >
        <Share2 className={icon} />
      </button>
      <button
        onClick={onPrint}
        title="Imprimer le reçu (PDF)"
        aria-label="Imprimer le reçu"
        className={`${base} text-slate-600 hover:bg-slate-100`}
      >
        <Printer className={icon} />
      </button>
      <button
        onClick={onDownload}
        title="Télécharger le reçu PDF"
        aria-label="Télécharger le reçu PDF"
        className={`${base} text-slate-600 hover:bg-slate-100`}
      >
        <Download className={icon} />
      </button>
      <button
        onClick={onView}
        title="Voir l'aperçu complet"
        aria-label="Voir l'aperçu complet"
        className={`${base} text-mc-primary hover:bg-mc-primary-tint`}
      >
        <Eye className={icon} />
      </button>
    </>
  );
};
