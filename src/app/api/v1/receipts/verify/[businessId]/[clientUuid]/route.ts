import { findVerifiedReceipt, type VerifiedReceipt } from '@/server/modules/receipts/verify';

interface RouteParams {
  params: Promise<{ businessId: string; clientUuid: string }>;
}

/**
 * Page ouverte en scannant le QR code d'un reçu. Une page HTML et non du
 * JSON : c'est un client, sur son téléphone, qui la lit — sans compte ni
 * application. Sert sous le domaine du frontend grâce à la réécriture
 * /api/v1/* (vercel.json), donc aucun domaine de plus à connaître.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { businessId, clientUuid } = await params;

  let receipt: VerifiedReceipt | null = null;
  try {
    receipt = await findVerifiedReceipt(businessId, clientUuid);
  } catch (error) {
    console.error('[receipts/verify]', error);
    return html(page('Vérification impossible', '<p class="muted">Réessaie dans un instant.</p>'), 503);
  }

  if (!receipt) {
    return html(
      page(
        'Reçu introuvable',
        '<p class="muted">Ce reçu n’existe pas, ou n’est pas encore synchronisé par la boutique. Réessaie un peu plus tard.</p>'
      ),
      404
    );
  }

  return html(page(`Reçu ${receipt.numero}`, renderReceipt(receipt)), 200);
}

const money = (n: number) => `${new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')} F`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderReceipt(r: VerifiedReceipt): string {
  const reste = Math.max(0, r.total - r.paye);
  const date = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Abidjan',
  }).format(r.createdAt);

  const status = r.cancelled
    ? '<div class="badge bad">Commande annulée</div>'
    : reste > 0
      ? `<div class="badge warn">Reste à payer : ${money(reste)}</div>`
      : '<div class="badge ok">✓ Payé en entier</div>';

  const items = r.items
    .map(
      (it) =>
        `<div class="row"><span>${escapeHtml(it.libelle)} <span class="muted">× ${it.qte}</span></span><strong>${money(it.totalLigne)}</strong></div>`
    )
    .join('');

  return `
    <div class="shop">${escapeHtml(r.shopName)}</div>
    ${r.shopCity ? `<div class="muted center">${escapeHtml(r.shopCity)}</div>` : ''}
    <div class="verified">Reçu authentique, émis par cette boutique</div>
    <div class="sep"></div>
    <div class="row"><span class="muted">N°</span><strong>${escapeHtml(r.numero)}</strong></div>
    <div class="row"><span class="muted">Date</span><span>${escapeHtml(date)}</span></div>
    ${r.clientFirstName ? `<div class="row"><span class="muted">Client</span><span>${escapeHtml(r.clientFirstName)}</span></div>` : ''}
    <div class="sep"></div>
    ${items}
    <div class="sep"></div>
    ${r.remiseMontant > 0 ? `<div class="row"><span class="muted">Sous-total</span><span>${money(r.sousTotal)}</span></div><div class="row"><span class="muted">Remise</span><span>− ${money(r.remiseMontant)}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${money(r.total)}</span></div>
    <div class="row"><span class="muted">Payé</span><span>${money(r.paye)}</span></div>
    ${status}
  `;
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)} · MoroCash</title>
<style>
  body{margin:0;background:#F1F5F9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#0F172A;padding:24px 16px}
  .card{max-width:380px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;padding:20px;font-size:14px}
  h1{font-size:15px;margin:0 0 12px;text-align:center}
  .shop{font-weight:800;font-size:17px;text-transform:uppercase;letter-spacing:.04em;text-align:center}
  .center{text-align:center}
  .muted{color:#64748B}
  .verified{margin:10px auto 0;text-align:center;font-size:12px;font-weight:700;color:#15803D}
  .sep{border-top:1px dashed #CBD5E1;margin:12px 0}
  .row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}
  .total{font-weight:800;font-size:16px;color:#4F46E5}
  .badge{margin-top:12px;padding:8px;border-radius:10px;text-align:center;font-weight:700;font-size:13px}
  .ok{background:#ECFDF5;color:#047857}.warn{background:#FFF1F2;color:#BE123C}.bad{background:#F1F5F9;color:#475569}
  .foot{max-width:380px;margin:12px auto 0;text-align:center;font-size:11px;color:#94A3B8}
</style>
</head>
<body>
<main class="card">${body}</main>
<p class="foot">Reçu vérifié avec MoroCash</p>
</body>
</html>`;
}

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
