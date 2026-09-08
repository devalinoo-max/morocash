import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  TrendingUp,
  TrendingDown,
  Lock,
  ArrowLeft,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  DollarSign,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  MessageCircle,
  Clock,
  ChevronDown,
  X,
  Eye,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  Users,
} from 'lucide-react';
import { formatMoney, formatDate, formatNumber } from '../../utils/formatters';
import { Sale, Expense, CashMovement, PaymentMethod, Customer } from '../../types';

type PeriodPreset = 'today' | '7days' | '30days' | 'thisMonth' | 'thisYear' | 'custom';

interface ReportsTabProps {
  onBack?: () => void;
}

export const ReportsTab: React.FC<ReportsTabProps> = ({ onBack }) => {
  const {
    sales,
    expenses,
    customers,
    products,
    cashMovements,
    settings,
    setSelectedSaleForReceipt,
    showToast,
  } = useApp();

  // Permission Check: Owner only!
  const isOwner = settings.role === 'OWNER';
  if (!isOwner) {
    return (
      <div className="p-8 sm:p-12 max-w-xl mx-auto text-center space-y-4 bg-white rounded-3xl border border-slate-200 shadow-xs mt-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
          <Lock className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Accès restreint aux propriétaires</h2>
        <p className="text-sm text-slate-500 leading-relaxed">
          La page <strong>Mes Chiffres</strong>, la marge bénéficiaire, les bénéfices nets et
          l'analyse financière détaillée sont strictement réservés au profil Propriétaire.
        </p>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour</span>
          </button>
        )}
      </div>
    );
  }

  // --- 1. FILTER BAR STATE ---
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30days');
  const [comparePrevious, setComparePrevious] = useState<boolean>(true);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{ dateStr: string; dateLabel: string; sales: Sale[] } | null>(null);

  // Custom date range state (defaults to last 30 days)
  const todayObj = new Date();
  const thirtyDaysAgoObj = new Date();
  thirtyDaysAgoObj.setDate(thirtyDaysAgoObj.getDate() - 30);

  const [customStartDate, setCustomStartDate] = useState(
    thirtyDaysAgoObj.toISOString().slice(0, 10)
  );
  const [customEndDate, setCustomEndDate] = useState(
    todayObj.toISOString().slice(0, 10)
  );

  // Helper to compute date range intervals [start, end]
  const { currentRange, previousRange } = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (periodPreset === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (periodPreset === '7days') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    } else if (periodPreset === '30days') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
    } else if (periodPreset === 'thisMonth') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (periodPreset === 'thisYear') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else {
      // custom
      const partsS = customStartDate.split('-');
      const partsE = customEndDate.split('-');
      start = new Date(Number(partsS[0]), Number(partsS[1]) - 1, Number(partsS[2]), 0, 0, 0, 0);
      end = new Date(Number(partsE[0]), Number(partsE[1]) - 1, Number(partsE[2]), 23, 59, 59, 999);
    }

    // Previous range
    let prevStart: Date;
    let prevEnd: Date;
    if (periodPreset === 'thisMonth') {
      prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEnd = new Date(start.getFullYear(), start.getMonth(), 0, 23, 59, 59, 999);
    } else if (periodPreset === 'thisYear') {
      prevStart = new Date(start.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      prevEnd = new Date(start.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else {
      const diffMs = end.getTime() - start.getTime();
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(prevEnd.getTime() - diffMs);
    }

    return {
      currentRange: { start, end },
      previousRange: { start: prevStart, end: prevEnd },
    };
  }, [periodPreset, customStartDate, customEndDate]);

  // Filter items in ranges
  const isDateInRange = (dateStr: string, r: { start: Date; end: Date }) => {
    const d = new Date(dateStr);
    return d >= r.start && d <= r.end;
  };

  // Only consider non-cancelled sales
  const validSales = useMemo(() => sales.filter((s) => !s.isCancelled), [sales]);

  const currentSales = useMemo(
    () => validSales.filter((s) => isDateInRange(s.createdAt, currentRange)),
    [validSales, currentRange]
  );
  const previousSales = useMemo(
    () => validSales.filter((s) => isDateInRange(s.createdAt, previousRange)),
    [validSales, previousRange]
  );

  const currentExpenses = useMemo(
    () => expenses.filter((e) => isDateInRange(e.date, currentRange)),
    [expenses, currentRange]
  );
  const previousExpenses = useMemo(
    () => expenses.filter((e) => isDateInRange(e.date, previousRange)),
    [expenses, previousRange]
  );

  const currentDebtMovements = useMemo(
    () =>
      cashMovements.filter(
        (m) =>
          m.type === 'ENTREE' &&
          m.origine === 'REMBOURSEMENT' &&
          isDateInRange(m.createdAt, currentRange)
      ),
    [cashMovements, currentRange]
  );

  // Helper to compute cost of goods sold for a list of sales
  const calculateCostOfGoods = (saleList: Sale[]) => {
    let totalCost = 0;
    const prodCostMap = new Map<string, number>();
    products.forEach((p) => prodCostMap.set(p.id, p.purchasePrice));

    for (const s of saleList) {
      for (const it of s.items) {
        const unitCost =
          it.costPrice !== undefined
            ? it.costPrice
            : prodCostMap.get(it.productId) || 0;
        totalCost += unitCost * it.quantity;
      }
    }
    return totalCost;
  };

  // Compute period metrics
  const computePeriodMetrics = (saleList: Sale[], expenseList: Expense[], debtMovs: CashMovement[]) => {
    const total_vendu = saleList.reduce((sum, s) => sum + s.totalAmount, 0);
    const sale_paid = saleList.reduce((sum, s) => sum + s.paidAmount, 0);
    const debt_collected = debtMovs.reduce((sum, m) => sum + m.montant, 0);
    const recu = sale_paid + debt_collected;
    const a_credit = total_vendu - sale_paid; // on the sales of the period

    const total_depenses = expenseList.reduce((sum, e) => sum + e.amount, 0);
    // Frais hors achat marchandise pour éviter le double compte
    const frais = expenseList
      .filter((e) => !e.category.toLowerCase().includes('marchandise') && !e.category.toLowerCase().includes('approvisionnement'))
      .reduce((sum, e) => sum + e.amount, 0);

    const cout_marchandises = calculateCostOfGoods(saleList);
    const marge_brute = total_vendu - cout_marchandises;
    const gagne = marge_brute - frais;
    const marge_pct = total_vendu > 0 ? (gagne / total_vendu) * 100 : 0;

    return {
      total_vendu,
      recu,
      a_credit,
      total_depenses,
      frais,
      cout_marchandises,
      marge_brute,
      gagne,
      marge_pct,
      ordersCount: saleList.length,
    };
  };

  const curr = useMemo(
    () => computePeriodMetrics(currentSales, currentExpenses, currentDebtMovements),
    [currentSales, currentExpenses, currentDebtMovements, products]
  );
  const prev = useMemo(
    () => computePeriodMetrics(previousSales, previousExpenses, []),
    [previousSales, previousExpenses, products]
  );

  // Outstanding debt (current total debt of customers)
  const totalOutstandingDebt = useMemo(
    () => customers.reduce((sum, c) => sum + (c.totalDebt || 0), 0),
    [customers]
  );
  const indebtedCustomersCount = useMemo(
    () => customers.filter((c) => (c.totalDebt || 0) > 0).length,
    [customers]
  );

  // Percentage difference helper
  const calcDelta = (currVal: number, prevVal: number) => {
    if (prevVal === 0) {
      return currVal > 0 ? 100 : 0;
    }
    return ((currVal - prevVal) / Math.abs(prevVal)) * 100;
  };

  // --- 3. JOUR PAR JOUR DATA ---
  const dayByDayData = useMemo(() => {
    const dayMap = new Map<
      string,
      {
        dateStr: string;
        dateLabel: string;
        sales: Sale[];
        expenses: Expense[];
        debtMovs: CashMovement[];
      }
    >();

    // Index all sales in current range
    for (const s of currentSales) {
      const dayKey = s.createdAt.slice(0, 10);
      if (!dayMap.has(dayKey)) {
        const dObj = new Date(s.createdAt);
        const dayLabel = dObj.toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
        dayMap.set(dayKey, {
          dateStr: dayKey,
          dateLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
          sales: [],
          expenses: [],
          debtMovs: [],
        });
      }
      dayMap.get(dayKey)!.sales.push(s);
    }

    // Index expenses
    for (const e of currentExpenses) {
      const dayKey = e.date.slice(0, 10);
      if (!dayMap.has(dayKey)) {
        const dObj = new Date(e.date);
        const dayLabel = dObj.toLocaleDateString('fr-FR', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
        dayMap.set(dayKey, {
          dateStr: dayKey,
          dateLabel: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1),
          sales: [],
          expenses: [],
          debtMovs: [],
        });
      }
      dayMap.get(dayKey)!.expenses.push(e);
    }

    // Index debt repayments
    for (const m of currentDebtMovements) {
      const dayKey = m.createdAt.slice(0, 10);
      if (dayMap.has(dayKey)) {
        dayMap.get(dayKey)!.debtMovs.push(m);
      }
    }

    // Convert map to sorted array (newest to oldest)
    const rows = Array.from(dayMap.values()).map((entry) => {
      const metrics = computePeriodMetrics(entry.sales, entry.expenses, entry.debtMovs);
      return {
        ...entry,
        ...metrics,
      };
    });

    rows.sort((a, b) => b.dateStr.localeCompare(a.dateStr));

    // Determine the best day (highest total_vendu > 0)
    let bestDayStr = '';
    let maxVendu = 0;
    for (const r of rows) {
      if (r.total_vendu > maxVendu) {
        maxVendu = r.total_vendu;
        bestDayStr = r.dateStr;
      }
    }

    return { rows, bestDayStr };
  }, [currentSales, currentExpenses, currentDebtMovements, products]);

  // --- 4. MOIS PAR MOIS DATA ---
  const monthByMonthData = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        monthKey: string;
        monthLabel: string;
        sales: Sale[];
        expenses: Expense[];
        debtMovs: CashMovement[];
      }
    >();

    for (const s of validSales) {
      const mKey = s.createdAt.slice(0, 7); // YYYY-MM
      if (!monthMap.has(mKey)) {
        const d = new Date(s.createdAt);
        const mLabel = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        monthMap.set(mKey, {
          monthKey: mKey,
          monthLabel: mLabel.charAt(0).toUpperCase() + mLabel.slice(1),
          sales: [],
          expenses: [],
          debtMovs: [],
        });
      }
      monthMap.get(mKey)!.sales.push(s);
    }

    for (const e of expenses) {
      const mKey = e.date.slice(0, 7);
      if (monthMap.has(mKey)) {
        monthMap.get(mKey)!.expenses.push(e);
      }
    }

    const rows = Array.from(monthMap.values()).map((entry) => {
      const metrics = computePeriodMetrics(entry.sales, entry.expenses, entry.debtMovs);
      return {
        ...entry,
        ...metrics,
      };
    });

    // Sort chronologically ascending to compute evolution, then reverse for display
    rows.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    const rowsWithEvolution = rows.map((r, idx, arr) => {
      if (idx === 0) {
        return { ...r, evolution: null };
      }
      const prevTotal = arr[idx - 1].total_vendu;
      const evolution = prevTotal > 0 ? ((r.total_vendu - prevTotal) / prevTotal) * 100 : null;
      return { ...r, evolution };
    });

    return rowsWithEvolution.reverse();
  }, [validSales, expenses, products]);

  // --- 5. GRAPH EVOLUTION DATA ---
  // If period exceeds 60 days, group by month, otherwise group by day
  const isPeriodLong = useMemo(() => {
    const diffDays =
      (currentRange.end.getTime() - currentRange.start.getTime()) / (1000 * 3600 * 24);
    return diffDays > 60;
  }, [currentRange]);

  const chartData = useMemo(() => {
    if (isPeriodLong) {
      // Group by month
      const map = new Map<string, { label: string; vendu: number; gagne: number }>();
      for (const s of currentSales) {
        const k = s.createdAt.slice(0, 7);
        if (!map.has(k)) {
          const d = new Date(s.createdAt);
          map.set(k, {
            label: d.toLocaleDateString('fr-FR', { month: 'short' }),
            vendu: 0,
            gagne: 0,
          });
        }
        const item = map.get(k)!;
        item.vendu += s.totalAmount;
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, v]) => v);
    } else {
      // Group by day (chronological ascending for chart)
      const list = [...dayByDayData.rows].reverse();
      return list.map((r) => ({
        label: r.dateLabel.split(' ')[0] + ' ' + (r.dateLabel.split(' ')[1] || ''),
        vendu: r.total_vendu,
        gagne: r.gagne,
      }));
    }
  }, [isPeriodLong, currentSales, dayByDayData]);

  const maxChartVal = useMemo(() => {
    let m = 1000;
    for (const d of chartData) {
      if (d.vendu > m) m = d.vendu;
      if (d.gagne > m) m = d.gagne;
    }
    return m * 1.15;
  }, [chartData]);

  // --- 6. RÉPARTITION PAR MODE DE PAIEMENT ---
  const paymentMethodsList: { method: PaymentMethod; label: string; color: string }[] = [
    { method: 'CASH', label: 'Espèces', color: '#10B981' },
    { method: 'WAVE', label: 'Wave', color: '#00C3F7' },
    { method: 'ORANGE_MONEY', label: 'Orange Money', color: '#FF6600' },
    { method: 'MTN', label: 'MTN', color: '#FFCC00' },
    { method: 'MOOV', label: 'Moov', color: '#64748B' },
    { method: 'VIREMENT', label: 'Virement', color: '#64748B' },
  ];

  const paymentBreakdown = useMemo(() => {
    const totalCollected = currentSales.reduce((acc, s) => acc + s.paidAmount, 0);

    return paymentMethodsList.map((pm) => {
      const methodSales = currentSales.filter((s) => s.paymentMethod === pm.method);
      const count = methodSales.length;
      const amount = methodSales.reduce((sum, s) => sum + s.paidAmount, 0);
      const percentage = totalCollected > 0 ? (amount / totalCollected) * 100 : 0;
      return {
        ...pm,
        count,
        amount,
        percentage,
      };
    });
  }, [currentSales]);

  // --- 7. CE QUI TE RAPPORTE LE PLUS ---
  const { topRevenueProducts, topMarginProducts } = useMemo(() => {
    const productStats = new Map<
      string,
      {
        id: string;
        name: string;
        photo?: string;
        quantity: number;
        revenue: number;
        cost: number;
        margin: number;
      }
    >();

    const prodLookup = new Map<string, (typeof products)[0]>();
    products.forEach((p) => prodLookup.set(p.id, p));

    for (const s of currentSales) {
      for (const item of s.items) {
        const prod = prodLookup.get(item.productId);
        const costUnit =
          item.costPrice !== undefined
            ? item.costPrice
            : prod?.purchasePrice || 0;

        if (!productStats.has(item.productId)) {
          productStats.set(item.productId, {
            id: item.productId,
            name: item.name,
            photo: prod?.photo || prod?.photos?.[0],
            quantity: 0,
            revenue: 0,
            cost: 0,
            margin: 0,
          });
        }

        const stat = productStats.get(item.productId)!;
        stat.quantity += item.quantity;
        stat.revenue += item.total;
        stat.cost += costUnit * item.quantity;
        stat.margin = stat.revenue - stat.cost;
      }
    }

    const allStats = Array.from(productStats.values());
    const totalRev = curr.total_vendu || 1;
    const totalProfit = Math.max(1, curr.marge_brute);

    const byRev = [...allStats]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((p) => ({ ...p, share: (p.revenue / totalRev) * 100 }));

    const byMargin = [...allStats]
      .sort((a, b) => b.margin - a.margin)
      .slice(0, 5)
      .map((p) => ({ ...p, share: (p.margin / totalProfit) * 100 }));

    return { topRevenueProducts: byRev, topMarginProducts: byMargin };
  }, [currentSales, products, curr]);

  // --- 8. MES CLIENTS ---
  const topClients = useMemo(() => {
    const clientMap = new Map<string, { id: string; name: string; phone?: string; ordersCount: number; totalAmount: number }>();
    for (const s of currentSales) {
      const cId = s.customerId || s.customerName || 'non-renseigne';
      const cName = s.customerName || 'Client non renseigné';
      if (!clientMap.has(cId)) {
        clientMap.set(cId, {
          id: cId,
          name: cName,
          phone: s.customerPhone,
          ordersCount: 0,
          totalAmount: 0,
        });
      }
      const c = clientMap.get(cId)!;
      c.ordersCount += 1;
      c.totalAmount += s.totalAmount;
    }
    return Array.from(clientMap.values())
      .filter((c) => c.name !== 'Client non renseigné')
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5);
  }, [currentSales]);

  const debtors = useMemo(() => {
    return [...customers]
      .filter((c) => (c.totalDebt || 0) > 0)
      .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0))
      .slice(0, 5);
  }, [customers]);

  // --- 9. OÙ PART TON ARGENT (Dépenses par catégorie) ---
  const expenseBreakdown = useMemo(() => {
    const catMap = new Map<string, { category: string; amount: number; prevAmount: number }>();

    for (const e of currentExpenses) {
      const c = e.category || 'Autres';
      if (!catMap.has(c)) {
        catMap.set(c, { category: c, amount: 0, prevAmount: 0 });
      }
      catMap.get(c)!.amount += e.amount;
    }

    for (const e of previousExpenses) {
      const c = e.category || 'Autres';
      if (!catMap.has(c)) {
        catMap.set(c, { category: c, amount: 0, prevAmount: 0 });
      }
      catMap.get(c)!.prevAmount += e.amount;
    }

    const totalCurr = curr.total_depenses || 1;
    return Array.from(catMap.values())
      .map((item) => {
        const share = (item.amount / totalCurr) * 100;
        const delta = calcDelta(item.amount, item.prevAmount);
        return {
          ...item,
          share,
          delta,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [currentExpenses, previousExpenses, curr]);

  // --- 10. CE QUE DISENT TES CHIFFRES (5 Phrases dynamiques) ---
  const insights = useMemo(() => {
    // 1. Meilleur jour
    const bestDay = dayByDayData.rows.find((r) => r.dateStr === dayByDayData.bestDayStr);
    const phrase1 = bestDay
      ? `Ton meilleur jour est le ${bestDay.dateLabel} avec ${formatMoney(bestDay.total_vendu)} vendus.`
      : 'Aucune vente enregistrée sur cette période.';

    // 2. Marge nette moyenne
    const phrase2 = `Ta marge nette moyenne est de ${curr.marge_pct.toFixed(1)} % sur la période.`;

    // 3. Produit le plus rentable
    const topMarginProd = topMarginProducts[0];
    const topMarginPct =
      topMarginProd && topMarginProd.revenue > 0
        ? ((topMarginProd.margin / topMarginProd.revenue) * 100).toFixed(0)
        : '0';
    const phrase3 = topMarginProd
      ? `Ton produit le plus rentable est ${topMarginProd.name} (${topMarginPct} % de marge).`
      : 'Catalogue en attente de ventes.';

    // 4. Mode le plus utilisé
    const topPayment = [...paymentBreakdown].sort((a, b) => b.amount - a.amount)[0];
    const phrase4 =
      topPayment && topPayment.amount > 0
        ? `${topPayment.percentage.toFixed(0)} % de tes ventes sont payées par ${topPayment.label}.`
        : 'Paiements variés sur la période.';

    // 5. Dette clients
    const phrase5 = `${indebtedCustomersCount} client${indebtedCustomersCount > 1 ? 's' : ''} te doive${indebtedCustomersCount > 1 ? 'nt' : ''} ${formatMoney(totalOutstandingDebt)} au total.`;

    return { phrase1, phrase2, phrase3, phrase4, phrase5 };
  }, [dayByDayData, curr, topMarginProducts, paymentBreakdown, indebtedCustomersCount, totalOutstandingDebt]);

  // WhatsApp Reminder Handler
  const handleSendReminder = (customer: Customer) => {
    const shopName = settings.shopName || 'notre boutique';
    const message = `Bonjour ${customer.name}, sauf erreur de notre part, votre solde chez ${shopName} est de ${formatMoney(customer.totalDebt)}. Merci de nous contacter pour convenir d'un règlement.`;
    const cleanPhone = customer.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Export handlers
  const handleExportExcel = () => {
    const headers = [
      'Date',
      'Commandes',
      'Total vendu (F)',
      'Reçu (F)',
      'À crédit (F)',
      'Dépenses (F)',
      'Ce que tu as gagné (F)',
      'Marge (%)',
    ];
    const rows = dayByDayData.rows.map((r) => [
      r.dateStr,
      r.ordersCount,
      r.total_vendu,
      r.recu,
      r.a_credit,
      r.total_depenses,
      r.gagne,
      r.marge_pct.toFixed(1) + '%',
    ]);
    const summaryRow = [
      'TOTAL',
      curr.ordersCount,
      curr.total_vendu,
      curr.recu,
      curr.a_credit,
      curr.total_depenses,
      curr.gagne,
      curr.marge_pct.toFixed(1) + '%',
    ];

    const csvContent =
      '\uFEFF' +
      [headers.join(';'), ...rows.map((row) => row.join(';')), summaryRow.join(';')].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Mes_Chiffres_${periodPreset}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export Excel/CSV téléchargé avec succès', 'success');
    setIsExportOpen(false);
  };

  const handleExportPDF = () => {
    setIsExportOpen(false);
    window.print();
  };

  return (
    <div className="space-y-6 pb-20 max-w-[1400px] mx-auto animate-in fade-in duration-200">
      {/* Back button if opened from subtab */}
      {onBack && (
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour menu</span>
        </button>
      )}

      {/* =====================================================================
          1. BARRE DE FILTRES, collée en haut (Sticky Top)
          ===================================================================== */}
      <div className="sticky top-0 z-30 bg-[#F4F4F8]/95 backdrop-blur-md pt-1 pb-3 border-b border-slate-200/80 -mx-4 sm:-mx-6 px-4 sm:px-6 transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0 scrollbar-none text-xs font-bold">
            {(
              [
                { id: 'today', label: "Aujourd'hui" },
                { id: '7days', label: '7 jours' },
                { id: '30days', label: '30 jours' },
                { id: 'thisMonth', label: 'Ce mois' },
                { id: 'thisYear', label: 'Cette année' },
                { id: 'custom', label: 'Période libre' },
              ] as const
            ).map((tab) => {
              const active = periodPreset === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setPeriodPreset(tab.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                    active
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Date Picker + Comparison Switch + Export Button */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Date Pickers (Custom range or preview) */}
            {periodPreset === 'custom' && (
              <div className="flex items-center gap-1.5 text-xs bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                <span className="text-slate-500 font-medium">Du</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                />
                <span className="text-slate-500 font-medium">au</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                />
              </div>
            )}

            {/* Comparison Switch */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition-all">
              <input
                type="checkbox"
                checked={comparePrevious}
                onChange={(e) => setComparePrevious(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-[#4F46E5] focus:ring-indigo-500 cursor-pointer"
              />
              <span>Comparer avec la période précédente</span>
            </label>

            {/* Export Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsExportOpen(!isExportOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exporter</span>
                <ChevronDown className="w-3 h-3 ml-0.5" />
              </button>

              {isExportOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95">
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
        </div>
      </div>

      {/* =====================================================================
          2. QUATRE INDICATEURS, barre de couleur 4px en bas
          ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* INDICATEUR 1: Total vendu (barre indigo 4px en bas) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden flex flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Total vendu
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 tabular-nums">
              {formatMoney(curr.total_vendu)}
            </div>
            {comparePrevious && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                {curr.total_vendu >= prev.total_vendu ? (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{calcDelta(curr.total_vendu, prev.total_vendu).toFixed(1)} %
                  </span>
                ) : (
                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    {calcDelta(curr.total_vendu, prev.total_vendu).toFixed(1)} %
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">vs précédente</span>
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-semibold mt-3">
            {curr.ordersCount} commande{curr.ordersCount > 1 ? 's' : ''} enregistrée{curr.ordersCount > 1 ? 's' : ''}
          </div>
          {/* Barre pleine 4px en bas */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#4F46E5]" />
        </div>

        {/* INDICATEUR 2: Ce que tu as gagné (barre verte ou rouge 4px en bas) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden flex flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Ce que tu as gagné
            </div>
            <div
              className={`text-2xl sm:text-3xl font-black mt-1 tabular-nums ${
                curr.gagne >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {curr.gagne < 0 ? `- ${formatMoney(Math.abs(curr.gagne))}` : formatMoney(curr.gagne)}
            </div>
            {comparePrevious && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                {curr.gagne >= prev.gagne ? (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{calcDelta(curr.gagne, prev.gagne).toFixed(1)} %
                  </span>
                ) : (
                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    {calcDelta(curr.gagne, prev.gagne).toFixed(1)} %
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">vs précédente</span>
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-3 truncate">
            Marge sur tes ventes {formatMoney(curr.marge_brute)} − frais {formatMoney(curr.frais)}
          </div>
          {/* Barre pleine 4px en bas */}
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 ${
              curr.gagne >= 0 ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
            }`}
          />
        </div>

        {/* INDICATEUR 3: Ce que tu as dépensé (barre ambre 4px en bas) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden flex flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              Ce que tu as dépensé
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-700 mt-1 tabular-nums">
              {formatMoney(curr.total_depenses)}
            </div>
            {comparePrevious && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-bold">
                {curr.total_depenses <= prev.total_depenses ? (
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    {calcDelta(curr.total_depenses, prev.total_depenses).toFixed(1)} %
                  </span>
                ) : (
                  <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{calcDelta(curr.total_depenses, prev.total_depenses).toFixed(1)} %
                  </span>
                )}
                <span className="text-[11px] text-slate-500 font-medium">vs précédente</span>
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-500 font-semibold mt-3">
            {currentExpenses.length} dépense{currentExpenses.length > 1 ? 's' : ''} sur la période
          </div>
          {/* Barre pleine 4px en bas */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#D97706]" />
        </div>

        {/* INDICATEUR 4: On te doit (barre rouge 4px en bas) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs relative overflow-hidden flex flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="text-[11.5px] font-bold text-slate-500 uppercase tracking-wider">
              On te doit
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#DC2626] mt-1 tabular-nums">
              {formatMoney(totalOutstandingDebt)}
            </div>
            <div className="mt-2 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md inline-block">
              {indebtedCustomersCount} client{indebtedCustomersCount > 1 ? 's' : ''} concerné{indebtedCustomersCount > 1 ? 's' : ''}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-3">
            Crédits cumulés en attente
          </div>
          {/* Barre pleine 4px en bas */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#DC2626]" />
        </div>
      </div>

      {/* =====================================================================
          3. LE TABLEAU JOUR PAR JOUR (le cœur de la page)
          ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Jour par jour</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Évolution quotidienne de tes ventes, encaissements réels, charges et marge nette.
            </p>
          </div>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg">
            {dayByDayData.rows.length} jour{dayByDayData.rows.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11.5px] text-slate-500 font-semibold uppercase tracking-wider h-11">
                <th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-3 text-center">Commandes</th>
                <th className="py-2.5 px-4 text-right">Total vendu</th>
                <th className="py-2.5 px-4 text-right">Reçu</th>
                <th className="py-2.5 px-4 text-right">À crédit</th>
                <th className="py-2.5 px-4 text-right">Dépenses</th>
                <th className="py-2.5 px-4 text-right">Ce que tu as gagné</th>
                <th className="py-2.5 px-4 text-right">Marge %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {dayByDayData.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-normal">
                    Aucune activité enregistrée sur cette période.
                  </td>
                </tr>
              ) : (
                dayByDayData.rows.map((row) => {
                  const isBestDay = row.dateStr === dayByDayData.bestDayStr && row.total_vendu > 0;
                  return (
                    <tr
                      key={row.dateStr}
                      onClick={() =>
                        setSelectedDayDetail({
                          dateStr: row.dateStr,
                          dateLabel: row.dateLabel,
                          sales: row.sales,
                        })
                      }
                      title="Cliquer pour voir le détail des commandes du jour"
                      className={`h-[44px] hover:bg-slate-50/90 transition-colors cursor-pointer ${
                        isBestDay ? 'border-l-4 border-l-[#4F46E5] bg-indigo-50/30' : ''
                      }`}
                    >
                      <td className="py-2 px-4 font-bold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span>{row.dateLabel}</span>
                          {isBestDay && (
                            <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100/70 px-1.5 py-0.5 rounded">
                              Meilleur jour
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-center tabular-nums text-slate-600 font-semibold">
                        {row.ordersCount}
                      </td>
                      <td className="py-2 px-4 text-right font-bold text-slate-900 tabular-nums">
                        {formatMoney(row.total_vendu)}
                      </td>
                      <td className="py-2 px-4 text-right text-emerald-700 font-semibold tabular-nums">
                        {formatMoney(row.recu)}
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums">
                        {row.a_credit > 0 ? (
                          <span className="text-rose-600 font-bold">{formatMoney(row.a_credit)}</span>
                        ) : (
                          <span className="text-slate-400 font-normal">0 F</span>
                        )}
                      </td>
                      <td className="py-2 px-4 text-right text-amber-700 tabular-nums">
                        {formatMoney(row.total_depenses)}
                      </td>
                      <td className="py-2 px-4 text-right font-bold tabular-nums">
                        <span className={row.gagne >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                          {row.gagne < 0 ? `- ${formatMoney(Math.abs(row.gagne))}` : formatMoney(row.gagne)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-600 font-bold">
                        {row.total_vendu > 0 ? `${row.marge_pct.toFixed(1)} %` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Ligne de TOTAL fixe en bas du tableau, en gras */}
            {dayByDayData.rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100/90 font-bold text-xs text-slate-900 h-12">
                  <td className="py-2.5 px-4 uppercase tracking-wider font-extrabold">TOTAL PÉRIODE</td>
                  <td className="py-2.5 px-3 text-center tabular-nums font-black">{curr.ordersCount}</td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-slate-900">
                    {formatMoney(curr.total_vendu)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-emerald-700">
                    {formatMoney(curr.recu)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-rose-600">
                    {formatMoney(curr.a_credit)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-amber-700">
                    {formatMoney(curr.total_depenses)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums">
                    <span className={curr.gagne >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                      {curr.gagne < 0 ? `- ${formatMoney(Math.abs(curr.gagne))}` : formatMoney(curr.gagne)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-indigo-700">
                    {curr.total_vendu > 0 ? `${curr.marge_pct.toFixed(1)} %` : '—'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* =====================================================================
          4. LE TABLEAU MOIS PAR MOIS
          ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Mois par mois</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Historique mensuel consolidé avec calcul de l'évolution par rapport au mois précédent.
            </p>
          </div>
          <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg">
            {monthByMonthData.length} mois
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-[11.5px] text-slate-500 font-semibold uppercase tracking-wider h-11">
                <th className="py-2.5 px-4">Mois</th>
                <th className="py-2.5 px-3 text-center">Commandes</th>
                <th className="py-2.5 px-4 text-right">Total vendu</th>
                <th className="py-2.5 px-4 text-right">Reçu</th>
                <th className="py-2.5 px-4 text-right">À crédit</th>
                <th className="py-2.5 px-4 text-right">Dépenses</th>
                <th className="py-2.5 px-4 text-right">Ce que tu as gagné</th>
                <th className="py-2.5 px-4 text-right">Marge %</th>
                <th className="py-2.5 px-4 text-right">Évolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
              {monthByMonthData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Aucun historique mensuel disponible.
                  </td>
                </tr>
              ) : (
                monthByMonthData.map((row) => (
                  <tr key={row.monthKey} className="h-[44px] hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-4 font-bold text-slate-900 whitespace-nowrap">
                      {row.monthLabel}
                    </td>
                    <td className="py-2 px-3 text-center tabular-nums text-slate-600">
                      {row.ordersCount}
                    </td>
                    <td className="py-2 px-4 text-right font-bold text-slate-900 tabular-nums">
                      {formatMoney(row.total_vendu)}
                    </td>
                    <td className="py-2 px-4 text-right text-emerald-700 font-semibold tabular-nums">
                      {formatMoney(row.recu)}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums">
                      {row.a_credit > 0 ? (
                        <span className="text-rose-600 font-bold">{formatMoney(row.a_credit)}</span>
                      ) : (
                        <span className="text-slate-400">0 F</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-amber-700 tabular-nums">
                      {formatMoney(row.total_depenses)}
                    </td>
                    <td className="py-2 px-4 text-right font-bold tabular-nums">
                      <span className={row.gagne >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                        {row.gagne < 0 ? `- ${formatMoney(Math.abs(row.gagne))}` : formatMoney(row.gagne)}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-slate-600 font-bold">
                      {row.total_vendu > 0 ? `${row.marge_pct.toFixed(1)} %` : '—'}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums font-bold">
                      {row.evolution !== null ? (
                        row.evolution >= 0 ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                            +{row.evolution.toFixed(1)} %
                          </span>
                        ) : (
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                            {row.evolution.toFixed(1)} %
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {monthByMonthData.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-100/90 font-bold text-xs text-slate-900 h-12">
                  <td className="py-2.5 px-4 uppercase tracking-wider font-extrabold">TOTAL ANNUEL</td>
                  <td className="py-2.5 px-3 text-center tabular-nums font-black">
                    {monthByMonthData.reduce((s, r) => s + r.ordersCount, 0)}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-slate-900">
                    {formatMoney(monthByMonthData.reduce((s, r) => s + r.total_vendu, 0))}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-emerald-700">
                    {formatMoney(monthByMonthData.reduce((s, r) => s + r.recu, 0))}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-rose-600">
                    {formatMoney(monthByMonthData.reduce((s, r) => s + r.a_credit, 0))}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-amber-700">
                    {formatMoney(monthByMonthData.reduce((s, r) => s + r.total_depenses, 0))}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums">
                    {(() => {
                      const totalGagne = monthByMonthData.reduce((s, r) => s + r.gagne, 0);
                      return (
                        <span className={totalGagne >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'}>
                          {totalGagne < 0 ? `- ${formatMoney(Math.abs(totalGagne))}` : formatMoney(totalGagne)}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-indigo-700">
                    {(() => {
                      const sumVendu = monthByMonthData.reduce((s, r) => s + r.total_vendu, 0);
                      const sumGagne = monthByMonthData.reduce((s, r) => s + r.gagne, 0);
                      return sumVendu > 0 ? `${((sumGagne / sumVendu) * 100).toFixed(1)} %` : '—';
                    })()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-black tabular-nums text-slate-400">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* =====================================================================
          5. GRAPHIQUE D'ÉVOLUTION (Barres Total Vendu #4F46E5 + Courbe Ce que tu as gagné #16A34A)
          ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Graphique d'évolution</h3>
            <p className="text-xs text-slate-500">
              {isPeriodLong ? 'Évolution mensuelle des volumes' : 'Évolution journalière sur la période sélectionnée'}
            </p>
          </div>
          {/* Légende */}
          <div className="flex items-center gap-4 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#4F46E5]" />
              <span className="text-slate-700">Total vendu</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#16A34A]" />
              <span className="w-2 h-2 rounded-full bg-[#16A34A] -ml-2" />
              <span className="text-slate-700">Ce que tu as gagné</span>
            </div>
          </div>
        </div>

        {/* SVG Responsive Chart */}
        {chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-xs text-slate-400">
            Aucune donnée graphique sur cette période.
          </div>
        ) : (
          <div className="relative w-full h-64 select-none">
            <svg
              className="w-full h-full overflow-visible"
              viewBox="0 0 800 220"
              preserveAspectRatio="none"
            >
              {/* Horizontal Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => (
                <line
                  key={idx}
                  x1="0"
                  y1={20 + p * 160}
                  x2="800"
                  y2={20 + p * 160}
                  stroke="#E2E8F0"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              ))}

              {/* Barres du total vendu #4F46E5 */}
              {chartData.map((d, i) => {
                const totalBars = chartData.length;
                const slotWidth = 800 / totalBars;
                const barWidth = Math.min(36, slotWidth * 0.55);
                const x = i * slotWidth + (slotWidth - barWidth) / 2;
                const height = Math.max(4, (d.vendu / maxChartVal) * 160);
                const y = 180 - height;

                return (
                  <g key={i} className="group cursor-pointer">
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={height}
                      rx="4"
                      fill="#4F46E5"
                      className="transition-all hover:opacity-85"
                    >
                      <title>{`${d.label} : Vendu ${formatMoney(d.vendu)} · Gagné ${formatMoney(d.gagne)}`}</title>
                    </rect>
                  </g>
                );
              })}

              {/* Courbe superposée pour "ce que tu as gagné" #16A34A */}
              {chartData.length > 1 && (
                <path
                  d={chartData.reduce((acc, d, i) => {
                    const totalBars = chartData.length;
                    const slotWidth = 800 / totalBars;
                    const x = i * slotWidth + slotWidth / 2;
                    // Clamp y between 20 and 180
                    const valClamped = Math.max(0, d.gagne);
                    const y = 180 - Math.max(4, (valClamped / maxChartVal) * 160);
                    return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                  }, '')}
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Points sur la courbe */}
              {chartData.map((d, i) => {
                const totalBars = chartData.length;
                const slotWidth = 800 / totalBars;
                const x = i * slotWidth + slotWidth / 2;
                const valClamped = Math.max(0, d.gagne);
                const y = 180 - Math.max(4, (valClamped / maxChartVal) * 160);
                return (
                  <circle
                    key={i}
                    cx={x}
                    cy={y}
                    r="4"
                    fill="#16A34A"
                    stroke="#FFFFFF"
                    strokeWidth="2"
                    className="transition-all hover:r-6"
                  >
                    <title>{`${d.label} : Gagné ${formatMoney(d.gagne)}`}</title>
                  </circle>
                );
              })}
            </svg>

            {/* X-Axis labels */}
            <div className="flex justify-between text-[10px] text-slate-500 font-semibold pt-2 px-2 overflow-hidden">
              {chartData.map((d, i) => (
                <span
                  key={i}
                  className="truncate text-center"
                  style={{ width: `${100 / chartData.length}%` }}
                >
                  {d.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          6. RÉPARTITION PAR MODE DE PAIEMENT
          ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div>
          <h3 className="text-base font-extrabold text-slate-900">Répartition par mode de paiement</h3>
          <p className="text-xs text-slate-500">
            Encaissements enregistrés sur les ventes de la période sélectionnée.
          </p>
        </div>

        <div className="space-y-3">
          {paymentBreakdown.map((item) => {
            const isZero = item.amount === 0;
            return (
              <div
                key={item.method}
                className={`p-3 rounded-xl border transition-all ${
                  isZero
                    ? 'bg-slate-50/60 border-slate-200/60 text-slate-400'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: isZero ? '#94A3B8' : item.color }}
                    />
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-[11px] font-medium text-slate-500">
                      ({item.count} paiement{item.count > 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-xs font-black tabular-nums">
                      {formatMoney(item.amount)}
                    </span>
                    <span className="text-[11px] font-extrabold text-slate-600 w-12 text-right">
                      {item.percentage.toFixed(1)} %
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: isZero ? '#CBD5E1' : item.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          7. CE QUI TE RAPPORTE LE PLUS (DEUX classements côte à côte)
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 par total vendu */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Les 5 produits qui rapportent le plus d'argent
            </h3>
            <p className="text-xs text-slate-500">Classés par chiffre d'affaires généré.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {topRevenueProducts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">Aucune vente enregistrée.</div>
            ) : (
              topRevenueProducts.map((p, idx) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center text-xs font-black text-slate-400">
                      #{idx + 1}
                    </span>
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.name}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-indigo-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Qté vendue : <strong className="text-slate-700">{p.quantity}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-slate-900 tabular-nums">
                      {formatMoney(p.revenue)}
                    </div>
                    <div className="text-[11px] text-indigo-600 font-bold">
                      {p.share.toFixed(1)} % des ventes
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top 5 par marge nette */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              Les 5 produits qui te font gagner le plus
            </h3>
            <p className="text-xs text-slate-500">Classés par marge brute / bénéfice net réalisé.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {topMarginProducts.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">Aucune vente enregistrée.</div>
            ) : (
              topMarginProducts.map((p, idx) => (
                <div key={p.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-5 text-center text-xs font-black text-emerald-600">
                      #{idx + 1}
                    </span>
                    {p.photo ? (
                      <img
                        src={p.photo}
                        alt={p.name}
                        className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5 text-emerald-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        Qté vendue : <strong className="text-slate-700">{p.quantity}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-[#16A34A] tabular-nums">
                      +{formatMoney(p.margin)}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-bold">
                      {p.share.toFixed(1)} % du bénéfice
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          8. MES CLIENTS (Deux blocs côte à côte)
          ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tes 5 meilleurs clients */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Tes 5 meilleurs clients</h3>
            <p className="text-xs text-slate-500">Classés par volume total d'achats sur la période.</p>
          </div>

          <div className="divide-y divide-slate-100">
            {topClients.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Aucun client identifié sur cette période.
              </div>
            ) : (
              topClients.map((c, idx) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-extrabold text-xs flex items-center justify-center shrink-0">
                      {c.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">{c.name}</div>
                      <div className="text-[11px] text-slate-500 font-medium">
                        {c.ordersCount} commande{c.ordersCount > 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs font-black text-slate-900 tabular-nums">
                    {formatMoney(c.totalAmount)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ceux qui te doivent le plus */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Ceux qui te doivent le plus</h3>
            <p className="text-xs text-slate-500">
              Relance en un clic via message WhatsApp officiel prérempli.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {debtors.length === 0 ? (
              <div className="py-6 text-center text-xs text-emerald-600 font-bold flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Tous tes clients sont à jour de règlement !</span>
              </div>
            ) : (
              debtors.map((c) => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">{c.name}</div>
                    <div className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>Dette depuis {c.debtAgeDays || 0} jours</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-xs font-black text-[#DC2626] tabular-nums text-right">
                      {formatMoney(c.totalDebt)}
                    </div>
                    <button
                      onClick={() => handleSendReminder(c)}
                      title="Ouvrir WhatsApp avec message prérempli"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs transition-all cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Relancer</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          9. OÙ PART TON ARGENT (Dépenses par catégorie)
          ===================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Où part ton argent</h3>
            <p className="text-xs text-slate-500">
              Ventilation des dépenses par catégorie et comparaison avec la période précédente.
            </p>
          </div>
          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
            Total : {formatMoney(curr.total_depenses)}
          </span>
        </div>

        <div className="space-y-3">
          {expenseBreakdown.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Aucune dépense enregistrée sur cette période.
            </div>
          ) : (
            expenseBreakdown.map((item) => (
              <div key={item.category} className="p-3 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{item.category}</span>
                    {comparePrevious && (
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          item.delta <= 0
                            ? 'text-emerald-700 bg-emerald-50'
                            : 'text-rose-700 bg-rose-50'
                        }`}
                      >
                        {item.delta <= 0 ? '' : '+'}
                        {item.delta.toFixed(1)} %
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <span className="text-xs font-black text-slate-900 tabular-nums">
                      {formatMoney(item.amount)}
                    </span>
                    <span className="text-[11px] font-extrabold text-slate-600 w-12 text-right">
                      {item.share.toFixed(1)} %
                    </span>
                  </div>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${item.share}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* =====================================================================
          10. CE QUE DISENT TES CHIFFRES (5 phrases automatiques)
          ===================================================================== */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-900 rounded-3xl p-6 text-white shadow-xl space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-black">Ce que disent tes chiffres</h3>
            <p className="text-xs text-indigo-200">Synthèse intelligente calculée sur ta sélection</p>
          </div>
        </div>

        <div className="space-y-2.5 pt-2 text-xs sm:text-sm font-medium leading-relaxed">
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
            <p>{insights.phrase1}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
            <p>{insights.phrase2}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 shrink-0" />
            <p>{insights.phrase3}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
            <p>{insights.phrase4}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span
              className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                totalOutstandingDebt > 0 ? 'bg-rose-500' : 'bg-emerald-400'
              }`}
            />
            <p className={totalOutstandingDebt > 0 ? 'text-rose-300 font-bold' : ''}>
              {insights.phrase5}
            </p>
          </div>
        </div>
      </div>

      {/* =====================================================================
          MODAL DETAIL DU JOUR SÉLECTIONNÉ (Clic sur une ligne de Jour par jour)
          ===================================================================== */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  Commandes du {selectedDayDetail.dateLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedDayDetail.sales.length} commande{selectedDayDetail.sales.length > 1 ? 's' : ''} réalisée{selectedDayDetail.sales.length > 1 ? 's' : ''} ce jour-là
                </p>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto divide-y divide-slate-100 space-y-3">
              {selectedDayDetail.sales.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Aucune commande sur cette date.</p>
              ) : (
                selectedDayDetail.sales.map((sale) => (
                  <div key={sale.id} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700">
                          {sale.reference}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(sale.createdAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate">
                        {sale.customerName || <span className="italic text-slate-400">Client non renseigné</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {sale.items[0]?.name}
                        {sale.items.length > 1 ? ` +${sale.items.length - 1} autre${sale.items.length > 2 ? 's' : ''}` : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-slate-900 tabular-nums">
                        {formatMoney(sale.totalAmount)}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedSaleForReceipt(sale);
                          setSelectedDayDetail(null);
                        }}
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#4F46E5] hover:underline cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Voir reçu</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 cursor-pointer"
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
