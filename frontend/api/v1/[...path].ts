import type { VercelRequest, VercelResponse } from '@vercel/node';

// Équivalent Vercel du proxy same-origin de server.ts (PROXIED_PREFIXES) : le
// navigateur ne parle qu'au domaine du frontend, donc le cookie de session
// (httpOnly, SameSite=Lax) et le cookie CSRF circulent normalement — un appel
// direct cross-origin vers le backend ne les recevrait pas.
//
// /api/v1/products/labels, /api/v1/receipts/pdf et /api/v1/plans ont leur
// propre fichier (routage Vercel : un chemin littéral est toujours prioritaire
// sur ce catch-all), donc jamais atteints ici.
const PROXIED_PREFIXES = [
  'auth',
  'categories',
  'products',
  'customers',
  'orders',
  'cash',
  'expenses',
  'stock',
  'dashboard',
  'reports',
  'users',
];

const EXCLUDED_REQUEST_HEADERS = ['host', 'connection', 'content-length'];
const EXCLUDED_RESPONSE_HEADERS = ['content-encoding', 'transfer-encoding', 'connection'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const backendOrigin = process.env.BACKEND_ORIGIN;
  if (!backendOrigin) {
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: "BACKEND_ORIGIN n'est pas configuré côté frontend." },
    });
    return;
  }

  const segments = ([] as string[]).concat(req.query.path ?? []);
  if (!PROXIED_PREFIXES.includes(segments[0])) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route API inconnue.' } });
    return;
  }

  const targetUrl = new URL(`/api/v1/${segments.join('/')}`, backendOrigin);
  const queryIndex = req.url?.indexOf('?') ?? -1;
  if (queryIndex >= 0) {
    targetUrl.search = req.url!.slice(queryIndex + 1);
  }

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || EXCLUDED_REQUEST_HEADERS.includes(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const method = req.method ?? 'GET';
  const isJsonBody = (req.headers['content-type'] ?? '').includes('application/json');
  const body = isJsonBody && method !== 'GET' && method !== 'HEAD' ? JSON.stringify(req.body ?? {}) : undefined;

  const upstream = await fetch(targetUrl, { method, headers, body, redirect: 'manual' });

  res.status(upstream.status);
  const setCookies = upstream.headers.getSetCookie();
  if (setCookies.length > 0) {
    res.setHeader('set-cookie', setCookies);
  }
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || EXCLUDED_RESPONSE_HEADERS.includes(lower)) return;
    res.setHeader(key, value);
  });

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.send(buffer);
}
