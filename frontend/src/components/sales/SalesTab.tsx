import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Receipt,
  Search,
  Calendar,
  MoreHorizontal,
  Eye,
  MessageCircle,
  Ban,
  FileSpreadsheet,
  FileText,
  Banknote,
  X,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { formatMoney, formatDate, formatShortDate } from '../../utils/formatters';
import { Sale } from '../../types';
import { countLabel } from '../../utils/plural';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import { saleStatusStyle } from '../../utils/saleStatus';
import { usePageMenu } from '../../context/PageMenuContext';
import { buildReceiptMessage, openWhatsApp } from '../../utils/saleMessages';
import { SaleCard } from './SaleCard';
import { OrderDetailPanel } from './OrderDetailPanel';
import { CancelOrderDialog } from './CancelOrderDialog';
import { CollectRemainingModal } from './CollectRemainingModal';
import {
  computePeriodInterval,
  countByStatus,
  filterSales,
  sumSales,
  type PeriodFilter,
  type StatusFilter,
} from '../../utils/salesFilters';

/** Le commerçant vient voir sa journée, pas son mois. */
const PERIODE_PAR_DEFAUT: PeriodFilter = 'today';

export const SalesTab: React.FC = () => {
  const {
    sales,
    customers,
    setSelectedSaleForReceipt,
    recordReceiptDelivery,
    cancelSale,
    collectSalePayment,
    assignCustomerToSale,
    attemptNewSale,
    settings,
    showToast,
    hasLoadedOnce,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>(PERIODE_PAR_DEFAUT);
  const [selectedSeller, setSelectedSeller] = useState<string>('ALL');

  // Période libre : repliée par défaut, elle ne vole pas la rangée des quatre
  // raccourcis que tout le monde utilise.
  const todayObj = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const [customStart, setCustomStart] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(todayObj.toISOString().slice(0, 10));

  // Une seule commande à la fois est « ouverte », quelle que soit la forme :
  // détail plein écran, feuille d'actions, annulation, encaissement.
  const [saleOpened, setSaleOpened] = useState<Sale | null>(null);
  const [saleForActions, setSaleForActions] = useState<Sale | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const [saleToCollect, setSaleToCollect] = useState<Sale | null>(null);

  const [saleForCustomerAssign, setSaleForCustomerAssign] = useState<Sale | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

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

  // Le nom du vendeur n'encombre les cartes que si la boutique en a plusieurs.
  const sellerNames = useMemo(() => {
    const set = new Set<string>();
    baseSales.forEach((s) => {
      if (s.sellerName) set.add(s.sellerName);
    });
    return Array.from(set);
  }, [baseSales]);

  // Période, filtrage et compteurs vivent dans utils/salesFilters.ts : ce sont
  // eux qui décident ce que le commerçant voit et quel total s'affiche en haut,
  // ils doivent donc être vérifiables hors de l'écran (tests/vente).
  const dateInterval = useMemo(
    () => computePeriodInterval(periodFilter, customStart, customEnd),
    [periodFilter, customStart, customEnd]
  );

  const statusCounts = useMemo(
    () => countByStatus(baseSales, dateInterval),
    [baseSales, dateInterval]
  );

  const filteredSales = useMemo(
    () =>
      filterSales(baseSales, {
        interval: dateInterval,
        status: statusFilter,
        seller: selectedSeller,
        query: searchQuery,
      }),
    [baseSales, dateInterval, statusFilter, selectedSeller, searchQuery]
  );

  const activeSales = useMemo(() => filteredSales.filter((s) => !s.isCancelled), [filteredSales]);
  const totalFilteredSum = useMemo(() => sumSales(filteredSales), [filteredSales]);
  const totalRemainingSum = useMemo(
    () => activeSales.reduce((sum, s) => sum + (s.remainingAmount || 0), 0),
    [activeSales]
  );

  const filtresActifs =
    searchQuery.trim() !== '' ||
    statusFilter !== 'ALL' ||
    selectedSeller !== 'ALL' ||
    periodFilter !== PERIODE_PAR_DEFAUT;

  // Point 9: GROUPE PAR JOUR
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
          });
          label = fullStr.charAt(0).toUpperCase() + fullStr.slice(1);
        }

        groups.set(dayKey, { dateKey: dayKey, label, sales: [] });
      }
      groups.get(dayKey)!.sales.push(sale);
    }

    return Array.from(groups.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [filteredSales]);

  const resetAllFilters = () => {
    setSearchQuery('');
    setStatusFilter('ALL');
    setPeriodFilter(PERIODE_PAR_DEFAUT);
    setSelectedSeller('ALL');
  };

  const envoyerRecu = (sale: Sale) => {
    openWhatsApp(sale.customerPhone, buildReceiptMessage(sale, settings.shopName));
    recordReceiptDelivery(sale.id, 'WHATSAPP', sale.reference);
  };

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
      const statusStr = saleStatusStyle(s).label;

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
      '﻿' + [headers.join(';'), ...rows.map((row) => row.join(';'))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Commandes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export Excel/CSV téléchargé', 'success');
  };

  const handleExportPDF = () => window.print();

  /*
   * L'export part dans le menu « ••• » de la barre haute.
   *
   * C'est une action rare : elle ne mérite pas un bouton noir plus visible que
   * les commandes elles-mêmes, et la carte blanche qui le portait coûtait à
   * elle seule la première commande de la liste.
   */
  usePageMenu([
    {
      id: 'export-pdf',
      label: 'Imprimer / PDF',
      icon: FileText,
      disabled: filteredSales.length === 0,
      onSelect: handleExportPDF,
    },
    {
      id: 'export-csv',
      label: 'Exporter Excel (.csv)',
      icon: FileSpreadsheet,
      disabled: filteredSales.length === 0,
      onSelect: handleExportExcel,
    },
  ]);

  const filteredCustomersForAssign = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, customerSearch]);

  const chargementInitial = !hasLoadedOnce && baseSales.length === 0;

  return (
    <div
      id="sales-tab-content"
      className="space-y-3 md:space-y-5 pb-20 max-w-[1440px] mx-auto animate-in fade-in duration-200"
    >
      {/* =====================================================================
          FILTRES — période, statut, recherche
          La carte blanche « Mes commandes » et son gros bouton Exporter ont
          disparu : elles coûtaient environ 270 px, soit six commandes qu'il
          fallait aller chercher au défilement sur une page ouverte dix fois
          par jour.
          ===================================================================== */}
      <div className="md:bg-white md:p-5 md:rounded-2xl md:border md:border-slate-200/80 md:shadow-xs space-y-2.5">
        {/* Recherche */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cherche un client, un produit, un n°…"
            className="w-full h-10 pl-10 pr-4 rounded-full bg-white md:bg-slate-50 border border-slate-200 text-[13px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:bg-white transition-all"
          />
        </div>

        {/* Période : quatre raccourcis de largeur égale, jamais coupés */}
        <div className="grid grid-cols-4 gap-1.5">
          {(
            [
              { id: 'today', label: "Aujourd'hui" },
              { id: '7days', label: '7 jours' },
              { id: '30days', label: '30 jours' },
              { id: 'thisMonth', label: 'Ce mois' },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriodFilter(p.id)}
              className={`h-[38px] rounded-xl text-[11.5px] font-bold transition-all cursor-pointer ${
                periodFilter === p.id
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'bg-white md:bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Statuts : la seule rangée qui défile, et elle l'annonce par son
            dégradé de bord droit. */}
        <div className="filter-pill-row flex items-center gap-1.5 overflow-x-auto scrollbar-none -mx-1 px-1 py-0.5">
          {(
            [
              { id: 'ALL', label: `Toutes (${statusCounts.ALL})` },
              { id: 'PAID', label: `Payées (${statusCounts.PAID})` },
              { id: 'PARTIAL', label: `Payées en partie (${statusCounts.PARTIAL})` },
              { id: 'CREDIT', label: `Pas payées (${statusCounts.CREDIT})` },
              { id: 'CANCELLED', label: `Annulées (${statusCounts.CANCELLED})` },
            ] as const
          ).map((st) => {
            const active = statusFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStatusFilter(st.id)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-[11.5px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white md:bg-slate-100 border border-slate-200 md:border-transparent text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            );
          })}
        </div>

        {/* Vendeur et période libre : deux réglages rares, repliés derrière une
            ligne discrète plutôt qu'affichés en permanence. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px]">
          <button
            type="button"
            onClick={() => setPeriodFilter(periodFilter === 'custom' ? PERIODE_PAR_DEFAUT : 'custom')}
            className="font-bold text-slate-500 hover:text-[#4F46E5] cursor-pointer"
          >
            {periodFilter === 'custom' ? 'Fermer la période libre' : 'Choisir une période libre'}
          </button>
          {sellerNames.length > 1 && (
            <label className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold">Vendu par</span>
              <select
                value={selectedSeller}
                onChange={(e) => setSelectedSeller(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-800 text-[11px] focus:outline-none focus:ring-2 focus:ring-[#4F46E5] cursor-pointer max-w-[45vw]"
              >
                <option value="ALL">Tous</option>
                {sellerNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {periodFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <span className="text-slate-500 font-medium">Du</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer min-w-0"
            />
            <span className="text-slate-500 font-medium">au</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer min-w-0"
            />
          </div>
        )}
      </div>

      {/* =====================================================================
          RÉSUMÉ DE LA PÉRIODE — une ligne, à la place de la carte blanche
          ===================================================================== */}
      <div className="h-10 px-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 flex items-center gap-2 text-[12px] min-w-0">
        <span className="font-bold text-slate-800 shrink-0">
          {countLabel(activeSales.length, 'commande')}
        </span>
        <span className="text-slate-300 shrink-0">·</span>
        <span className="text-slate-600 tabular-nums truncate">
          {formatMoney(totalFilteredSum)} vendus
        </span>
        {totalRemainingSum > 0 && (
          <>
            <span className="text-slate-300 shrink-0">·</span>
            <span className="text-[#DC2626] font-bold tabular-nums truncate">
              {formatMoney(totalRemainingSum)} à recevoir
            </span>
          </>
        )}
      </div>

      {/* =====================================================================
          LA LISTE
          ===================================================================== */}
      {chargementInitial ? (
        /* Trois cartes en squelette : une roue au milieu de l'écran ne dit pas
           ce qui arrive, ces gabarits si. */
        <div className="space-y-2" aria-busy="true" aria-label="Chargement des commandes">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-[14px] p-3 animate-pulse">
              <div className="flex items-center gap-2.5">
                <div className="w-[34px] h-[34px] rounded-full bg-slate-200 shrink-0" />
                <div className="h-3.5 bg-slate-200 rounded flex-1 max-w-[45%]" />
                <div className="h-4 w-20 bg-slate-200 rounded" />
              </div>
              <div className="mt-2.5 pl-[44px] h-3 bg-slate-100 rounded max-w-[60%]" />
            </div>
          ))}
        </div>
      ) : baseSales.length === 0 ? (
        /* Aucune commande n'a jamais été enregistrée. */
        <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
          <Receipt className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
          <h3 className="text-base font-extrabold text-slate-800">
            Aucune commande pour l’instant.
          </h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Dès que tu enregistres une vente, elle apparaît ici avec son montant et son statut.
          </p>
          <button
            type="button"
            onClick={attemptNewSale}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Enregistrer ma première commande</span>
          </button>
        </div>
      ) : filteredSales.length === 0 ? (
        /* Des commandes existent, mais pas dans ce filtre. */
        <div className="p-10 text-center bg-white rounded-3xl border border-slate-200 space-y-3">
          <Search className="w-12 h-12 mx-auto text-slate-300 stroke-[1.5]" />
          <h3 className="text-base font-extrabold text-slate-800">
            Aucune commande ne correspond à ce filtre.
          </h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            Vérifie la période, le statut ou les mots de ta recherche.
          </p>
          <button
            type="button"
            onClick={resetAllFilters}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            <span>Voir toutes les commandes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByDay.map((dayGroup) => {
            const dayTotal = dayGroup.sales
              .filter((s) => !s.isCancelled)
              .reduce((sum, s) => sum + s.totalAmount, 0);

            return (
              <div key={dayGroup.dateKey}>
                {/* Séparateur de journée, collant en haut au défilement :
                    on sait toujours quel jour on est en train de lire. */}
                <div className="sticky top-0 z-20 h-8 px-3 -mx-1 bg-[#F8FAFC] border-y border-slate-200/80 flex items-center gap-1.5 text-[11.5px] font-bold min-w-0">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:block" />
                  <span className="text-slate-900 shrink-0">{dayGroup.label}</span>
                  <span className="text-slate-300 shrink-0">·</span>
                  <span className="text-slate-500 shrink-0">
                    {countLabel(dayGroup.sales.length, 'commande')}
                  </span>
                  <span className="text-slate-300 shrink-0">·</span>
                  <span className="text-slate-700 tabular-nums truncate">
                    {formatMoney(dayTotal)}
                  </span>
                </div>

                {/* TÉLÉPHONE — des cartes, pas un tableau réduit. Rien n'est
                    hors de l'écran, donc rien ne peut être manqué. */}
                <div className="md:hidden space-y-2 mt-2">
                  {dayGroup.sales.map((sale) => (
                    <SaleCard
                      key={sale.id}
                      sale={sale}
                      showSeller={sellerNames.length > 1}
                      onOpen={setSaleOpened}
                      onMenu={setSaleForActions}
                    />
                  ))}
                </div>

                {/* ORDINATEUR — le vrai tableau, inchangé. */}
                <div className="hidden md:block bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden mt-2">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider h-10 bg-white">
                          <th className="py-2.5 px-4">N°</th>
                          <th className="py-2.5 px-3">Date &amp; heure</th>
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
                          const statut = saleStatusStyle(sale);
                          const hasCustomer =
                            !!sale.customerName && sale.customerName !== 'Client de passage';
                          const firstItemName = sale.items[0]?.name || 'Article';
                          const otherItemsCount = Math.max(0, sale.items.length - 1);

                          return (
                            <tr
                              key={sale.id}
                              onClick={() => setSaleOpened(sale)}
                              className={`h-[44px] hover:bg-slate-50/90 transition-colors cursor-pointer ${
                                isCancelled ? 'bg-slate-50/50 opacity-60' : ''
                              }`}
                            >
                              <td className="py-2 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className={isCancelled ? 'line-through text-slate-400' : ''}>
                                    {sale.reference}
                                  </span>
                                  {sale.syncStatus === 'PENDING_SYNC' && (
                                    <span
                                      title="Enregistrée sur cet appareil, pas encore envoyée"
                                      className="px-1.5 rounded text-[9.5px] font-extrabold bg-amber-100 text-amber-900"
                                    >
                                      En attente
                                    </span>
                                  )}
                                  {sale.syncStatus === 'SYNC_ERROR' && (
                                    <span
                                      title="Le serveur a refusé cet envoi — rien n’est perdu, réessaie depuis la bande du bas"
                                      className="px-1.5 rounded text-[9.5px] font-extrabold bg-rose-100 text-rose-900"
                                    >
                                      À renvoyer
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                {formatShortDate(sale.createdAt)}
                              </td>

                              <td className="py-2 px-4 whitespace-nowrap">
                                {hasCustomer ? (
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-6 h-6 rounded-full text-white font-bold text-[10px] flex items-center justify-center shrink-0"
                                      style={{ backgroundColor: avatarColor(sale.customerName!) }}
                                    >
                                      {avatarInitials(sale.customerName)}
                                    </div>
                                    <span className="font-extrabold text-slate-900">
                                      {sale.customerName}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="italic text-slate-400">Client non renseigné</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSaleForCustomerAssign(sale);
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-[#4F46E5] hover:text-indigo-800 text-[11px] font-bold transition-all cursor-pointer"
                                    >
                                      Attribuer un client
                                    </button>
                                  </div>
                                )}
                              </td>

                              <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                                {sale.sellerName}
                              </td>

                              <td className="py-2 px-4 text-slate-700 whitespace-nowrap max-w-[240px] truncate">
                                <span className="font-semibold">{firstItemName}</span>
                                {otherItemsCount > 0 && (
                                  <span className="text-slate-400 font-medium ml-1">
                                    +{otherItemsCount} {otherItemsCount > 1 ? 'autres' : 'autre'}
                                  </span>
                                )}
                              </td>

                              <td className="py-2 px-4 text-right font-black text-slate-900 tabular-nums whitespace-nowrap">
                                <span className={isCancelled ? 'line-through text-slate-400' : ''}>
                                  {formatMoney(sale.totalAmount)}
                                </span>
                              </td>

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

                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <span
                                  className="inline-block rounded-full text-[10px] font-extrabold"
                                  style={{
                                    backgroundColor: statut.bg,
                                    color: statut.fg,
                                    padding: '3px 9px',
                                  }}
                                >
                                  {statut.label}
                                </span>
                              </td>

                              <td className="py-2 px-3 text-center whitespace-nowrap">
                                <button
                                  type="button"
                                  aria-label="Actions sur cette commande"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSaleForActions(sale);
                                  }}
                                  className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 inline-flex items-center justify-center cursor-pointer transition-all"
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          FEUILLE D'ACTIONS — mêmes gestes depuis la liste et depuis le détail
          ===================================================================== */}
      {saleForActions && (
        <div
          className="fixed inset-0 z-[65] bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setSaleForActions(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl p-2 pb-4 sm:pb-2 animate-in slide-in-from-bottom sm:zoom-in-95"
          >
            <div className="px-3 py-2.5 border-b border-slate-100 min-w-0">
              <p className="text-xs font-black text-slate-900 truncate">
                {saleForActions.customerName || 'Client non renseigné'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {saleForActions.reference} · {formatMoney(saleForActions.totalAmount)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelectedSaleForReceipt(saleForActions);
                setSaleForActions(null);
              }}
              className="w-full px-3.5 py-3 text-left text-[13px] font-bold text-slate-700 hover:bg-indigo-50 rounded-xl flex items-center gap-2.5 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-indigo-500" />
              Voir le reçu
            </button>

            <button
              type="button"
              onClick={() => {
                envoyerRecu(saleForActions);
                setSaleForActions(null);
              }}
              className="w-full px-3.5 py-3 text-left text-[13px] font-bold text-slate-700 hover:bg-emerald-50 rounded-xl flex items-center gap-2.5 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 text-emerald-500" />
              Renvoyer sur WhatsApp
            </button>

            {!saleForActions.isCancelled && saleForActions.remainingAmount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSaleToCollect(saleForActions);
                  setSaleForActions(null);
                }}
                className="w-full px-3.5 py-3 text-left text-[13px] font-bold text-slate-700 hover:bg-indigo-50 rounded-xl flex items-center gap-2.5 cursor-pointer"
              >
                <Banknote className="w-4 h-4 text-[#4F46E5]" />
                Encaisser le reste ({formatMoney(saleForActions.remainingAmount)})
              </button>
            )}

            {!saleForActions.isCancelled && (
              <button
                type="button"
                onClick={() => {
                  setSaleToCancel(saleForActions);
                  setSaleForActions(null);
                }}
                className="w-full px-3.5 py-3 text-left text-[13px] font-bold text-[#DC2626] hover:bg-rose-50 rounded-xl flex items-center gap-2.5 cursor-pointer border-t border-slate-100 mt-1"
              >
                <Ban className="w-4 h-4" />
                Annuler la commande
              </button>
            )}
          </div>
        </div>
      )}

      {saleOpened && (
        <OrderDetailPanel
          sale={filteredSales.find((s) => s.id === saleOpened.id) ?? saleOpened}
          onClose={() => setSaleOpened(null)}
        />
      )}

      {saleToCancel && (
        <CancelOrderDialog
          sale={saleToCancel}
          onClose={() => setSaleToCancel(null)}
          onConfirm={async (motif) => {
            await cancelSale(saleToCancel.id, motif);
            setSaleToCancel(null);
          }}
        />
      )}

      {saleToCollect && (
        <CollectRemainingModal
          sale={saleToCollect}
          onClose={() => setSaleToCollect(null)}
          onCollect={(montant, methode) => collectSalePayment(saleToCollect.id, montant, methode)}
        />
      )}

      {/* =====================================================================
          MODAL ATTRIBUER UN CLIENT
          ===================================================================== */}
      {saleForCustomerAssign && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 truncate">
                  Attribuer un client à {saleForCustomerAssign.reference}
                </h3>
                <p className="text-xs text-slate-500">
                  Sélectionne un client enregistré dans ton carnet
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaleForCustomerAssign(null)}
                aria-label="Fermer"
                className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
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
                placeholder="Rechercher par nom ou numéro…"
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
                    type="button"
                    onClick={() => {
                      assignCustomerToSale(
                        saleForCustomerAssign.id,
                        cust.id,
                        cust.name,
                        cust.phone
                      );
                      setSaleForCustomerAssign(null);
                    }}
                    className="w-full py-2.5 px-2 flex items-center justify-between gap-2 text-left hover:bg-indigo-50/50 rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 group-hover:text-[#4F46E5] truncate">
                        {cust.name}
                      </div>
                      <div className="text-[11px] text-slate-500">{cust.phone}</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#4F46E5] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Choisir →
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
