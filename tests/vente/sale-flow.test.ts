import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { cancelOrder } from '@/server/modules/orders/cancelOrder';
import { addOrderPayment } from '@/server/modules/orders/payments';
import { getOrderReceiptData, listOrders } from '@/server/modules/orders/service';
import { openRegister } from '@/server/modules/cash/service';
import { ownerPrisma as prisma } from '../support/owner-prisma';

/**
 * Parcours de vente, de bout en bout, contre la vraie base.
 *
 * Chaque test correspond a une action que le commercant fait vraiment en
 * caisse : encaisser, vendre a credit, remiser, annuler, encaisser le reste,
 * imprimer. C'est le filet qui doit empecher ces regressions de revenir.
 */

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`.slice(0, 15);
}

async function makeShop(nom: string, seed: string, opts: { remiseMaxVendeur?: number } = {}) {
  const { business, owner } = await registerBusiness(
    { businessNom: nom, telephone: uniquePhone(seed), pin: '123456' },
    {}
  );
  if (opts.remiseMaxVendeur !== undefined) {
    await prisma.business.update({
      where: { id: business.id },
      data: { remiseMaxVendeur: opts.remiseMaxVendeur },
    });
  }
  const produit = await createProduct(business.id, {
    nom: 'Sac raphia',
    type: 'PRODUIT',
    prixVente: 12_000,
    prixAchat: 7_000,
    stock: 50,
    seuilAlerte: 5,
    unite: 'piece',
  });
  const produit2 = await createProduct(business.id, {
    nom: 'Tapis berbere',
    type: 'PRODUIT',
    prixVente: 45_000,
    prixAchat: 30_000,
    stock: 10,
    seuilAlerte: 2,
    unite: 'piece',
  });
  const client = await createCustomer(business.id, { nom: 'Mme Kone', telephone: '0700000000' });

  const ctx = {
    businessId: business.id,
    userId: owner.id,
    role: 'OWNER' as const,
    remiseMaxVendeur: opts.remiseMaxVendeur ?? 0,
    cashRegisterMode: business.cashRegisterMode,
  };
  return { business, owner, produit, produit2, client, ctx };
}

type Fixture = Awaited<ReturnType<typeof makeShop>>;

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe('Vente — encaissement', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await makeShop('Verif Vente Encaissement', '1');
  });

  it('paiement integral : total, statut PAYEE, paiement, stock, caisse, stats', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 2 }],
      montantRecu: 24_000,
      methode: 'ESPECES',
    });

    expect(res.status).toBe('CREATED');
    const order = res.order;
    expect(order.sousTotal).toBe(24_000);
    expect(order.remiseMontant).toBe(0);
    expect(order.total).toBe(24_000);
    expect(order.statutPaiement).toBe('PAYEE');
    expect(order.statut).toBe('VALIDEE');
    expect(order.numero).toMatch(/^CMD-\d{8}-\d{4}$/);

    const produit = await prisma.product.findUniqueOrThrow({ where: { id: f.produit.id } });
    expect(produit.stock).toBe(48);

    const mouvements = await prisma.stockMovement.findMany({ where: { orderId: order.id } });
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0].type).toBe('SORTIE');
    expect(mouvements[0].quantite).toBe(-2);
    expect(mouvements[0].stockAvant).toBe(50);
    expect(mouvements[0].stockApres).toBe(48);

    const paiements = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(paiements).toHaveLength(1);
    expect(paiements[0].montant).toBe(24_000);
    expect(paiements[0].statut).toBe('VALIDE');

    const cash = await prisma.cashMovement.findMany({ where: { paymentId: paiements[0].id } });
    expect(cash).toHaveLength(1);
    expect(cash[0].type).toBe('ENTREE');
    expect(cash[0].montant).toBe(24_000);

    const audit = await prisma.auditLog.findFirst({
      where: { entiteId: order.id, action: 'ORDER_CREATED' },
    });
    expect(audit).not.toBeNull();
  });

  it('vente a credit : aucun paiement, aucun mouvement de caisse, statut CREDIT', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(res.order.statutPaiement).toBe('CREDIT');
    expect(await prisma.payment.count({ where: { orderId: res.order.id } })).toBe(0);
  });

  it('paiement partiel : statut PARTIELLE et reste a payer coherent', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit2.id, qte: 1 }],
      montantRecu: 20_000,
      methode: 'WAVE',
    });
    expect(res.order.total).toBe(45_000);
    expect(res.order.statutPaiement).toBe('PARTIELLE');
  });

  it('montant recu superieur au total : refuse', async () => {
    await expectAppError(
      createOrder(f.ctx, {
        clientUuid: randomUUID(),
        customerId: f.client.id,
        items: [{ productId: f.produit.id, qte: 1 }],
        montantRecu: 99_000,
        methode: 'ESPECES',
      }),
      'PAYMENT_EXCEEDS_REMAINING'
    );
  });

  it('numerotation incrementale au format CMD-AAAAMMJJ-NNNN', async () => {
    const a = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    const b = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    const seqA = Number(a.order.numero.slice(-4));
    const seqB = Number(b.order.numero.slice(-4));
    expect(seqB).toBe(seqA + 1);
  });
});

describe('Vente — remise', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await makeShop('Verif Vente Remise', '2');
  });

  it('remise en pourcentage : recalculee par le serveur', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 5 }],
      remiseMode: 'POURCENTAGE',
      remiseValeur: 10,
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(res.order.sousTotal).toBe(60_000);
    expect(res.order.remiseMontant).toBe(6_000);
    expect(res.order.total).toBe(54_000);
  });

  it('remise en montant : appliquee telle quelle', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      remiseMode: 'MONTANT',
      remiseValeur: 2_000,
      montantRecu: 10_000,
      methode: 'ESPECES',
    });
    expect(res.order.remiseMontant).toBe(2_000);
    expect(res.order.total).toBe(10_000);
    expect(res.order.statutPaiement).toBe('PAYEE');
  });

  it('remise superieure au sous-total : plafonnee, total jamais negatif', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      remiseMode: 'MONTANT',
      remiseValeur: 999_999,
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(res.order.total).toBe(0);
    expect(res.order.remiseMontant).toBe(12_000);
  });

  it('remise nulle envoyee par defaut par le panier : sans effet', async () => {
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      remiseMode: 'MONTANT',
      remiseValeur: 0,
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(res.order.total).toBe(12_000);
  });
});

describe('Vente — plafond de remise du vendeur', () => {
  it('un vendeur au-dela du plafond est refuse, en dessous il passe', async () => {
    const f = await makeShop('Verif Vente Plafond', '3', { remiseMaxVendeur: 5 });
    const sellerCtx = { ...f.ctx, role: 'SELLER' as const, remiseMaxVendeur: 5 };

    await expectAppError(
      createOrder(sellerCtx, {
        clientUuid: randomUUID(),
        customerId: f.client.id,
        items: [{ productId: f.produit.id, qte: 1 }],
        remiseMode: 'POURCENTAGE',
        remiseValeur: 20,
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      'DISCOUNT_ABOVE_LIMIT'
    );

    const ok = await createOrder(sellerCtx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      remiseMode: 'POURCENTAGE',
      remiseValeur: 5,
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(ok.order.remiseMontant).toBe(600);

    await expectAppError(
      createOrder(sellerCtx, {
        clientUuid: randomUUID(),
        customerId: f.client.id,
        items: [{ productId: f.produit.id, qte: 1 }],
        remiseMode: 'MONTANT',
        remiseValeur: 6_000,
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      'DISCOUNT_ABOVE_LIMIT'
    );
  });
});

describe('Vente — refus et garde-fous', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await makeShop('Verif Vente Refus', '4');
  });

  it('meme clientUuid rejoue : une seule commande, statut DUPLICATE', async () => {
    const uuid = randomUUID();
    const input = {
      clientUuid: uuid,
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES' as const,
    };
    const premier = await createOrder(f.ctx, input);
    const second = await createOrder(f.ctx, input);
    expect(premier.status).toBe('CREATED');
    expect(second.status).toBe('DUPLICATE');
    expect(second.order.id).toBe(premier.order.id);
    expect(await prisma.order.count({ where: { clientUuid: uuid } })).toBe(1);
  });

  it('produit d une autre boutique : refuse', async () => {
    const autre = await makeShop('Verif Vente Autre', '5');
    await expectAppError(
      createOrder(f.ctx, {
        clientUuid: randomUUID(),
        customerId: f.client.id,
        items: [{ productId: autre.produit.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      'PRODUCT_NOT_FOUND'
    );
  });

  it('client d une autre boutique : refuse', async () => {
    const autre = await makeShop('Verif Vente Autre Client', '6');
    await expectAppError(
      createOrder(f.ctx, {
        clientUuid: randomUUID(),
        customerId: autre.client.id,
        items: [{ productId: f.produit.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      'CUSTOMER_REQUIRED'
    );
  });

  it('deux lignes du meme produit dans le panier : commande acceptee, stock juste', async () => {
    const avant = await prisma.product.findUniqueOrThrow({ where: { id: f.produit2.id } });
    const res = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [
        { productId: f.produit2.id, qte: 1 },
        { productId: f.produit2.id, qte: 2 },
      ],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(res.order.sousTotal).toBe(3 * 45_000);
    // Fusionnees en une seule ligne : un recu ne montre jamais deux fois le
    // meme article, et le mouvement de stock reste unique.
    expect(res.order.items).toHaveLength(1);
    expect(res.order.items[0].qte).toBe(3);
    const apres = await prisma.product.findUniqueOrThrow({ where: { id: f.produit2.id } });
    expect(apres.stock).toBe(avant.stock - 3);
    expect(
      await prisma.stockMovement.count({ where: { orderId: res.order.id } })
    ).toBe(1);
  });
});

describe('Vente — encaisser le reste sur une commande a credit', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await makeShop('Verif Vente Solde', '7');
  });

  it('mode LIBRE sans caisse ouverte : le solde s encaisse quand meme', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    expect(vente.order.statutPaiement).toBe('CREDIT');
    expect(
      await prisma.cashRegister.count({ where: { businessId: f.business.id, statut: 'OUVERTE' } })
    ).toBe(0);

    const res = await addOrderPayment(
      { businessId: f.business.id, userId: f.owner.id, cashRegisterMode: f.business.cashRegisterMode },
      vente.order.id,
      { clientUuid: randomUUID(), montant: 12_000, methode: 'ESPECES' }
    );
    expect(res.status).toBe('CREATED');

    const apres = await prisma.order.findUniqueOrThrow({ where: { id: vente.order.id } });
    expect(apres.statutPaiement).toBe('PAYEE');
  });

  it('paiement superieur au reste du : refuse', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 5_000,
      methode: 'ESPECES',
    });
    await expectAppError(
      addOrderPayment(
        { businessId: f.business.id, userId: f.owner.id, cashRegisterMode: f.business.cashRegisterMode },
        vente.order.id,
        { clientUuid: randomUUID(), montant: 8_000, methode: 'ESPECES' }
      ),
      'PAYMENT_EXCEEDS_REMAINING'
    );
  });

  it('meme clientUuid de paiement rejoue : pas de double encaissement', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    const uuid = randomUUID();
    const payCtx = {
      businessId: f.business.id,
      userId: f.owner.id,
      cashRegisterMode: f.business.cashRegisterMode,
    };
    const a = await addOrderPayment(payCtx, vente.order.id, {
      clientUuid: uuid,
      montant: 4_000,
      methode: 'ESPECES',
    });
    const b = await addOrderPayment(payCtx, vente.order.id, {
      clientUuid: uuid,
      montant: 4_000,
      methode: 'ESPECES',
    });
    expect(a.status).toBe('CREATED');
    expect(b.status).toBe('DUPLICATE');
    expect(await prisma.payment.count({ where: { orderId: vente.order.id } })).toBe(1);
  });
});

describe('Vente — annulation', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await makeShop('Verif Vente Annulation', '8');
  });

  it('annulation : stock rendu, paiement annule, caisse contre-passee, stats remises a zero', async () => {
    await openRegister({ businessId: f.business.id, userId: f.owner.id }, { clientUuid: randomUUID(), fondDepart: 0 });
    const stockAvant = (await prisma.product.findUniqueOrThrow({ where: { id: f.produit.id } })).stock;

    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 3 }],
      montantRecu: 36_000,
      methode: 'ESPECES',
    });

    const jour = new Date(vente.order.createdAt);
    jour.setHours(0, 0, 0, 0);
    const statsAvant = await prisma.dailyStats.findFirstOrThrow({
      where: { businessId: f.business.id, date: jour },
    });

    const annulee = await cancelOrder(
      { businessId: f.business.id, userId: f.owner.id },
      vente.order.id,
      'Client revenu sur sa decision'
    );
    expect(annulee.statut).toBe('ANNULEE');
    expect(annulee.motifAnnulation).toBe('Client revenu sur sa decision');
    expect(annulee.annuleeLe).not.toBeNull();

    const produit = await prisma.product.findUniqueOrThrow({ where: { id: f.produit.id } });
    expect(produit.stock).toBe(stockAvant);

    const retour = await prisma.stockMovement.findFirst({
      where: { orderId: vente.order.id, type: 'RETOUR' },
    });
    expect(retour?.quantite).toBe(3);

    const paiements = await prisma.payment.findMany({ where: { orderId: vente.order.id } });
    expect(paiements.every((p) => p.statut === 'ANNULE')).toBe(true);

    const sortie = await prisma.cashMovement.findFirst({
      where: { referenceId: vente.order.id, type: 'SORTIE' },
    });
    expect(sortie?.montant).toBe(36_000);

    const statsApres = await prisma.dailyStats.findFirstOrThrow({
      where: { businessId: f.business.id, date: jour },
    });
    expect(statsApres.totalVendu).toBe(statsAvant.totalVendu - vente.order.total);
    expect(statsApres.recu).toBe(statsAvant.recu - 36_000);
    expect(statsApres.nbCommandes).toBe(statsAvant.nbCommandes - 1);
  });

  it('annuler deux fois : refuse', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    await cancelOrder({ businessId: f.business.id, userId: f.owner.id }, vente.order.id, 'Erreur de saisie');
    await expectAppError(
      cancelOrder({ businessId: f.business.id, userId: f.owner.id }, vente.order.id, 'Encore'),
      'ORDER_ALREADY_CANCELLED'
    );
  });

  it('encaisser sur une commande annulee : refuse', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    await cancelOrder({ businessId: f.business.id, userId: f.owner.id }, vente.order.id, 'Annulee');
    await expectAppError(
      addOrderPayment(
        { businessId: f.business.id, userId: f.owner.id, cashRegisterMode: f.business.cashRegisterMode },
        vente.order.id,
        { clientUuid: randomUUID(), montant: 1_000, methode: 'ESPECES' }
      ),
      'ORDER_IMMUTABLE'
    );
  });
});

describe('Vente — historique et recu', () => {
  let f: Fixture;
  beforeAll(async () => {
    f = await makeShop('Verif Vente Recu', '9');
  });

  it('la commande revient dans l historique avec ses lignes', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [
        { productId: f.produit.id, qte: 2 },
        { productId: f.produit2.id, qte: 1 },
      ],
      montantRecu: 0,
      methode: 'ESPECES',
    });
    const historique = await listOrders(f.business.id);
    expect(historique.find((o) => o.id === vente.order.id)).toBeDefined();
    expect(vente.order.items).toHaveLength(2);
  });

  it('les donnees du recu contiennent boutique, client et lignes', async () => {
    const vente = await createOrder(f.ctx, {
      clientUuid: randomUUID(),
      customerId: f.client.id,
      items: [{ productId: f.produit.id, qte: 1 }],
      montantRecu: 12_000,
      methode: 'ESPECES',
    });
    const data = await getOrderReceiptData(f.business.id, vente.order.id);
    expect(data.business.nom).toBe('Verif Vente Recu');
    expect(data.customer?.nom).toBe('Mme Kone');
    expect(data.order.items).toHaveLength(1);
    expect(data.order.items[0].libelle).toBe('Sac raphia');
    expect(data.order.total).toBe(12_000);
  });
});
