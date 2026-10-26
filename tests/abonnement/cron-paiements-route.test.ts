import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route /api/cron/paiements-en-attente, appelée toutes les 5 minutes par
 * GitHub Actions. Le rattrapage lui-même est simulé ici (testé dans
 * rattrapage-paiements.test.ts) : on vérifie l'accès et la réponse.
 */
const reconcile = vi.fn();
vi.mock('@/server/modules/subscriptions/service', () => ({
  reconcilePendingPayments: (...args: unknown[]) => reconcile(...args),
}));

const { GET } = await import('@/app/api/cron/paiements-en-attente/route');

const URL_CRON = 'https://morocash.vercel.app/api/cron/paiements-en-attente';
const SECRET_ORIGINAL = process.env.CRON_SECRET;

describe('GET /api/cron/paiements-en-attente', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'secret-de-test';
    reconcile.mockReset();
    reconcile.mockResolvedValue({ verifies: 2, reussis: 1, echoues: 0, expires: 1, enAttente: 0, erreurs: 0 });
  });

  afterEach(() => {
    process.env.CRON_SECRET = SECRET_ORIGINAL;
  });

  it('refuse un appel sans secret, sans rien vérifier', async () => {
    const res = await GET(new Request(URL_CRON));
    expect(res.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('refuse un mauvais secret', async () => {
    const res = await GET(new Request(URL_CRON, { headers: { authorization: 'Bearer mauvais' } }));
    expect(res.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('refuse tout appel quand CRON_SECRET n’est pas configuré', async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(new Request(URL_CRON, { headers: { authorization: 'Bearer ' } }));
    expect(res.status).toBe(401);
    expect(reconcile).not.toHaveBeenCalled();
  });

  it('lance le rattrapage avec le bon secret et renvoie le bilan', async () => {
    const res = await GET(new Request(URL_CRON, { headers: { authorization: 'Bearer secret-de-test' } }));
    expect(res.status).toBe(200);
    expect(reconcile).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { verifies: 2, reussis: 1, echoues: 0, expires: 1, enAttente: 0, erreurs: 0 },
    });
  });

  it('répond en erreur (pour que GitHub le signale) si le rattrapage plante', async () => {
    reconcile.mockRejectedValue(new Error('base injoignable'));
    const res = await GET(new Request(URL_CRON, { headers: { authorization: 'Bearer secret-de-test' } }));
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});
