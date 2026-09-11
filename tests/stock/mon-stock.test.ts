import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from '@/server/modules/products/service';
import { addCode, findProductByCode, listCodes, removeCode } from '@/server/modules/products/codes';
import {
  cancelMovement,
  createAdjustment,
  createReception,
  listMovements,
} from '@/server/modules/stock/movements';
import { createStockCount } from '@/server/modules/stock/counts';
import { createOrder } from '@/server/modules/orders/createOrder';
import { createCustomer } from '@/server/modules/customers/service';
import { ownerPrisma as prisma } from '../support/owner-prisma';

/**
 * Ecran « Mon stock » : le catalogue, les codes, les receptions, les
 * ajustements et l'inventaire. Ce qui est deja couvert ailleurs n'est pas
 * repris ici (QR a la creation : tests/products ; somme des mouvements egale
 * le stock : tests/stock/movement-consistency).
 */

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`.slice(0, 15);
}

async function makeShop(nom: string, seed: string) {
  const { business, owner } = await registerBusiness(
    { businessNom: nom, telephone: uniquePhone(seed), pin: '123456' },
    {}
  );
  return { business, owner };
}

async function makeProduct(businessId: string, over: Record<string, unknown> = {}) {
  return createProduct(businessId, {
    nom: `Article ${randomUUID().slice(0, 8)}`,
    type: 'PRODUIT',
    prixVente: 10_000,
    prixAchat: 0,
    stock: 0,
    seuilAlerte: 5,
    unite: 'piece',
    ...over,
  } as Parameters<typeof createProduct>[1]);
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('Mon stock — catalogue', () => {
  let shop: Awaited<ReturnType<typeof makeShop>>;
  beforeAll(async () => {
    shop = await makeShop('Verif Stock Catalogue', '1');
  });

  it('modifier un produit : seuls les champs envoyes changent', async () => {
    const p = await makeProduct(shop.business.id, { nom: 'Bergere grise', prixVente: 250_000 });
    const modifie = await updateProduct(shop.business.id, p.id, { prixVente: 275_000 });
    expect(modifie?.prixVente).toBe(275_000);
    expect(modifie?.nom).toBe('Bergere grise');
    expect(modifie?.unite).toBe('piece');
  });

  it('desactiver un produit le sort du catalogue actif sans le supprimer', async () => {
    const p = await makeProduct(shop.business.id);
    await updateProduct(shop.business.id, p.id, { actif: false });

    const actifs = await listProducts(shop.business.id, { actif: true });
    expect(actifs.find((x) => x.id === p.id)).toBeUndefined();

    const tous = await listProducts(shop.business.id);
    expect(tous.find((x) => x.id === p.id)).toBeDefined();
  });

  it('supprimer un produit jamais vendu : possible', async () => {
    const p = await makeProduct(shop.business.id);
    await deleteProduct(shop.business.id, p.id);
    await expectAppError(getProduct(shop.business.id, p.id), 'PRODUCT_NOT_FOUND');
  });

  it('supprimer un produit qui a un historique : refuse, il faut le desactiver', async () => {
    const p = await makeProduct(shop.business.id, { stock: 10 });
    const client = await createCustomer(shop.business.id, { nom: 'Client Stock' });
    await createOrder(
      {
        businessId: shop.business.id,
        userId: shop.owner.id,
        role: 'OWNER',
        remiseMaxVendeur: 0,
        cashRegisterMode: shop.business.cashRegisterMode,
      },
      {
        clientUuid: randomUUID(),
        customerId: client.id,
        items: [{ productId: p.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }
    );
    await expectAppError(deleteProduct(shop.business.id, p.id), 'PRODUCT_HAS_HISTORY');
  });

  it('un produit d une autre boutique est invisible et intouchable', async () => {
    const autre = await makeShop('Verif Stock Autre', '2');
    const sien = await makeProduct(autre.business.id);
    await expectAppError(getProduct(shop.business.id, sien.id), 'PRODUCT_NOT_FOUND');
    await expectAppError(
      updateProduct(shop.business.id, sien.id, { prixVente: 1 }),
      'PRODUCT_NOT_FOUND'
    );
  });
});

describe('Mon stock — codes produit', () => {
  let shop: Awaited<ReturnType<typeof makeShop>>;
  beforeAll(async () => {
    shop = await makeShop('Verif Stock Codes', '3');
  });

  it('le code QR genere a la creation est principal et retrouve le produit', async () => {
    const p = await makeProduct(shop.business.id, { nom: 'Chandelier dore' });
    const codes = await listCodes(shop.business.id, p.id);
    expect(codes).toHaveLength(1);
    expect(codes[0].format).toBe('QR');
    expect(codes[0].origine).toBe('GENERE');
    expect(codes[0].estPrincipal).toBe(true);

    const trouve = await findProductByCode(shop.business.id, codes[0].code);
    expect(trouve?.id).toBe(p.id);
  });

  it('ajouter le code-barres du fabricant, puis le retrouver au scan', async () => {
    const p = await makeProduct(shop.business.id);
    await addCode(shop.business.id, p.id, {
      code: '3017620422003',
      format: 'EAN13',
      origine: 'SCANNE',
      estPrincipal: false,
    });
    const trouve = await findProductByCode(shop.business.id, '3017620422003');
    expect(trouve?.id).toBe(p.id);
    expect(await listCodes(shop.business.id, p.id)).toHaveLength(2);
  });

  it('un code deja utilise dans la boutique est refuse', async () => {
    const a = await makeProduct(shop.business.id);
    const b = await makeProduct(shop.business.id);
    await addCode(shop.business.id, a.id, {
      code: '5000112548167',
      format: 'EAN13',
      origine: 'SCANNE',
      estPrincipal: false,
    });
    await expectAppError(
      addCode(shop.business.id, b.id, {
        code: '5000112548167',
        format: 'EAN13',
        origine: 'SCANNE',
        estPrincipal: false,
      }),
      'CODE_ALREADY_USED'
    );
  });

  it('le meme code peut exister dans une autre boutique', async () => {
    const autre = await makeShop('Verif Stock Codes Bis', '4');
    const sien = await makeProduct(autre.business.id);
    await addCode(autre.business.id, sien.id, {
      code: '5000112548167',
      format: 'EAN13',
      origine: 'SCANNE',
      estPrincipal: false,
    });
    const trouve = await findProductByCode(autre.business.id, '5000112548167');
    expect(trouve?.id).toBe(sien.id);
  });

  it('un code inconnu ne ramene rien', async () => {
    await expectAppError(findProductByCode(shop.business.id, 'INT-000000000'), 'PRODUCT_NOT_FOUND');
  });

  it('retirer un code : il ne scanne plus', async () => {
    const p = await makeProduct(shop.business.id);
    const code = await addCode(shop.business.id, p.id, {
      code: '4006381333931',
      format: 'EAN13',
      origine: 'MANUEL',
      estPrincipal: false,
    });
    await removeCode(shop.business.id, p.id, code.id);
    await expectAppError(findProductByCode(shop.business.id, '4006381333931'), 'PRODUCT_NOT_FOUND');
  });
});

describe('Mon stock — receptions et cout moyen pondere', () => {
  let shop: Awaited<ReturnType<typeof makeShop>>;
  beforeAll(async () => {
    shop = await makeShop('Verif Stock Reception', '5');
  });

  it('premiere reception : stock entre, CMP egal au prix d achat', async () => {
    const p = await makeProduct(shop.business.id, { stock: 0 });
    const res = await createReception(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      fournisseur: 'Grossiste Adjame',
      lignes: [{ productId: p.id, quantite: 10, prixAchatUnitaire: 6_000 }],
    });
    expect(res.status).toBe('CREATED');
    expect(res.reception.totalArticles).toBe(10);
    expect(res.reception.totalMontant).toBe(60_000);

    const apres = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(apres.stock).toBe(10);
    expect(apres.cmp).toBe(6_000);
  });

  it('seconde reception a un autre prix : CMP recalcule au prorata', async () => {
    const p = await makeProduct(shop.business.id, { stock: 0 });
    await createReception(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      lignes: [{ productId: p.id, quantite: 10, prixAchatUnitaire: 1_000 }],
    });
    await createReception(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      lignes: [{ productId: p.id, quantite: 30, prixAchatUnitaire: 2_000 }],
    });
    // (10*1000 + 30*2000) / 40 = 1750
    const apres = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(apres.stock).toBe(40);
    expect(apres.cmp).toBe(1_750);
  });

  it('le mouvement d entree porte stockAvant, stockApres et le prix d achat', async () => {
    const p = await makeProduct(shop.business.id, { stock: 5 });
    const res = await createReception(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      lignes: [{ productId: p.id, quantite: 7, prixAchatUnitaire: 3_000 }],
    });
    const mvts = await prisma.stockMovement.findMany({ where: { receptionId: res.reception.id } });
    expect(mvts).toHaveLength(1);
    expect(mvts[0].type).toBe('ENTREE');
    expect(mvts[0].quantite).toBe(7);
    expect(mvts[0].stockAvant).toBe(5);
    expect(mvts[0].stockApres).toBe(12);
    expect(mvts[0].prixAchatUnitaire).toBe(3_000);
  });

  it('meme reception rejouee hors ligne : aucun double comptage', async () => {
    const p = await makeProduct(shop.business.id, { stock: 0 });
    const uuid = randomUUID();
    const input = {
      clientUuid: uuid,
      lignes: [{ productId: p.id, quantite: 4, prixAchatUnitaire: 500 }],
    };
    const a = await createReception(shop.business.id, shop.owner.id, input);
    const b = await createReception(shop.business.id, shop.owner.id, input);
    expect(a.status).toBe('CREATED');
    expect(b.status).toBe('DUPLICATE');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(4);
  });

  it('deux lignes du meme produit dans une reception : fusionnees, stock juste', async () => {
    const p = await makeProduct(shop.business.id, { stock: 0 });
    const res = await createReception(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      lignes: [
        { productId: p.id, quantite: 2, prixAchatUnitaire: 1_000 },
        { productId: p.id, quantite: 3, prixAchatUnitaire: 1_000 },
      ],
    });
    expect(res.reception.totalArticles).toBe(5);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(5);
    expect(await prisma.stockMovement.count({ where: { receptionId: res.reception.id } })).toBe(1);
  });

  it('produit d une autre boutique dans une reception : refuse', async () => {
    const autre = await makeShop('Verif Stock Reception Autre', '6');
    const sien = await makeProduct(autre.business.id);
    await expectAppError(
      createReception(shop.business.id, shop.owner.id, {
        clientUuid: randomUUID(),
        lignes: [{ productId: sien.id, quantite: 1, prixAchatUnitaire: 100 }],
      }),
      'PRODUCT_NOT_FOUND'
    );
  });
});

describe('Mon stock — casse, perte et annulation de mouvement', () => {
  let shop: Awaited<ReturnType<typeof makeShop>>;
  beforeAll(async () => {
    shop = await makeShop('Verif Stock Ajustement', '7');
  });

  it('une casse sort du stock, avec motif obligatoire et valorisation au CMP', async () => {
    const p = await makeProduct(shop.business.id, { stock: 0 });
    await createReception(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      lignes: [{ productId: p.id, quantite: 10, prixAchatUnitaire: 2_500 }],
    });

    const res = await createAdjustment(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      productId: p.id,
      type: 'CASSE',
      quantite: 2,
      motif: 'Casse au transport',
    });
    expect(res.status).toBe('CREATED');
    expect(res.movement.quantite).toBe(-2);
    expect(res.movement.stockAvant).toBe(10);
    expect(res.movement.stockApres).toBe(8);
    expect(res.movement.coutUnitaire).toBe(2_500);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(8);
  });

  it('annuler un ajustement rend le stock et laisse une trace, sans rien supprimer', async () => {
    const p = await makeProduct(shop.business.id, { stock: 20 });
    const res = await createAdjustment(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      productId: p.id,
      type: 'PERTE',
      quantite: 5,
      motif: 'Erreur de saisie',
    });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(15);

    const inverse = await cancelMovement(shop.business.id, shop.owner.id, res.movement.id);
    expect(inverse.quantite).toBe(5);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(20);

    const original = await prisma.stockMovement.findUniqueOrThrow({
      where: { id: res.movement.id },
    });
    expect(original.annule).toBe(true);
    expect(original.mouvementInverseId).toBe(inverse.id);
  });

  it('annuler deux fois le meme mouvement : refuse', async () => {
    const p = await makeProduct(shop.business.id, { stock: 10 });
    const res = await createAdjustment(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      productId: p.id,
      type: 'CASSE',
      quantite: 1,
      motif: 'Casse',
    });
    await cancelMovement(shop.business.id, shop.owner.id, res.movement.id);
    await expectAppError(
      cancelMovement(shop.business.id, shop.owner.id, res.movement.id),
      'ORDER_ALREADY_CANCELLED'
    );
  });

  it('un mouvement issu d une vente ne s annule pas ici : on annule la commande', async () => {
    const p = await makeProduct(shop.business.id, { stock: 10 });
    const client = await createCustomer(shop.business.id, { nom: 'Client Ajust' });
    const vente = await createOrder(
      {
        businessId: shop.business.id,
        userId: shop.owner.id,
        role: 'OWNER',
        remiseMaxVendeur: 0,
        cashRegisterMode: shop.business.cashRegisterMode,
      },
      {
        clientUuid: randomUUID(),
        customerId: client.id,
        items: [{ productId: p.id, qte: 2 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }
    );
    const mvt = await prisma.stockMovement.findFirstOrThrow({
      where: { orderId: vente.order.id },
    });
    await expectAppError(
      cancelMovement(shop.business.id, shop.owner.id, mvt.id),
      'ORDER_IMMUTABLE'
    );
  });

  it('meme ajustement rejoue hors ligne : une seule sortie de stock', async () => {
    const p = await makeProduct(shop.business.id, { stock: 10 });
    const uuid = randomUUID();
    const input = {
      clientUuid: uuid,
      productId: p.id,
      type: 'CASSE' as const,
      quantite: 3,
      motif: 'Casse',
    };
    const a = await createAdjustment(shop.business.id, shop.owner.id, input);
    const b = await createAdjustment(shop.business.id, shop.owner.id, input);
    expect(a.status).toBe('CREATED');
    expect(b.status).toBe('DUPLICATE');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(7);
  });
});

describe('Mon stock — inventaire (comptage)', () => {
  let shop: Awaited<ReturnType<typeof makeShop>>;
  beforeAll(async () => {
    shop = await makeShop('Verif Stock Inventaire', '8');
  });

  it('ecarts positifs et negatifs : stock aligne, ecarts valorises au CMP', async () => {
    const manquant = await makeProduct(shop.business.id, { stock: 0 });
    const surplus = await makeProduct(shop.business.id, { stock: 0 });
    const juste = await makeProduct(shop.business.id, { stock: 0 });
    for (const p of [manquant, surplus, juste]) {
      await createReception(shop.business.id, shop.owner.id, {
        clientUuid: randomUUID(),
        lignes: [{ productId: p.id, quantite: 10, prixAchatUnitaire: 1_000 }],
      });
    }

    const res = await createStockCount(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      perimetre: 'TOUT',
      lignes: [
        { productId: manquant.id, stockCompte: 8 },
        { productId: surplus.id, stockCompte: 13 },
        { productId: juste.id, stockCompte: 10 },
      ],
    });

    expect(res.status).toBe('CREATED');
    expect(res.count.nbProduits).toBe(3);
    expect(res.count.nbEcarts).toBe(2);
    expect(res.count.ecartUnites).toBe(5); // 2 manquants + 3 en trop
    expect(res.count.ecartValeur).toBe(5_000);

    expect((await prisma.product.findUniqueOrThrow({ where: { id: manquant.id } })).stock).toBe(8);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: surplus.id } })).stock).toBe(13);

    // Le produit sans ecart ne genere aucun mouvement.
    expect(
      await prisma.stockMovement.count({ where: { countId: res.count.id, productId: juste.id } })
    ).toBe(0);

    const mvt = await prisma.stockMovement.findFirstOrThrow({
      where: { countId: res.count.id, productId: manquant.id },
    });
    expect(mvt.type).toBe('INVENTAIRE');
    expect(mvt.quantite).toBe(-2);
    expect(mvt.stockAvant).toBe(10);
    expect(mvt.stockApres).toBe(8);
  });

  it('meme comptage rejoue hors ligne : pas de second ajustement', async () => {
    const p = await makeProduct(shop.business.id, { stock: 10 });
    const uuid = randomUUID();
    const input = { clientUuid: uuid, perimetre: 'TOUT', lignes: [{ productId: p.id, stockCompte: 7 }] };
    const a = await createStockCount(shop.business.id, shop.owner.id, input);
    const b = await createStockCount(shop.business.id, shop.owner.id, input);
    expect(a.status).toBe('CREATED');
    expect(b.status).toBe('DUPLICATE');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stock).toBe(7);
  });

  it('l historique des mouvements se filtre par produit', async () => {
    const p = await makeProduct(shop.business.id, { stock: 10 });
    await createAdjustment(shop.business.id, shop.owner.id, {
      clientUuid: randomUUID(),
      productId: p.id,
      type: 'CASSE',
      quantite: 1,
      motif: 'Casse',
    });
    const duProduit = await listMovements(shop.business.id, { productId: p.id });
    expect(duProduit.length).toBeGreaterThan(0);
    expect(duProduit.every((m) => m.productId === p.id)).toBe(true);
  });
});
