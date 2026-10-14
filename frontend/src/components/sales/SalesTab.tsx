import React, { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { useApp } from '../../context/AppContext';
import {
  Search,
  MoreHorizontal,
  Eye,
  MessageCircle,
  Ban,
  FileSpreadsheet,
  FileText,
  Banknote,
  X,
  Plus,
  SlidersHorizontal,
  Download,
  BarChart3,
  ChevronDown,
} from 'lucide-react';
import { formatMoney, formatDate, formatPaymentMethod, formatShortDate } from '../../utils/formatters';
import { Sale, Versement } from '../../types';
import { useActivity } from '../../hooks/useActivity';
import { VersementBadge, VersementRow } from '../payments/VersementRow';
import { VersementReceiptModal } from '../payments/VersementReceiptModal';
import { countLabel } from '../../utils/plural';
import { useIncrementalList } from '../../hooks/useIncrementalList';
import { ListSentinel } from '../common/ListSentinel';
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
  type PeriodFilter,
  type StatusFilter,
} from '../../utils/salesFilters';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import {
  ChartsSkeleton,
  EmptyState,
  KpiCard,
  MC_EASE,
  PASTILLES_STATUT,
  Segmented,
  TrialPill,
  previousInterval,
  staggerParent,
  variationPct,
} from './SalesKit';
import type { DayBar } from './SalesCharts';

// recharts est lourd et ne sert qu'aux deux graphiques : il se charge après la
// liste, pas avant.
const SalesCharts = lazy(() => import('./SalesCharts'));

/** Sept jours : le matin, « aujourd'hui » est vide alors que les ventes de la veille comptent encore. */
const PERIODE_PAR_DEFAUT: PeriodFilter = '7days';

/** Graphiques affichés ou repliés : le choix du commerçant, gardé sur l'appareil. */
const CLE_GRAPHIQUES = 'morocash_sales_charts_open';
const CLE_VERSEMENTS = 'morocash_sales_versements_shown';

/** Une ligne de la liste : une commande, et les versements reçus pour elle ce jour-là. */
type LigneCommande = { sale: Sale; versements: Versement[] };

/**
 * Le titre posé au-dessus d'une commande qui vient de recevoir un versement :
 * son rang, le montant, le mode et l'heure. Un tap ouvre le reçu du versement.
 */
const BandeauVersements: React.FC<{
  versements: Versement[];
  onOpenReceipt: (versement: Versement) => void;
}> = ({ versements, onOpenReceipt }) => (
  <>
    {versements.map((v) => (
      <button
        key={v.id}
        type="button"
        onClick={() => onOpenReceipt(v)}
        title="Voir le reçu de ce versement"
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left cursor-pointer ${
          v.isCancelled ? 'opacity-60' : ''
        }`}
      >
        {/* Une phrase, pas des abréviations : « Paiement reçu : 4 000 F ». Le
            rang du versement vient après, pour qui veut le détail. */}
        <span className="min-w-0 flex-1 flex items-center gap-2">
          <span className="min-w-0 truncate text-[12px] font-semibold text-mc-primary-dark">
            {v.isCancelled ? 'Paiement annulé : ' : 'Paiement reçu : '}
            <span className={`font-extrabold tabular-nums ${v.isCancelled ? 'line-through' : ''}`}>
              {formatMoney(v.amount)}
            </span>
            {' · '}
            {formatPaymentMethod(v.method)}
            {' · '}
            {new Date(v.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <VersementBadge versement={v} />
        </span>
        <span className="shrink-0 text-[12px] font-bold text-mc-primary">
          <span className="hidden sm:inline">Voir le reçu </span>
          <span className="sm:hidden">Reçu </span>›
        </span>
      </button>
    ))}
  </>
);

const LIBELLES_PERIODE: Record<PeriodFilter, string> = {
  today: "aujourd'hui",
  '7days': 'sur 7 jours',
  '30days': 'sur 30 jours',
  thisMonth: 'ce mois',
  custom: 'sur la période choisie',
};

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
    pendingVersements,
    orderToOpen,
    clearOrderToOpen,
    isWriteLocked,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
  } = useApp();

  const [exportOuvert, setExportOuvert] = useState(false);

  const [graphiquesOuverts, setGraphiquesOuverts] = useState(() => {
    try {
      return localStorage.getItem(CLE_GRAPHIQUES) === '1';
    } catch {
      return false;
    }
  });
  const basculerGraphiques = () =>
    setGraphiquesOuverts((ouverts) => {
      try {
        localStorage.setItem(CLE_GRAPHIQUES, ouverts ? '0' : '1');
      } catch {
        // Stockage indisponible : le choix ne sera simplement pas retenu.
      }
      return !ouverts;
    });

  // Versements affichés ou non dans la liste : un interrupteur, dont le choix
  // est gardé sur l'appareil. « Versements seuls » vient de la carte du haut.
  const [versementsAffiches, setVersementsAffiches] = useState(() => {
    try {
      return localStorage.getItem(CLE_VERSEMENTS) !== '0';
    } catch {
      return true;
    }
  });
  const [versementsSeuls, setVersementsSeuls] = useState(false);
  const afficherVersements = (affiches: boolean) => {
    setVersementsAffiches(affiches);
    if (!affiches) setVersementsSeuls(false);
    try {
      localStorage.setItem(CLE_VERSEMENTS, affiches ? '1' : '0');
    } catch {
      // Stockage indisponible : le choix ne sera simplement pas retenu.
    }
  };
  const [recuVersement, setRecuVersement] = useState<Versement | null>(null);

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
  const [filtresAvancesOuverts, setFiltresAvancesOuverts] = useState(false);

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

  // Total vendu, compteurs et versements de la période : calculés par le
  // serveur (somme des paiements valides reçus sur la période). L'écran ne
  // les déduit pas des commandes — une commande à crédit y compte pour 0 F,
  // et un versement sur une vieille commande y compte le jour où il arrive.
  const { activity, stale: activityStale } = useActivity(dateInterval.start, dateInterval.end);

  // Même lecture serveur, sur la période juste avant : la base des pastilles
  // de variation. Pas de base, pas de pastille.
  const intervalleAvant = useMemo(
    () => previousInterval(periodFilter, dateInterval),
    [periodFilter, dateInterval]
  );
  const { activity: activityAvant } = useActivity(intervalleAvant.start, intervalleAvant.end);

  const libellePeriode = LIBELLES_PERIODE[periodFilter];

  // « Qui me doit » : ce que tous les clients doivent à ce jour, toutes périodes confondues.
  const { totalDu, nbDebiteurs } = useMemo(() => {
    const debiteurs = customers.filter((c) => c.totalDebt > 0);
    return {
      totalDu: debiteurs.reduce((somme, c) => somme + c.totalDebt, 0),
      nbDebiteurs: debiteurs.length,
    };
  }, [customers]);

  // Les 7 derniers jours, aujourd'hui compris, quelle que soit la période
  // affichée : montant des commandes du jour, et ce qui reste à payer dessus.
  const barres7Jours = useMemo<DayBar[]>(() => {
    const maintenant = new Date();
    const cleDuJour = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const jours = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - (6 - i));
      const court = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      return {
        cle: cleDuJour(d),
        label: court.charAt(0).toUpperCase() + court.slice(1),
        fullLabel: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        total: 0,
        paye: 0,
        reste: 0,
      };
    });
    const parCle = new Map(jours.map((j) => [j.cle, j]));
    for (const s of baseSales) {
      if (s.isCancelled) continue;
      const jour = parCle.get(cleDuJour(new Date(s.createdAt)));
      if (!jour) continue;
      const reste = Math.min(Math.max(s.remainingAmount, 0), s.totalAmount);
      jour.total += s.totalAmount;
      jour.reste += reste;
      jour.paye += s.totalAmount - reste;
    }
    return jours;
  }, [baseSales]);

  const repartitionStatuts = useMemo(
    () => ({ paid: statusCounts.PAID, partial: statusCounts.PARTIAL, credit: statusCounts.CREDIT }),
    [statusCounts]
  );

  const versementsEnAttente = useMemo(
    () =>
      pendingVersements.filter((v) => {
        const d = new Date(v.createdAt);
        return d >= dateInterval.start && d <= dateInterval.end;
      }),
    [pendingVersements, dateInterval]
  );

  // Lignes « versement » de la liste. Le filtre de statut ne concerne que les
  // commandes : dès qu'il est actif, seules les commandes restent.
  const filteredVersements = useMemo(() => {
    if (!versementsAffiches || statusFilter !== 'ALL') return [];
    const q = searchQuery.trim().toLowerCase();
    return [...versementsEnAttente, ...(activity?.versements ?? [])].filter((v) => {
      if (selectedSeller !== 'ALL' && v.collectedBy !== selectedSeller) return false;
      if (!q) return true;
      return [v.customerName, v.customerPhone, v.orderReference, v.receiptNumber].some(
        (champ) => Boolean(champ) && String(champ).toLowerCase().includes(q)
      );
    });
  }, [activity, versementsEnAttente, versementsAffiches, statusFilter, selectedSeller, searchQuery]);

  const shownSales = versementsSeuls ? [] : filteredSales;

  // Arrivée depuis une ligne de versement ou la fiche client : on ouvre la
  // commande demandée, quelle que soit la période affichée.
  useEffect(() => {
    if (!orderToOpen) return;
    const cible = baseSales.find((s) => s.id === orderToOpen);
    if (cible) setSaleOpened(cible);
    clearOrderToOpen();
  }, [orderToOpen, baseSales, clearOrderToOpen]);

  const ouvrirCommande = (orderId: string) => {
    const cible = baseSales.find((s) => s.id === orderId);
    if (cible) setSaleOpened(cible);
    else showToast('Cette commande n’est pas chargée sur cet appareil', 'warning');
  };

  // Un réglage avancé actif doit rester visible depuis la liste : sinon le
  // commerçant cherche pourquoi il manque des commandes.
  const reglagesAvancesActifs =
    selectedSeller !== 'ALL' ||
    periodFilter === 'custom' ||
    statusFilter === 'CANCELLED' ||
    versementsSeuls;

  // Point 9: GROUPE PAR JOUR
  const groupedByDay = useMemo(() => {
    const groups = new Map<
      string,
      { dateKey: string; label: string; sales: Sale[]; versements: Versement[] }
    >();

    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayObj = new Date();
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

    const lignes: { createdAt: string; sale?: Sale; versement?: Versement }[] = [
      ...shownSales.map((sale) => ({ createdAt: sale.createdAt, sale })),
      ...filteredVersements.map((versement) => ({ createdAt: versement.createdAt, versement })),
    ];

    for (const ligne of lignes) {
      const dayKey = ligne.createdAt.slice(0, 10);
      if (!groups.has(dayKey)) {
        let label = '';
        if (dayKey === todayStr) {
          label = "Aujourd'hui";
        } else if (dayKey === yesterdayStr) {
          label = 'Hier';
        } else {
          const dObj = new Date(ligne.createdAt);
          const fullStr = dObj.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          label = fullStr.charAt(0).toUpperCase() + fullStr.slice(1);
        }

        groups.set(dayKey, { dateKey: dayKey, label, sales: [], versements: [] });
      }
      if (ligne.sale) groups.get(dayKey)!.sales.push(ligne.sale);
      if (ligne.versement) groups.get(dayKey)!.versements.push(ligne.versement);
    }

    // Dans chaque journée, une commande qui a reçu un versement ce jour-là
    // monte en haut, avec le rang du versement en titre — même si la commande
    // date d'un autre jour. Le paiement fait à la commande n'est pas un
    // « nouveau » versement : il ne déplace rien. Un versement dont la commande
    // n'est pas connue ici (pas encore envoyé, commande non chargée) garde sa
    // propre ligne.
    const commandesParId = new Map(baseSales.map((s) => [s.id, s]));
    return Array.from(groups.values())
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .map((groupe) => {
        const duJour = new Set(groupe.sales.map((s) => s.id));
        const avecVersement = new Map<string, LigneCommande>();
        const orphelins: Versement[] = [];
        const parHeure = [...groupe.versements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        for (const v of parHeure) {
          const commande = v.orderId ? commandesParId.get(v.orderId) : undefined;
          if (!commande) orphelins.push(v);
          else if (v.atOrder && duJour.has(commande.id)) continue;
          else if (avecVersement.has(commande.id)) avecVersement.get(commande.id)!.versements.push(v);
          else avecVersement.set(commande.id, { sale: commande, versements: [v] });
        }
        // Du plus récent au moins récent : ce qui compte est le dernier
        // événement du jour sur la commande — sa création, ou son dernier
        // versement. Un versement fait donc remonter sa commande, sans passer
        // devant une commande créée après lui.
        const dernierEvenement = (l: LigneCommande) =>
          [duJour.has(l.sale.id) ? l.sale.createdAt : '', ...l.versements.map((v) => v.createdAt)].reduce((a, b) =>
            a > b ? a : b
          );
        const lignes: LigneCommande[] = [
          ...avecVersement.values(),
          ...groupe.sales.filter((s) => !avecVersement.has(s.id)).map((sale) => ({ sale, versements: [] as Versement[] })),
        ].sort((a, b) => dernierEvenement(b).localeCompare(dernierEvenement(a)));
        return { ...groupe, lignes, orphelins };
      });
  }, [shownSales, filteredVersements, baseSales]);

  // L'historique s'affiche par journées, une poignée à la fois : un an de
  // commandes, ce sont des milliers de lignes de tableau construites d'un coup
  // si on ne borne rien. Les totaux et l'export continuent de porter sur
  // filteredSales en entier.
  const {
    visibleItems: visibleDays,
    hasMore: hasMoreDays,
    sentinelRef: daysSentinelRef,
  } = useIncrementalList(groupedByDay, 7);

  const resetAllFilters = () => {
    setSearchQuery('');
    setVersementsSeuls(false);
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
      id: 'filtres-avances',
      label: 'Filtres avancés',
      icon: SlidersHorizontal,
      onSelect: () => setFiltresAvancesOuverts(true),
    },
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
      className="font-jakarta text-mc-ink pb-20 max-w-[1440px] mx-auto"
    >
      <MotionConfig reducedMotion="user">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: MC_EASE }}
          className="space-y-4 md:space-y-6"
        >
          {/* =================================================================
              EN-TÊTE — titre, pastille d'essai, exporter, nouvelle commande
              Sur téléphone le titre est déjà dans la barre haute : seules la
              pastille et les deux actions restent ici.
              ================================================================= */}
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="min-w-0 hidden md:block">
              <div className="flex items-center gap-3">
                <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">
                  Mes commandes
                </h1>
                <TrialPill />
              </div>
              <p className="text-[14px] text-mc-soft">
                Ce que tu as vendu, ce qu’on t’a versé, et ce qu’on te doit encore.
              </p>
            </div>
            <div className="md:hidden">
              <TrialPill />
            </div>

            <div className="hidden md:flex items-center gap-2 ml-auto">
              <div className="relative">
                <button
                  id="btn-sales-export"
                  aria-label="Exporter"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={exportOuvert}
                  disabled={filteredSales.length === 0}
                  onClick={() => setExportOuvert((ouvert) => !ouvert)}
                  className="h-10 px-4 rounded-full border border-mc-line bg-white text-[14px] font-semibold text-mc-ink inline-flex items-center gap-2 cursor-pointer hover:border-mc-primary hover:text-mc-primary transition-all duration-200 active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Exporter</span>
                </button>
                {exportOuvert && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setExportOuvert(false)} />
                    <div
                      role="menu"
                      className="absolute right-0 mt-2 w-56 z-40 bg-white rounded-2xl border border-mc-line shadow-mc-hover p-1.5"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportOuvert(false);
                          handleExportExcel();
                        }}
                        className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-[14px] font-semibold text-mc-ink hover:bg-mc-bg cursor-pointer text-left"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-mc-success" />
                        Excel (.csv)
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setExportOuvert(false);
                          handleExportPDF();
                        }}
                        className="w-full px-3 py-2.5 rounded-xl flex items-center gap-2.5 text-[14px] font-semibold text-mc-ink hover:bg-mc-bg cursor-pointer text-left"
                      >
                        <FileText className="w-4 h-4 text-mc-primary" />
                        Imprimer / PDF
                      </button>
                    </div>
                  </>
                )}
              </div>

              <button
                id="btn-sales-new-order"
                type="button"
                onClick={attemptNewSale}
                className={`h-10 px-4 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-[14px] font-bold inline-flex items-center gap-1.5 shadow-mc-card cursor-pointer transition-all duration-200 active:scale-[0.97] ${
                  isWriteLocked ? LOCKED_BTN_CLASS : ''
                }`}
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span className="sm:hidden">Commande</span>
                <span className="hidden sm:inline">Nouvelle commande</span>
              </button>
            </div>
          </header>

          {/* =================================================================
              FILTRES — deux sélecteurs segmentés (période, statut), la sorte
              de lignes, la recherche. Les réglages rares restent derrière le
              bouton « Filtres ».
              ================================================================= */}
          <div className="space-y-3">
            <div className="flex flex-col xl:flex-row xl:items-center gap-3">
              <Segmented<PeriodFilter>
                id="btn-sales-period"
                label="Période"
                value={periodFilter}
                onChange={setPeriodFilter}
                options={
                  [
                    { id: 'today', label: "Aujourd'hui" },
                    { id: '7days', label: '7 jours' },
                    { id: '30days', label: '30 jours' },
                    { id: 'thisMonth', label: 'Ce mois' },
                  ] as const
                }
              />
              <Segmented<StatusFilter>
                id="btn-sales-status"
                label="Statut"
                tone="ink"
                value={statusFilter}
                onChange={setStatusFilter}
                options={
                  [
                    { id: 'ALL', label: 'Toutes', count: statusCounts.ALL },
                    { id: 'PAID', label: 'Payées', count: statusCounts.PAID },
                    { id: 'PARTIAL', label: 'En partie', count: statusCounts.PARTIAL },
                    { id: 'CREDIT', label: 'Pas payées', count: statusCounts.CREDIT },
                  ] as const
                }
              />
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-mc-soft absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cherche un client, un produit, un n°…"
                  className="w-full h-11 pl-11 pr-4 rounded-full bg-white border border-mc-line text-[14px] font-medium text-mc-ink placeholder:text-mc-soft/70 focus:outline-none focus:ring-2 focus:ring-mc-primary transition-all"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  id="btn-sales-advanced-filters"
                  type="button"
                  onClick={() => setFiltresAvancesOuverts(true)}
                  aria-label="Filtres avancés"
                  title="Filtres avancés : période libre, vendeur, commandes annulées"
                  className={`relative shrink-0 w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-[0.97] ${
                    reglagesAvancesActifs
                      ? 'bg-mc-primary-tint border-mc-primary text-mc-primary'
                      : 'bg-white border-mc-line text-mc-soft hover:text-mc-ink'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {reglagesAvancesActifs && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-mc-primary ring-2 ring-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Un réglage avancé actif reste écrit en toutes lettres : sinon le
                commerçant cherche pourquoi il manque des commandes. */}
            {reglagesAvancesActifs && (
              <button
                type="button"
                onClick={() => setFiltresAvancesOuverts(true)}
                className="flex items-center gap-1.5 text-[12px] font-bold text-mc-primary hover:underline cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                {[
                  selectedSeller !== 'ALL' ? `Vendu par ${selectedSeller}` : null,
                  periodFilter === 'custom'
                    ? `Du ${formatShortDate(dateInterval.start)} au ${formatShortDate(dateInterval.end)}`
                    : null,
                  statusFilter === 'CANCELLED' ? 'Commandes annulées' : null,
                  versementsSeuls ? 'Versements seulement' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </button>
            )}
          </div>

          {/* =================================================================
              KPI — Total vendu, Commandes, Versements, Qui me doit
              Les trois premiers viennent du serveur, pour la période choisie.
              « Qui me doit » est le total dû par tous les clients, à ce jour.
              ================================================================= */}
          <motion.div
            id="sales-period-summary"
            variants={staggerParent}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 xl:grid-cols-4 gap-2 md:gap-4"
          >
            <KpiCard
              compact
              featured
              label="Total vendu"
              value={activity ? activity.totalVendu : null}
              format={formatMoney}
              variation={variationPct(activity?.totalVendu, activityAvant?.totalVendu)}
              hint={libellePeriode}
              onOpen={() => {
                setActiveTab('more');
                setActiveMoreSubTab('reports');
              }}
              openLabel="Voir mes chiffres"
            />
            <KpiCard
              compact
              label="Commandes"
              value={activity ? activity.nbCommandes : null}
              variation={variationPct(activity?.nbCommandes, activityAvant?.nbCommandes)}
              hint={
                activity && activity.resteSurCommandes > 0
                  ? `Reste à payer ${formatMoney(activity.resteSurCommandes)}`
                  : undefined
              }
              onOpen={() => afficherVersements(false)}
              openLabel="N’afficher que les commandes"
            />
            <KpiCard
              compact
              label="Versements"
              value={activity ? activity.nbVersements : null}
              variation={variationPct(activity?.nbVersements, activityAvant?.nbVersements)}
              hint={
                versementsEnAttente.length > 0
                  ? `${versementsEnAttente.length} en attente d’envoi`
                  : undefined
              }
              onOpen={() => {
                afficherVersements(true);
                setVersementsSeuls(true);
              }}
              openLabel="N’afficher que les versements"
            />
            <KpiCard
              compact
              label="Qui me doit"
              value={chargementInitial ? null : totalDu}
              format={formatMoney}
              hint={nbDebiteurs > 0 ? countLabel(nbDebiteurs, 'client') : 'Personne ne te doit rien'}
              onOpen={() => {
                setCustomersDebtorsFilter(true);
                setActiveTab('customers');
              }}
              openLabel="Voir qui me doit"
            />
          </motion.div>

          {(activityStale || versementsEnAttente.length > 0) && (
            <div className="px-4 py-3 rounded-2xl bg-mc-warning-bg text-[12px] font-semibold text-[#92400E] space-y-0.5">
              {activityStale && (
                <p>Pas de connexion : dernier total connu, à confirmer au retour du réseau.</p>
              )}
              {versementsEnAttente.length > 0 && (
                <p>
                  {countLabel(versementsEnAttente.length, 'versement')} en attente d’envoi, pas
                  encore dans le total.
                </p>
              )}
            </div>
          )}

          {/* =================================================================
              GRAPHIQUES — chargés à part : recharts ne pèse pas sur l'ouverture
              ================================================================= */}
          {/* Repliés par défaut : on vient ici pour les commandes, et les deux
              graphiques les repoussaient d'un écran entier. Le choix est gardé
              sur l'appareil. */}
          {!chargementInitial && baseSales.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  id="btn-sales-toggle-charts"
                  type="button"
                  aria-expanded={graphiquesOuverts}
                  onClick={basculerGraphiques}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white border border-mc-line text-[14px] font-semibold text-mc-ink cursor-pointer hover:border-mc-primary hover:text-mc-primary transition-all duration-200 active:scale-[0.97]"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span>{graphiquesOuverts ? 'Masquer les graphiques' : 'Voir les graphiques'}</span>
                  <ChevronDown
                    className={`w-4 h-4 transition-transform duration-200 ${graphiquesOuverts ? 'rotate-180' : ''}`}
                  />
                </button>
                {/* Versements dans la liste : affichés ou non, d'un seul geste. */}
                <label
                  htmlFor="btn-sales-versements"
                  className="inline-flex items-center gap-2.5 h-10 pl-4 pr-2.5 rounded-full bg-white border border-mc-line text-[14px] font-semibold text-mc-ink cursor-pointer"
                >
                  <span>Versements</span>
                  <input
                    id="btn-sales-versements"
                    type="checkbox"
                    className="mc-switch"
                    checked={versementsAffiches}
                    onChange={(e) => afficherVersements(e.target.checked)}
                  />
                </label>
              </div>
              {graphiquesOuverts && (
                <Suspense fallback={<ChartsSkeleton />}>
                  <SalesCharts days={barres7Jours} status={repartitionStatuts} periodLabel={libellePeriode} />
                </Suspense>
              )}
            </div>
          )}

          {/* =================================================================
              LA LISTE
              ================================================================= */}
          {chargementInitial ? (
            <div className="space-y-2" aria-busy="true" aria-label="Chargement des commandes">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-mc-line rounded-2xl p-4 flex items-center gap-3"
                >
                  <div className="w-10 h-10 rounded-full mc-shimmer shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 rounded-full mc-shimmer max-w-[40%]" />
                    <div className="h-3 rounded-full mc-shimmer max-w-[25%]" />
                  </div>
                  <div className="h-4 w-24 rounded-full mc-shimmer" />
                </div>
              ))}
            </div>
          ) : baseSales.length === 0 && filteredVersements.length === 0 ? (
            /* Aucune commande n'a jamais été enregistrée. */
            <EmptyState
              title="Aucune commande pour l’instant"
              text="Dès que tu enregistres une vente, elle apparaît ici avec son montant et son statut."
              actionLabel="Enregistrer ma première commande"
              onAction={attemptNewSale}
              withPlus
            />
          ) : groupedByDay.length === 0 ? (
            /* Des commandes existent, mais pas dans ce filtre. */
            <EmptyState
              title={
                versementsSeuls
                  ? 'Aucun versement sur cette période'
                  : 'Aucune commande ne correspond à ce filtre'
              }
              text="Vérifie la période, le statut ou les mots de ta recherche."
              actionLabel="Voir toutes les commandes"
              onAction={resetAllFilters}
            />
          ) : (
            <div className="space-y-6">
              {visibleDays.map((dayGroup) => {
                const nbCommandesDuJour = dayGroup.sales.filter((s) => !s.isCancelled).length;
                const nbVersementsDuJour = dayGroup.versements.filter((v) => !v.isCancelled).length;

                return (
                  <section key={dayGroup.dateKey}>
                    {/* Séparateur de journée, collant en haut au défilement :
                        on sait toujours quel jour on est en train de lire. */}
                    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[#F4F4F8]/95 backdrop-blur-sm flex items-baseline gap-2 min-w-0">
                      <h2 className="text-[16px] font-bold text-mc-ink shrink-0">{dayGroup.label}</h2>
                      <span className="text-[12px] font-medium text-mc-soft truncate">
                        {countLabel(nbCommandesDuJour, 'commande')}
                        {nbVersementsDuJour > 0 ? ` · ${countLabel(nbVersementsDuJour, 'versement')}` : ''}
                      </span>
                    </div>

                    {/* TÉLÉPHONE — des cartes. Rien n'est hors de l'écran, donc
                        rien ne peut être manqué. */}
                    <div className={`md:hidden space-y-2 mt-2 ${dayGroup.lignes.length === 0 ? 'hidden' : ''}`}>
                      {dayGroup.lignes.map(({ sale, versements }) => (
                        <div
                          key={sale.id}
                          className={versements.length > 0 ? 'rounded-[20px] bg-mc-primary-tint p-1' : ''}
                        >
                          <BandeauVersements versements={versements} onOpenReceipt={setRecuVersement} />
                          <SaleCard
                            sale={sale}
                            showSeller={sellerNames.length > 1}
                            onOpen={setSaleOpened}
                            onMenu={setSaleForActions}
                          />
                        </div>
                      ))}
                    </div>

                    {/* ORDINATEUR — une ligne par commande, qui se soulève au
                        survol. Mêmes colonnes que l'ancien tableau. */}
                    <div className={dayGroup.lignes.length === 0 ? 'hidden' : 'hidden md:block mt-2'}>
                      <div className="flex items-center gap-4 px-4 pb-2 text-[12px] font-semibold text-mc-soft">
                        <span className="flex-1 min-w-0">Client</span>
                        <span className="hidden lg:block w-[22%]">Articles</span>
                        <span className="hidden xl:block w-28">Vendu par</span>
                        <span className="w-28 text-right">Total</span>
                        <span className="w-28 text-right">Reste à payer</span>
                        <span className="w-20 text-center">Statut</span>
                        <span className="w-8" />
                      </div>

                      <div className="space-y-2">
                        {dayGroup.lignes.map(({ sale, versements }) => {
                          const isCancelled = !!sale.isCancelled;
                          const statut = saleStatusStyle(sale);
                          const pastille = PASTILLES_STATUT[statut.key];
                          const hasCustomer =
                            !!sale.customerName && sale.customerName !== 'Client de passage';
                          const firstItemName = sale.items[0]?.name || 'Article';
                          const otherItemsCount = Math.max(0, sale.items.length - 1);

                          return (
                            <div
                              key={sale.id}
                              className={versements.length > 0 ? 'rounded-[20px] bg-mc-primary-tint p-1' : ''}
                            >
                            <BandeauVersements versements={versements} onOpenReceipt={setRecuVersement} />
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => setSaleOpened(sale)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSaleOpened(sale);
                                }
                              }}
                              className={`mc-lift flex items-center gap-4 px-4 py-3 bg-white border border-mc-line rounded-2xl cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-mc-primary ${
                                isCancelled ? 'opacity-60' : ''
                              }`}
                            >
                              {/* Client, puis n° et heure dessous */}
                              <div className="flex-1 min-w-0 flex items-center gap-3">
                                <div
                                  className="w-10 h-10 rounded-full text-white font-bold text-[14px] flex items-center justify-center shrink-0"
                                  style={{
                                    backgroundColor: hasCustomer
                                      ? avatarColor(sale.customerName!)
                                      : '#C3C7DB',
                                  }}
                                  aria-hidden="true"
                                >
                                  {hasCustomer ? avatarInitials(sale.customerName) : '?'}
                                </div>
                                <div className="min-w-0">
                                  {hasCustomer ? (
                                    <p className="text-[14px] font-bold text-mc-ink truncate">
                                      {sale.customerName}
                                    </p>
                                  ) : (
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-[14px] italic text-mc-soft truncate">
                                        Client non renseigné
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSaleForCustomerAssign(sale);
                                        }}
                                        className="shrink-0 px-2.5 py-0.5 rounded-full bg-mc-primary-tint hover:bg-[#DAD6FC] text-mc-primary-dark text-[12px] font-bold transition-colors cursor-pointer"
                                      >
                                        Attribuer un client
                                      </button>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 text-[12px] text-mc-soft min-w-0">
                                    <span
                                      className={`font-mono shrink-0 ${isCancelled ? 'line-through' : ''}`}
                                    >
                                      {sale.reference}
                                    </span>
                                    <span className="shrink-0">·</span>
                                    <span className="truncate">{formatShortDate(sale.createdAt)}</span>
                                    {sale.syncStatus === 'PENDING_SYNC' && (
                                      <span
                                        title="Enregistrée sur cet appareil, pas encore envoyée"
                                        className="shrink-0 px-2 rounded-full text-[11px] font-bold bg-mc-warning-bg text-[#B45309]"
                                      >
                                        En attente
                                      </span>
                                    )}
                                    {sale.syncStatus === 'SYNC_ERROR' && (
                                      <span
                                        title="Le serveur a refusé cet envoi — rien n’est perdu, réessaie depuis la bande du bas"
                                        className="shrink-0 px-2 rounded-full text-[11px] font-bold bg-mc-danger-bg text-[#DC2626]"
                                      >
                                        À renvoyer
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="hidden lg:block w-[22%] min-w-0 text-[14px] text-mc-ink truncate">
                                <span className="font-semibold">{firstItemName}</span>
                                {otherItemsCount > 0 && (
                                  <span className="text-mc-soft ml-1">
                                    +{otherItemsCount} {otherItemsCount > 1 ? 'autres' : 'autre'}
                                  </span>
                                )}
                              </div>

                              <div className="hidden xl:block w-28 text-[12px] text-mc-soft truncate">
                                {sale.sellerName}
                              </div>

                              <div
                                className={`w-28 text-right text-[16px] font-extrabold tabular-nums whitespace-nowrap ${
                                  isCancelled ? 'line-through text-mc-soft' : 'text-mc-ink'
                                }`}
                              >
                                {formatMoney(sale.totalAmount)}
                              </div>

                              <div className="w-28 text-right text-[14px] tabular-nums whitespace-nowrap">
                                {isCancelled ? (
                                  <span className="text-mc-soft">—</span>
                                ) : sale.remainingAmount > 0 ? (
                                  <span className="font-bold text-[#DC2626]">
                                    {formatMoney(sale.remainingAmount)}
                                  </span>
                                ) : (
                                  <span className="text-mc-soft">0 F</span>
                                )}
                              </div>

                              <div className="w-20 text-center">
                                <span
                                  className="inline-block px-2.5 py-1 rounded-full text-[12px] font-bold whitespace-nowrap"
                                  style={{ backgroundColor: pastille.bg, color: pastille.fg }}
                                >
                                  {statut.label}
                                </span>
                              </div>

                              <button
                                type="button"
                                aria-label="Actions sur cette commande"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSaleForActions(sale);
                                }}
                                className="w-8 h-8 shrink-0 rounded-full hover:bg-mc-bg text-mc-soft hover:text-mc-ink inline-flex items-center justify-center cursor-pointer transition-colors"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </button>
                            </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* Versements sans commande connue sur cet appareil (pas encore
                        envoyés, ou commande non chargée) : ils gardent leur ligne. */}
                    {dayGroup.orphelins.length > 0 && (
                      <div className="space-y-2 mt-3">
                        {dayGroup.orphelins.map((v) => (
                          <VersementRow
                            key={v.id}
                            versement={v}
                            showCustomer
                            inline
                            onOpenReceipt={setRecuVersement}
                            onOpenOrder={ouvrirCommande}
                          />
                        ))}
                      </div>
                    )}

                  </section>
                );
              })}

              <ListSentinel
                sentinelRef={daysSentinelRef}
                hasMore={hasMoreDays}
                shown={visibleDays.length}
                total={groupedByDay.length}
                label="journées"
              />
            </div>
          )}
        </motion.div>
      </MotionConfig>

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
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-mc border border-mc-line shadow-2xl p-2 pb-4 sm:pb-2 animate-in slide-in-from-bottom sm:zoom-in-95"
          >
            <div className="px-3 py-2.5 border-b border-slate-100 min-w-0">
              <p className="text-xs font-extrabold text-mc-ink truncate">
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
              className="w-full px-3.5 py-3 text-left text-[13px] font-bold text-slate-700 hover:bg-mc-primary-tint rounded-xl flex items-center gap-2.5 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-mc-primary" />
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
                className="w-full px-3.5 py-3 text-left text-[13px] font-bold text-slate-700 hover:bg-mc-primary-tint rounded-xl flex items-center gap-2.5 cursor-pointer"
              >
                <Banknote className="w-4 h-4 text-[#5B4BF0]" />
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

      {/* =====================================================================
          FILTRES AVANCÉS — les réglages rares, hors du chemin quotidien
          ===================================================================== */}
      {filtresAvancesOuverts && (
        <div
          className="fixed inset-0 z-[65] bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setFiltresAvancesOuverts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-mc border border-mc-line shadow-2xl p-5 space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-mc-ink">Filtres avancés</h3>
              <button
                type="button"
                onClick={() => setFiltresAvancesOuverts(false)}
                aria-label="Fermer"
                className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-mc-soft cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {sellerNames.length > 1 && (
              <div className="space-y-1.5">
                <label htmlFor="filtre-vendeur" className="text-xs font-bold text-slate-700">
                  Vendu par
                </label>
                <select
                  id="filtre-vendeur"
                  value={selectedSeller}
                  onChange={(e) => setSelectedSeller(e.target.value)}
                  className="w-full bg-slate-50 border border-mc-line rounded-xl px-3 py-2.5 font-bold text-mc-ink text-[13px] focus:outline-none focus:ring-2 focus:ring-[#5B4BF0] cursor-pointer"
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

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Période libre</span>
              <div className="flex items-center gap-2 bg-slate-50 border border-mc-line rounded-xl p-2.5 text-[12px] min-w-0">
                <span className="text-mc-soft shrink-0">Du</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setPeriodFilter('custom');
                  }}
                  className="bg-transparent font-bold text-mc-ink focus:outline-none cursor-pointer min-w-0 flex-1"
                />
                <span className="text-mc-soft shrink-0">au</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setPeriodFilter('custom');
                  }}
                  className="bg-transparent font-bold text-mc-ink focus:outline-none cursor-pointer min-w-0 flex-1"
                />
              </div>
            </div>

            {/* Les commandes annulées ne méritent pas une pastille dans la
                rangée de tous les jours, mais elles doivent rester atteignables :
                c'est ici qu'on va les chercher quand on en cherche une. */}
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'CANCELLED' ? 'ALL' : 'CANCELLED')}
              className={`w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border text-[13px] font-bold transition-all cursor-pointer ${
                statusFilter === 'CANCELLED'
                  ? 'border-slate-900 bg-mc-ink text-white'
                  : 'border-mc-line text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span>Voir les commandes annulées</span>
              <span className="tabular-nums opacity-70">{statusCounts.CANCELLED}</span>
            </button>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  resetAllFilters();
                  setFiltresAvancesOuverts(false);
                }}
                className="flex-1 py-2.5 rounded-xl border border-mc-line text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Tout réinitialiser
              </button>
              <button
                type="button"
                onClick={() => setFiltresAvancesOuverts(false)}
                className="flex-1 py-2.5 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-xs font-extrabold shadow-xs cursor-pointer"
              >
                Voir les commandes
              </button>
            </div>
          </div>
        </div>
      )}

      {recuVersement && (
        <VersementReceiptModal versement={recuVersement} onClose={() => setRecuVersement(null)} />
      )}

      {saleOpened && (
        <OrderDetailPanel
          sale={baseSales.find((s) => s.id === saleOpened.id) ?? saleOpened}
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
          <div className="bg-white rounded-mc border border-mc-line max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100">
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-mc-ink truncate">
                  Attribuer un client à {saleForCustomerAssign.reference}
                </h3>
                <p className="text-xs text-mc-soft">
                  Sélectionne un client enregistré dans ton carnet
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSaleForCustomerAssign(null)}
                aria-label="Fermer"
                className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-mc-soft cursor-pointer"
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
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-mc-line text-xs font-medium text-mc-ink placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5B4BF0] focus:bg-white"
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
                    className="w-full py-2.5 px-2 flex items-center justify-between gap-2 text-left hover:bg-mc-primary-tint rounded-xl transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-mc-ink group-hover:text-[#5B4BF0] truncate">
                        {cust.name}
                      </div>
                      <div className="text-[11px] text-mc-soft">{cust.phone}</div>
                    </div>
                    <span className="text-[11px] font-bold text-[#5B4BF0] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
