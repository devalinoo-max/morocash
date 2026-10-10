import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { cancelOrder } from '@/server/modules/orders/cancelOrder';
import { getCustomerBalance } from '@/server/modules/customers/debt';
import {
  cancelVersement,
  collectCustomerDebt,
  getActivity,
  getLastVersements,
  getVersementReceipt,
  listCustomerVersements,
  listOrderVersements,
} from '@/server/modules/payments/versements';
import { AppError } from '@/server/shared/errors';
import { ownerPrisma } from '../support/owner-prisma';

/**
 * Paiement partiel de bout en bout, contre la vraie base.
 *
 * Avant ce correctif, « Encaisser » depuis « Qui me doit » créait un paiement
 * sans commande : la commande restait impayée, l'argent n'entrait dans aucun
 * total de vente, et aucun reçu ne pouvait le montrer. Ces tests verrouillent
 * la règle unique : chaque paiement est un versement de SA commande.
 */

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`;
}

const JOUR_MS = 24 * 60 * 60 * 1000;

function jour(date: Date): { from: Date; to: Date } {
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { from, to };
}

interface Boutique {
  ctx: {
    businessId: string;
    userId: string;
    role: 'OWNER';
    remiseMaxVendeur: number;
    cashRegisterMode: 'LIBRE' | 'STRICT';
  };
  productId: string;
}

async function boutique(seed: string): Promise<Boutique> {
  const { business, owner } = await registerBusiness(
    { businessNom: `Test Versements ${seed}`, telephone: uniquePhone(seed), pin: '123456' },
    {}
  );
  const product = await createProduct(business.id, {
    nom: 'Sac de riz 25kg',
    type: 'PRODUIT',
    prixVente: 5_000,
    prixAchat: 3_500,
    stock: 500,
    seuilAlerte: 5,
    unite: 'sac',
  });
  return {
    ctx: {
      businessId: business.id,
      userId: owner.id,
      role: 'OWNER',
      remiseMaxVendeur: 0,
      cashRegisterMode: business.cashRegisterMode as 'LIBRE' | 'STRICT',
    },
    productId: product.id,
  };
}

function vendre(b: Boutique, customerId: string, qte: number, montantRecu: number) {
  return createOrder(b.ctx, {
    clientUuid: randomUUID(),
    customerId,
    items: [{ productId: b.productId, qte }],
    montantRecu,
    methode: 'ESPECES',
    fraisLivraison: 0,
  });
}

/** Recule une commande et son paiement d'origine de `jours` jours, comme si elle datait d'avant. */
async function antidater(orderId: string, jours: number): Promise<Date> {
  const quand = new Date(Date.now() - jours * JOUR_MS);
  await ownerPrisma.order.update({ where: { id: orderId }, data: { createdAt: quand } });
  await ownerPrisma.payment.updateMany({ where: { orderId }, data: { createdAt: quand } });
  return quand;
}

async function attendreRefus(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Refus ${code} attendu, mais l'appel a réussi.`);
}

describe('Paiement en 3 fois (scénario 1)', () => {
  let b: Boutique;
  let customerId: string;
  let orderId: string;

  beforeAll(async () => {
    b = await boutique('1');
    customerId = (await createCustomer(b.ctx.businessId, { nom: 'Awa Test' })).id;
    // 25 000 F, 10 000 F payés à la commande.
    orderId = (await vendre(b, customerId, 5, 10_000)).order.id;
  });

  it('à la commande : 1er versement, reste 15 000 F, total vendu du jour + 10 000 F', async () => {
    const { versements, order } = await listOrderVersements(b.ctx.businessId, orderId);
    expect(order.reste).toBe(15_000);
    expect(versements).toHaveLength(1);
    expect(versements[0]).toMatchObject({ numero: 1, aLaCommande: true, montant: 10_000, resteApres: 15_000 });

    expect((await getCustomerBalance(b.ctx.businessId, customerId)).solde).toBe(15_000);

    const today = jour(new Date());
    const activity = await getActivity(b.ctx.businessId, today.from, today.to);
    expect(activity.totalVendu).toBe(10_000);
    expect(activity.nbCommandes).toBe(1);
    // Le paiement fait à la commande n'est pas une ligne « versement ».
    expect(activity.nbVersements).toBe(0);
  });

  it('« Encaisser » 5 000 F en Wave : 2e versement rattaché à la commande, reçu figé', async () => {
    const res = await collectCustomerDebt(b.ctx, customerId, {
      clientUuid: randomUUID(),
      montant: 5_000,
      methode: 'WAVE',
    });
    expect(res.status).toBe('CREATED');
    expect(res.dette).toBe(10_000);
    expect(res.versements).toHaveLength(1);
    expect(res.versements[0]).toMatchObject({
      numero: 2,
      orderId,
      montant: 5_000,
      methode: 'WAVE',
      resteApres: 10_000,
      dejaPaye: 15_000,
      aLaCommande: false,
    });
    expect(res.versements[0].numeroRecu).toMatch(/^REC-\d{8}-\d{4}-V2$/);

    const fiche = await listCustomerVersements(b.ctx.businessId, customerId);
    expect(fiche.versements).toHaveLength(2);
    expect(fiche.dette).toBe(10_000);

    const order = await ownerPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.statutPaiement).toBe('PARTIELLE');
    // Le montant de la commande ne change jamais.
    expect(order.total).toBe(25_000);
  });

  it('« Encaisser » les 10 000 F restants : dette 0, commande soldée', async () => {
    const res = await collectCustomerDebt(b.ctx, customerId, {
      clientUuid: randomUUID(),
      montant: 10_000,
      methode: 'ESPECES',
    });
    expect(res.dette).toBe(0);
    expect(res.versements[0]).toMatchObject({ numero: 3, resteApres: 0 });

    expect((await getCustomerBalance(b.ctx.businessId, customerId)).solde).toBe(0);
    const order = await ownerPrisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(order.statutPaiement).toBe('PAYEE');
  });

  it('le reçu du 2e versement reste figé après le 3e', async () => {
    const { versements } = await listOrderVersements(b.ctx.businessId, orderId);
    const deuxieme = versements.find((v) => v.numero === 2)!;
    const recu = await getVersementReceipt(b.ctx.businessId, deuxieme.id);
    expect(recu.versement.resteApres).toBe(10_000);
    expect(recu.versement.dejaPaye).toBe(15_000);
    expect(recu.boutique.nom).toContain('Test Versements');
  });

  it('1 F de plus : refusé avec un message clair, sans code technique', async () => {
    const refus = await attendreRefus(
      collectCustomerDebt(b.ctx, customerId, { clientUuid: randomUUID(), montant: 1, methode: 'ESPECES' }),
      'PAYMENT_EXCEEDS_REMAINING'
    );
    expect(refus.message).toBe('Le montant dépasse ce que Awa Test te doit (0 F).');
  });
});

describe('Versement sur une ancienne commande (scénario 2)', () => {
  let b: Boutique;
  let customerId: string;
  let orderId: string;
  let ancienJour: Date;

  beforeAll(async () => {
    b = await boutique('2');
    customerId = (await createCustomer(b.ctx.businessId, { nom: 'Moussa Test' })).id;
    orderId = (await vendre(b, customerId, 5, 10_000)).order.id;
    ancienJour = await antidater(orderId, 30);
    await collectCustomerDebt(b.ctx, customerId, { clientUuid: randomUUID(), montant: 5_000, methode: 'ESPECES' });
  });

  it('aujourd’hui : + 5 000 F vendus, aucune commande de plus, un versement de plus', async () => {
    const today = jour(new Date());
    const activity = await getActivity(b.ctx.businessId, today.from, today.to);
    expect(activity.totalVendu).toBe(5_000);
    expect(activity.nbCommandes).toBe(0);
    expect(activity.nbVersements).toBe(1);
    expect(activity.versements[0]).toMatchObject({ numero: 2, orderId, montant: 5_000 });
  });

  it('les filtres Commandes / Versements séparent les deux sortes de lignes', async () => {
    const today = jour(new Date());
    const commandes = await getActivity(b.ctx.businessId, today.from, today.to, 'orders');
    const versements = await getActivity(b.ctx.businessId, today.from, today.to, 'payments');
    expect(commandes.versements).toHaveLength(0);
    expect(versements.versements).toHaveLength(1);
    // Le total ne dépend pas du filtre d'affichage.
    expect(commandes.totalVendu).toBe(versements.totalVendu);
  });

  it('le total vendu du jour de la commande ne bouge pas', async () => {
    const avant = jour(ancienJour);
    const activity = await getActivity(b.ctx.businessId, avant.from, avant.to);
    expect(activity.totalVendu).toBe(10_000);
    expect(activity.nbCommandes).toBe(1);
    expect(activity.resteSurCommandes).toBe(10_000);
  });

  it('sur toute la période : 15 000 F, sans double comptage', async () => {
    const activity = await getActivity(b.ctx.businessId, jour(ancienJour).from, jour(new Date()).to);
    expect(activity.totalVendu).toBe(15_000);
    expect(activity.nbCommandes).toBe(1);
  });

  it('« Qui me doit » connaît le dernier versement du client', async () => {
    const last = await getLastVersements(b.ctx.businessId);
    expect(last.get(customerId)?.montant).toBe(5_000);
  });
});

describe('Cas limites', () => {
  let b: Boutique;

  beforeAll(async () => {
    b = await boutique('3');
  });

  it('commande entièrement à crédit : dans la liste, 0 F dans le total vendu', async () => {
    const client = await createCustomer(b.ctx.businessId, { nom: 'Crédit Test' });
    const today = jour(new Date());
    const avant = await getActivity(b.ctx.businessId, today.from, today.to);
    const vente = await vendre(b, client.id, 2, 0);
    const apres = await getActivity(b.ctx.businessId, today.from, today.to);

    expect(apres.totalVendu).toBe(avant.totalVendu);
    expect(apres.nbCommandes).toBe(avant.nbCommandes + 1);
    expect(apres.commandes.find((c) => c.id === vente.order.id)).toMatchObject({
      payeALaCommande: 0,
      reste: 10_000,
    });
    expect((await getCustomerBalance(b.ctx.businessId, client.id)).solde).toBe(10_000);
  });

  it('deux commandes impayées : la plus ancienne d’abord, un versement numéroté par commande', async () => {
    const client = await createCustomer(b.ctx.businessId, { nom: 'Deux Commandes Test' });
    const ancienne = await vendre(b, client.id, 3, 0); // 15 000 F
    await antidater(ancienne.order.id, 5);
    const recente = await vendre(b, client.id, 2, 2_000); // 10 000 F, 2 000 versés

    const res = await collectCustomerDebt(b.ctx, client.id, {
      clientUuid: randomUUID(),
      montant: 20_000,
      methode: 'ORANGE_MONEY',
    });

    expect(res.versements).toHaveLength(2);
    expect(res.versements[0]).toMatchObject({ orderId: ancienne.order.id, montant: 15_000, numero: 1, resteApres: 0 });
    expect(res.versements[1]).toMatchObject({ orderId: recente.order.id, montant: 5_000, numero: 2, resteApres: 3_000 });
    expect(res.dette).toBe(3_000);

    // Le client n'a tendu qu'une somme : c'est elle que « Qui me doit » affiche.
    expect((await getLastVersements(b.ctx.businessId)).get(client.id)?.montant).toBe(20_000);
  });

  it('même clientUuid rejoué (double tap, renvoi hors ligne) : un seul encaissement', async () => {
    const client = await createCustomer(b.ctx.businessId, { nom: 'Doublon Test' });
    await vendre(b, client.id, 2, 0);
    const clientUuid = randomUUID();
    const input = { clientUuid, montant: 4_000, methode: 'ESPECES' as const };

    const [premier, second] = await Promise.all([
      collectCustomerDebt(b.ctx, client.id, input),
      collectCustomerDebt(b.ctx, client.id, input),
    ]);
    expect([premier.status, second.status].sort()).toEqual(['CREATED', 'DUPLICATE']);

    const rejoue = await collectCustomerDebt(b.ctx, client.id, input);
    expect(rejoue.status).toBe('DUPLICATE');
    expect((await getCustomerBalance(b.ctx.businessId, client.id)).solde).toBe(6_000);
    expect((await listCustomerVersements(b.ctx.businessId, client.id)).versements).toHaveLength(1);
  });

  it('annuler un versement : il reste visible, le reste et le total vendu sont recalculés', async () => {
    const client = await createCustomer(b.ctx.businessId, { nom: 'Annulation Test' });
    const vente = await vendre(b, client.id, 5, 10_000);
    const { versements } = await collectCustomerDebt(b.ctx, client.id, {
      clientUuid: randomUUID(),
      montant: 5_000,
      methode: 'ESPECES',
    });
    const today = jour(new Date());
    const avant = await getActivity(b.ctx.businessId, today.from, today.to);

    const annule = await cancelVersement(b.ctx, versements[0].id, 'Erreur de montant');
    expect(annule.statut).toBe('ANNULE');

    const apres = await getActivity(b.ctx.businessId, today.from, today.to);
    expect(apres.totalVendu).toBe(avant.totalVendu - 5_000);
    expect(apres.nbVersements).toBe(avant.nbVersements - 1);
    // Jamais supprimé : la ligne est toujours là, marquée annulée.
    expect(apres.versements.find((v) => v.id === versements[0].id)?.statut).toBe('ANNULE');

    const detail = await listOrderVersements(b.ctx.businessId, vente.order.id);
    expect(detail.order.reste).toBe(15_000);
    expect((await getCustomerBalance(b.ctx.businessId, client.id)).solde).toBe(15_000);

    // La caisse a reçu la sortie inverse.
    const sorties = await ownerPrisma.cashMovement.findMany({
      where: { businessId: b.ctx.businessId, type: 'SORTIE', montant: 5_000, origine: 'REMBOURSEMENT' },
    });
    expect(sorties.length).toBeGreaterThanOrEqual(1);

    await attendreRefus(cancelVersement(b.ctx, versements[0].id, 'Encore'), 'VALIDATION_ERROR');
  });

  it('annuler la commande : tous ses versements passent à annulé, la dette retombe à 0', async () => {
    const client = await createCustomer(b.ctx.businessId, { nom: 'Commande Annulée Test' });
    const vente = await vendre(b, client.id, 4, 5_000);
    await collectCustomerDebt(b.ctx, client.id, { clientUuid: randomUUID(), montant: 5_000, methode: 'ESPECES' });
    const today = jour(new Date());
    const avant = await getActivity(b.ctx.businessId, today.from, today.to);

    await cancelOrder(b.ctx, vente.order.id, 'Client reparti');

    const detail = await listOrderVersements(b.ctx.businessId, vente.order.id);
    expect(detail.versements.every((v) => v.statut === 'ANNULE')).toBe(true);
    expect(detail.order.reste).toBe(0);
    expect((await getCustomerBalance(b.ctx.businessId, client.id)).solde).toBe(0);

    const apres = await getActivity(b.ctx.businessId, today.from, today.to);
    expect(apres.totalVendu).toBe(avant.totalVendu - 10_000);
    expect(apres.nbCommandes).toBe(avant.nbCommandes - 1);
  });
});
