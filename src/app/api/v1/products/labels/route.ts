import { z } from 'zod';
import { guardRead } from '@/server/guards';
import { getProduct } from '@/server/modules/products/service';
import { listCodes } from '@/server/modules/products/codes';
import { generateLabelsSheetPdf } from '@/server/modules/products/labelPdf';
import { AppError } from '@/server/shared/errors';
import { fail } from '@/server/shared/response';

const bodySchema = z.object({ productIds: z.array(z.string().cuid()).min(1).max(200) });

export async function POST(request: Request) {
  try {
    const ctx = await guardRead();

    const body = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('VALIDATION_ERROR', 'Données invalides.', parsed.error.flatten());
    }

    const items = [];
    for (const productId of parsed.data.productIds) {
      const product = await getProduct(ctx.businessId, productId);
      const codes = await listCodes(ctx.businessId, productId);
      const principal = codes.find((c) => c.estPrincipal) ?? codes[0];
      if (!principal) continue;
      items.push({
        nom: product.nom,
        prixVente: product.prixVente,
        code: principal.code,
        format: principal.format,
      });
    }

    if (items.length === 0) {
      throw new AppError('CODE_UNREADABLE', "Aucun des produits sélectionnés n'a de code à imprimer.");
    }

    const pdf = await generateLabelsSheetPdf(items);

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="etiquettes-morocash.pdf"',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
