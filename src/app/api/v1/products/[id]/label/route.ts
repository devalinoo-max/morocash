import { guardRead } from '@/server/guards';
import { getProduct } from '@/server/modules/products/service';
import { listCodes } from '@/server/modules/products/codes';
import { generateSingleLabelPdf } from '@/server/modules/products/labelPdf';
import { AppError } from '@/server/shared/errors';
import { fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();

    const product = await getProduct(ctx.businessId, id);
    const codes = await listCodes(ctx.businessId, id);
    const principal = codes.find((c) => c.estPrincipal) ?? codes[0];

    if (!principal) {
      throw new AppError('CODE_UNREADABLE', "Ce produit n'a aucun code à imprimer.");
    }

    const pdf = await generateSingleLabelPdf({
      nom: product.nom,
      prixVente: product.prixVente,
      code: principal.code,
      format: principal.format,
    });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="etiquette-${product.id}.pdf"`,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
