import { runInTenantTransaction } from '@/server/repositories/base';

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export interface RangeTotals {
  nbCommandes: number;
  totalVendu: number;
  recu: number;
  aCredit: number;
  coutMarchandises: number;
  margeBrute: number;
  totalDepenses: number;
  gagne: number;
  creancesTotales: number;
}

/**
 * Agrégation partagée par /dashboard et /reports/daily|monthly — garantit que ces
 * routes renvoient des totaux identiques pour la même période (critère de sortie
 * étape 9), puisqu'elles appellent toutes la même fonction.
 *
 * `creancesTotales` n'est pas une somme sur la période (ce n'est pas un flux) mais
 * un instantané de la dette totale actuelle, tous clients confondus — recalculé en
 * direct plutôt que sommé depuis DailyStats (chaque ligne de DailyStats n'y stocke
 * qu'un delta du jour, pas un solde cumulé).
 */
export async function getRangeReport(businessId: string, from: Date, to: Date): Promise<RangeTotals> {
  return runInTenantTransaction(businessId, async (tx) => {
    const rows = await tx.dailyStats.findMany({
      where: { businessId, date: { gte: startOfDay(from), lte: startOfDay(to) } },
    });

    const totals = rows.reduce(
      (acc, r) => ({
        nbCommandes: acc.nbCommandes + r.nbCommandes,
        totalVendu: acc.totalVendu + r.totalVendu,
        recu: acc.recu + r.recu,
        aCredit: acc.aCredit + r.aCredit,
        coutMarchandises: acc.coutMarchandises + r.coutMarchandises,
        margeBrute: acc.margeBrute + r.margeBrute,
        totalDepenses: acc.totalDepenses + r.totalDepenses,
        gagne: acc.gagne + r.gagne,
      }),
      {
        nbCommandes: 0,
        totalVendu: 0,
        recu: 0,
        aCredit: 0,
        coutMarchandises: 0,
        margeBrute: 0,
        totalDepenses: 0,
        gagne: 0,
      }
    );

    const [orders, payments] = await Promise.all([
      tx.order.findMany({ where: { businessId, statut: { not: 'ANNULEE' } }, select: { total: true } }),
      tx.payment.findMany({ where: { businessId, statut: 'VALIDE' }, select: { montant: true } }),
    ]);
    const creancesTotales =
      orders.reduce((acc, o) => acc + o.total, 0) - payments.reduce((acc, p) => acc + p.montant, 0);

    return { ...totals, creancesTotales };
  });
}

export function getDailyReport(businessId: string, date: Date): Promise<RangeTotals> {
  return getRangeReport(businessId, date, date);
}

export function resolveMonthRange(year: number, month: number): { from: Date; to: Date } {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  return { from, to };
}

export type DashboardPeriod = 'today' | 'week' | 'month' | 'year';

// Les valeurs exactes de `period=` ne sont pas énumérées au cahier des charges
// (§8 ne montre que `GET /api/v1/dashboard?period=` sans détail) — mapping
// raisonnable choisi ici, jamais fabriqué au niveau des formules elles-mêmes :
// today / week (7 derniers jours) / month (depuis le 1er) / year (depuis le
// 1er janvier), toujours jusqu'à aujourd'hui inclus.
export function resolvePeriodRange(period: DashboardPeriod, now: Date = new Date()): { from: Date; to: Date } {
  const to = startOfDay(now);
  if (period === 'today') return { from: to, to };
  if (period === 'week') return { from: addDays(to, -6), to };
  if (period === 'month') return { from: new Date(to.getFullYear(), to.getMonth(), 1), to };
  return { from: new Date(to.getFullYear(), 0, 1), to };
}

export async function getProductsReport(businessId: string, from: Date, to: Date) {
  return runInTenantTransaction(businessId, async (tx) => {
    const items = await tx.orderItem.findMany({
      where: {
        order: {
          businessId,
          statut: { not: 'ANNULEE' },
          createdAt: { gte: startOfDay(from), lt: addDays(startOfDay(to), 1) },
        },
      },
      select: { productId: true, libelle: true, qte: true, totalLigne: true, coutUnitaire: true },
    });

    const byProduct = new Map<
      string,
      { productId: string; libelle: string; qteVendue: number; totalVendu: number; coutTotal: number }
    >();
    for (const item of items) {
      if (!item.productId) continue;
      const entry = byProduct.get(item.productId) ?? {
        productId: item.productId,
        libelle: item.libelle,
        qteVendue: 0,
        totalVendu: 0,
        coutTotal: 0,
      };
      entry.qteVendue += item.qte;
      entry.totalVendu += item.totalLigne;
      entry.coutTotal += item.coutUnitaire * item.qte;
      byProduct.set(item.productId, entry);
    }

    return [...byProduct.values()].sort((a, b) => b.totalVendu - a.totalVendu);
  });
}

export async function getCustomersReport(businessId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const [customers, orders, payments] = await Promise.all([
      tx.customer.findMany({ where: { businessId, archive: false } }),
      tx.order.findMany({
        where: { businessId, statut: { not: 'ANNULEE' } },
        select: { customerId: true, total: true },
      }),
      tx.payment.findMany({
        where: { businessId, statut: 'VALIDE' },
        select: { customerId: true, montant: true },
      }),
    ]);

    return customers
      .map((c) => {
        const totalDu = orders.filter((o) => o.customerId === c.id).reduce((acc, o) => acc + o.total, 0);
        const totalRecu = payments
          .filter((p) => p.customerId === c.id)
          .reduce((acc, p) => acc + p.montant, 0);
        return { customerId: c.id, nom: c.nom, totalDu, totalRecu, solde: totalDu - totalRecu };
      })
      .sort((a, b) => b.solde - a.solde);
  });
}

export async function getExpensesReport(businessId: string, from: Date, to: Date) {
  return runInTenantTransaction(businessId, async (tx) => {
    const expenses = await tx.expense.findMany({
      where: { businessId, date: { gte: startOfDay(from), lt: addDays(startOfDay(to), 1) } },
      include: { category: true },
    });

    const byCategory = new Map<string, { categoryId: string; nom: string; total: number; count: number }>();
    for (const e of expenses) {
      const entry = byCategory.get(e.categoryId) ?? {
        categoryId: e.categoryId,
        nom: e.category.nom,
        total: 0,
        count: 0,
      };
      entry.total += e.montant;
      entry.count += 1;
      byCategory.set(e.categoryId, entry);
    }

    return {
      total: expenses.reduce((acc, e) => acc + e.montant, 0),
      byCategory: [...byCategory.values()].sort((a, b) => b.total - a.total),
    };
  });
}

export async function getPaymentMethodsReport(businessId: string, from: Date, to: Date) {
  return runInTenantTransaction(businessId, async (tx) => {
    const payments = await tx.payment.findMany({
      where: {
        businessId,
        statut: 'VALIDE',
        createdAt: { gte: startOfDay(from), lt: addDays(startOfDay(to), 1) },
      },
      select: { methode: true, montant: true },
    });

    const byMethod = new Map<string, { methode: string; total: number; count: number }>();
    for (const p of payments) {
      const entry = byMethod.get(p.methode) ?? { methode: p.methode, total: 0, count: 0 };
      entry.total += p.montant;
      entry.count += 1;
      byMethod.set(p.methode, entry);
    }

    return [...byMethod.values()].sort((a, b) => b.total - a.total);
  });
}

/**
 * §8 liste `insights` dans les routes sans en préciser le contenu exact — le
 * cahier des charges ne définit aucune formule ou liste de champs pour cette
 * route. Implémentation minimale et raisonnable (produits en rupture proche,
 * meilleures ventes des 30 derniers jours) plutôt qu'une fabrication étendue non
 * spécifiée.
 */
export async function getInsights(businessId: string) {
  return runInTenantTransaction(businessId, async (tx) => {
    const products = await tx.product.findMany({ where: { businessId, actif: true } });
    const lowStock = products
      .filter((p) => p.stock <= p.seuilAlerte)
      .map((p) => ({ productId: p.id, nom: p.nom, stock: p.stock, seuilAlerte: p.seuilAlerte }));

    const last30 = addDays(startOfDay(new Date()), -30);
    const items = await tx.orderItem.findMany({
      where: { order: { businessId, statut: { not: 'ANNULEE' }, createdAt: { gte: last30 } } },
      select: { productId: true, libelle: true, qte: true, totalLigne: true },
    });
    const byProduct = new Map<
      string,
      { productId: string; libelle: string; qteVendue: number; totalVendu: number }
    >();
    for (const item of items) {
      if (!item.productId) continue;
      const entry = byProduct.get(item.productId) ?? {
        productId: item.productId,
        libelle: item.libelle,
        qteVendue: 0,
        totalVendu: 0,
      };
      entry.qteVendue += item.qte;
      entry.totalVendu += item.totalLigne;
      byProduct.set(item.productId, entry);
    }
    const topProduits = [...byProduct.values()].sort((a, b) => b.totalVendu - a.totalVendu).slice(0, 5);

    return { produitsEnRupture: lowStock, meilleuresVentes30j: topProduits };
  });
}
