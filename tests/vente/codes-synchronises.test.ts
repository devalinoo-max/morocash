import { beforeAll, describe, expect, it, vi } from 'vitest';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { addCode, addCodeSchema, listCodes, removeCode, setPrimaryCode } from '@/server/modules/products/codes';
import { serializeProductCode } from '@/server/serializers/product';
import { AppError } from '@/server/shared/errors';

/**
 * Les appels que l'application envoie pour les codes d'un produit, joués
 * contre la vraie logique serveur et la vraie base.
 *
 * Seul le transport HTTP est remplacé : chaque requête du client
 * (frontend/src/api/client) est aiguillée vers le module serveur que la route
 * appellerait, et une erreur serveur revient sous la forme que le client
 * reçoit (ApiError avec son code).
 */

let businessId = '';
const appels: string[] = [];

vi.mock('../../frontend/src/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../frontend/src/api/client')>();
  const serialise = (codes: Awaited<ReturnType<typeof listCodes>>) =>
    JSON.parse(JSON.stringify(codes.map(serializeProductCode)));

  const route = async (methode: string, chemin: string, corps?: unknown) => {
    appels.push(`${methode} ${chemin}`);
    const url = new URL(chemin, 'http://x');
    const m = /^\/products\/([^/]+)\/codes$/.exec(url.pathname);
    if (!m) throw new Error(`route non simulée : ${methode} ${chemin}`);
    const productId = m[1];
    try {
      if (methode === 'GET') return { codes: serialise(await listCodes(businessId, productId)) };
      if (methode === 'POST') {
        const code = await addCode(businessId, productId, addCodeSchema.parse(corps));
        return { code: serialise([code])[0] };
      }
      if (methode === 'PATCH') {
        const { codeId } = corps as { codeId: string };
        return { codes: serialise(await setPrimaryCode(businessId, productId, codeId)) };
      }
      if (methode === 'DELETE') {
        await removeCode(businessId, productId, url.searchParams.get('codeId')!);
        return { deleted: true };
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw new original.ApiError({ code: error.code, message: error.message } as never);
      }
      throw error;
    }
    throw new Error(`méthode non simulée : ${methode}`);
  };

  return {
    ...original,
    api: {
      get: (p: string) => route('GET', p),
      post: (p: string, b?: unknown) => route('POST', p, b),
      patch: (p: string, b?: unknown) => route('PATCH', p, b),
      delete: (p: string) => route('DELETE', p),
    },
  };
});

const { syncProductCodes, codeFieldsFromApi } = await import('../../frontend/src/api/products');

async function codesServeur(productId: string) {
  return JSON.parse(JSON.stringify((await listCodes(businessId, productId)).map(serializeProductCode)));
}

describe('Codes d un produit — ce que l app envoie, gardé par le serveur', () => {
  let savon = '';
  let lait = '';

  beforeAll(async () => {
    const { business } = await registerBusiness(
      { businessNom: 'Verif Sync Codes', telephone: `225${Date.now().toString().slice(-8)}3`, pin: '123456' },
      {}
    );
    businessId = business.id;
    const base = { type: 'PRODUIT' as const, prixVente: 500, prixAchat: 300, stock: 5, seuilAlerte: 1, unite: 'pièce' };
    savon = (await createProduct(businessId, { ...base, nom: 'Savon' })).id;
    lait = (await createProduct(businessId, { ...base, nom: 'Lait' })).id;
  });

  it('un code-barres scanné est ajouté, et n est pas renvoyé s il existe déjà', async () => {
    appels.length = 0;
    const codes = await syncProductCodes(savon, await codesServeur(savon), {
      add: [{ code: '6009510800210', format: 'EAN13', origine: 'SCANNE' }],
    });
    expect(codeFieldsFromApi(savon, codes).barcode).toBe('6009510800210');
    expect(await codesServeur(savon)).toHaveLength(2); // QR interne + EAN

    appels.length = 0;
    await syncProductCodes(savon, await codesServeur(savon), {
      add: [{ code: '6009510800210', format: 'EAN13', origine: 'SCANNE' }],
    });
    expect(appels.filter((a) => a.startsWith('POST'))).toEqual([]);
  });

  it('réponse perdue : le renvoi retrouve le code déjà enregistré au lieu d échouer', async () => {
    // L'app croit le produit sans ce code (réponse jamais revenue).
    await addCode(businessId, savon, { code: '96385074', format: 'EAN8', origine: 'MANUEL', estPrincipal: false });
    const codes = await syncProductCodes(savon, [], {
      add: [{ code: '96385074', format: 'EAN8', origine: 'MANUEL' }],
    });
    expect(codes.map((c: { code: string }) => c.code)).toContain('96385074');
  });

  it('un code déjà pris par un autre article est refusé', async () => {
    await expect(
      syncProductCodes(lait, await codesServeur(lait), {
        add: [{ code: '6009510800210', format: 'EAN13', origine: 'MANUEL' }],
      })
    ).rejects.toMatchObject({ code: 'CODE_ALREADY_USED' });
  });

  it('transfert : retiré du savon, puis repris par le lait', async () => {
    await syncProductCodes(savon, await codesServeur(savon), { remove: ['6009510800210'] });
    const codesLait = await syncProductCodes(lait, await codesServeur(lait), {
      add: [{ code: '6009510800210', format: 'EAN13', origine: 'MANUEL' }],
    });
    expect(codeFieldsFromApi(lait, codesLait).barcode).toBe('6009510800210');
    expect((await codesServeur(savon)).map((c: { code: string }) => c.code)).not.toContain('6009510800210');
  });

  it('le code principal choisi est enregistré, et devient le code-barres du produit', async () => {
    const codes = await syncProductCodes(savon, await codesServeur(savon), {
      add: [{ code: '04252614', format: 'UPCE', origine: 'MANUEL' }],
      primary: '04252614',
    });
    expect(codes.filter((c: { estPrincipal: boolean }) => c.estPrincipal).map((c: { code: string }) => c.code)).toEqual(['04252614']);
    expect(codeFieldsFromApi(savon, await codesServeur(savon)).barcode).toBe('04252614');
  });

  it('le code maison (QR généré) n est jamais retiré', async () => {
    const avant = await codesServeur(savon);
    const interne = avant.find((c: { origine: string }) => c.origine === 'GENERE').code;
    await syncProductCodes(savon, avant, { remove: [interne] });
    expect((await codesServeur(savon)).map((c: { code: string }) => c.code)).toContain(interne);
  });
});
