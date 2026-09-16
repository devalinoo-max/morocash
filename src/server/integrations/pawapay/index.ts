import { AppError } from '@/server/shared/errors';

/**
 * Client pawaPay (API v2) — uniquement ce dont les abonnements ont besoin :
 * la Payment Page (page de paiement hébergée par pawaPay) et la lecture du
 * statut d'un dépôt. Doc : https://docs.pawapay.io/v2/docs/payment_page
 *
 * PAWAPAY_API_URL : https://api.sandbox.pawapay.io (tests) ou https://api.pawapay.io (prod).
 */

const DEFAULT_API_URL = 'https://api.sandbox.pawapay.io';

/** Pays de MoroCash (ISO 3166-1 alpha-2, voir register.ts) → code attendu par pawaPay (alpha-3). */
export const PAWAPAY_COUNTRY: Record<string, string> = {
  CI: 'CIV',
  SN: 'SEN',
  BJ: 'BEN',
  TG: 'TGO',
  ML: 'MLI',
  BF: 'BFA',
};

export type PawapayDepositStatus = 'ACCEPTED' | 'PROCESSING' | 'IN_RECONCILIATION' | 'COMPLETED' | 'FAILED';

export interface PawapayDeposit {
  depositId: string;
  status: PawapayDepositStatus;
  amount: string;
  currency: string;
  country: string;
  payer?: { type?: string; accountDetails?: { phoneNumber?: string; provider?: string } };
  providerTransactionId?: string;
  failureReason?: { failureCode?: string; failureMessage?: string };
  created?: string;
}

interface FailureBody {
  status?: string;
  failureReason?: { failureCode?: string; failureMessage?: string };
}

function config() {
  const token = process.env.PAWAPAY_API_TOKEN;
  if (!token) {
    throw new AppError('SERVER_ERROR', "Le paiement en ligne n'est pas encore configuré.");
  }
  const baseUrl = (process.env.PAWAPAY_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
  return { token, baseUrl };
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const { token, baseUrl } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

export interface PaymentPageInput {
  depositId: string;
  returnUrl: string;
  amount: number;
  currency: string;
  country: string;
  reason: string;
  customerMessage: string;
}

/** POST /v2/paymentpage → URL où envoyer le client (valable 15 minutes). */
export async function createPaymentPage(input: PaymentPageInput): Promise<string> {
  const { status, data } = await call<{ redirectUrl?: string } & FailureBody>('POST', '/v2/paymentpage', {
    depositId: input.depositId,
    returnUrl: input.returnUrl,
    customerMessage: input.customerMessage,
    amountDetails: { amount: String(input.amount), currency: input.currency },
    country: input.country,
    reason: input.reason,
    language: 'FR',
  });

  // pawaPay répond 201 Created (testé en sandbox), pas 200 comme dans sa doc.
  if (status >= 200 && status < 300 && data.redirectUrl) {
    return data.redirectUrl;
  }

  const code = data.failureReason?.failureCode ?? `HTTP_${status}`;
  throw new Error(`pawaPay paymentpage refusée: ${code} ${data.failureReason?.failureMessage ?? ''}`.trim());
}

/** GET /v2/deposits/{depositId} — null tant que pawaPay ne connaît pas le dépôt. */
export async function getDeposit(depositId: string): Promise<PawapayDeposit | null> {
  const { status, data } = await call<{ status?: 'FOUND' | 'NOT_FOUND'; data?: PawapayDeposit }>(
    'GET',
    `/v2/deposits/${encodeURIComponent(depositId)}`
  );

  if (status === 200 && data.status === 'FOUND' && data.data) return data.data;
  if (status === 200 && data.status === 'NOT_FOUND') return null;
  if (status === 404) return null;

  throw new Error(`pawaPay statut du dépôt illisible: HTTP_${status}`);
}
