import { z } from 'zod';
import { guardRead, requireRole, requireExportExcelAllowed } from '@/server/guards';
import {
  getDailyReport,
  getRangeReport,
  getProductsReport,
  getCustomersReport,
  getExpensesReport,
  getPaymentMethodsReport,
  resolveMonthRange,
} from '@/server/modules/reports/queries';
import { generateExcelTable, generatePdfTable } from '@/server/modules/exports/render';
import { ok, fail } from '@/server/shared/response';
import { AppError } from '@/server/shared/errors';

const exportSchema = z.object({
  type: z.enum(['daily', 'monthly', 'products', 'customers', 'expenses', 'payment-methods']),
  format: z.enum(['pdf', 'excel']),
  date: z.coerce.date().optional(),
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

async function buildTable(
  businessId: string,
  input: z.infer<typeof exportSchema>
): Promise<{ title: string; headers: string[]; rows: (string | number)[][] }> {
  const now = new Date();
  const defaultRange = resolveMonthRange(now.getFullYear(), now.getMonth() + 1);

  if (input.type === 'daily') {
    const totals = await getDailyReport(businessId, input.date ?? now);
    return {
      title: 'Rapport journalier',
      headers: ['Champ', 'Valeur'],
      rows: Object.entries(totals),
    };
  }

  if (input.type === 'monthly') {
    const { from, to } = resolveMonthRange(input.year ?? now.getFullYear(), input.month ?? now.getMonth() + 1);
    const totals = await getRangeReport(businessId, from, to);
    return { title: 'Rapport mensuel', headers: ['Champ', 'Valeur'], rows: Object.entries(totals) };
  }

  const from = input.from ?? defaultRange.from;
  const to = input.to ?? defaultRange.to;

  if (input.type === 'products') {
    const products = await getProductsReport(businessId, from, to);
    return {
      title: 'Rapport produits',
      headers: ['Produit', 'Qté vendue', 'Total vendu', 'Coût total'],
      rows: products.map((p) => [p.libelle, p.qteVendue, p.totalVendu, p.coutTotal]),
    };
  }

  if (input.type === 'customers') {
    const customers = await getCustomersReport(businessId);
    return {
      title: 'Rapport clients',
      headers: ['Client', 'Total dû', 'Total reçu', 'Solde'],
      rows: customers.map((c) => [c.nom, c.totalDu, c.totalRecu, c.solde]),
    };
  }

  if (input.type === 'expenses') {
    const report = await getExpensesReport(businessId, from, to);
    return {
      title: 'Rapport dépenses',
      headers: ['Catégorie', 'Total', 'Nombre'],
      rows: report.byCategory.map((c) => [c.nom, c.total, c.count]),
    };
  }

  const methods = await getPaymentMethodsReport(businessId, from, to);
  return {
    title: 'Rapport moyens de paiement',
    headers: ['Méthode', 'Total', 'Nombre'],
    rows: methods.map((m) => [m.methode, m.total, m.count]),
  };
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRead();
    requireRole(ctx.role, ['OWNER', 'ACCOUNTANT']);

    const body = await request.json().catch(() => null);
    const parsed = exportSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    if (parsed.data.format === 'excel') {
      await requireExportExcelAllowed(ctx.businessId);
    }

    const { title, headers, rows } = await buildTable(ctx.businessId, parsed.data);

    if (parsed.data.format === 'excel') {
      const buffer = await generateExcelTable(title, headers, rows);
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${parsed.data.type}.xlsx"`,
        },
      });
    }

    const buffer = await generatePdfTable(title, headers, rows);
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${parsed.data.type}.pdf"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
