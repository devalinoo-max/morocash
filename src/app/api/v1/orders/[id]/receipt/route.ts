import { guardRead } from '@/server/guards';
import { getOrderReceiptData } from '@/server/modules/orders/service';
import { generateTextReceipt } from '@/server/modules/receipts/receiptText';
import { generateReceiptPdf } from '@/server/modules/receipts/receiptPdf';
import { AppError } from '@/server/shared/errors';
import { fail } from '@/server/shared/response';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const ctx = await guardRead();
    const url = new URL(request.url);
    const format = url.searchParams.get('format') ?? 'text';

    const data = await getOrderReceiptData(ctx.businessId, id);

    if (format === 'text') {
      const text = generateTextReceipt(data);
      return new Response(text, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (format === 'pdf') {
      const pdf = await generateReceiptPdf(data);
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="recu-${data.order.numero}.pdf"`,
        },
      });
    }

    if (format === 'png') {
      // Aucune bibliothèque de rendu d'image serveur n'est listée au cahier des
      // charges §1.3 (seuls qrcode/bwip-js et @react-pdf/renderer y figurent) —
      // non implémenté plutôt que fabriqué, comme pour /products/decode-image.
      throw new AppError(
        'VALIDATION_ERROR',
        "Le format 'png' n'est pas encore implémenté côté serveur — utilisez 'text' ou 'pdf'."
      );
    }

    throw new AppError('VALIDATION_ERROR', `Format de reçu inconnu: ${format}`);
  } catch (error) {
    return fail(error);
  }
}
