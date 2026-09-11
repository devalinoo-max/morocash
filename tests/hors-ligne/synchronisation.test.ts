import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { pushSyncOperations, type SyncOperation } from '@/server/modules/sync/push';
import { ownerPrisma as prisma } from '../support/owner-prisma';

/**
 * Ce qui remonte quand le reseau revient.
 *
 * L'idempotence brute (20 commandes, 5 doublons) est deja couverte par
 * tests/sync/push-idempotency. Ici : une journee de travail hors ligne
 * complete, melangee, avec une operation fautive au milieu.
 */

function uniquePhone(seed: string): string {
  return `225${Date.now().toString().slice(-9)}${seed}`.slice(0, 15);
}

async function makeShop(nom: string, seed: string, remiseMaxVendeur = 0) {
  const { business, owner } = await registerBusiness(
    { businessNom: nom, telephone: uniquePhone(seed), pin: '123456' },
    {}
  );
  if (remiseMaxVendeur > 0) {
    await prisma.business.update({ where: { id: business.id }, data: { remiseMaxVendeur } });
  }
  return { business, owner, remiseMaxVendeur };
}

function op(operationType: SyncOperation['operationType'], payload: Record<string, unknown>): SyncOperation {
  return {
    clientUuid: randomUUID(),
    deviceId: 'telephone-du-patron',
    operationType,
    payload,
    createdAt: new Date(),
  };
}

describe('Hors ligne — une journee entiere remontee d un coup', () => {
  let shop: Awaited<ReturnType<typeof makeShop>>;
  let produit: Awaited<ReturnType<typeof createProduct>>;
  let client: Awaited<ReturnType<typeof createCustomer>>;

  beforeAll(async () => {
    shop = await makeShop('Verif Hors Ligne Journee', '1');
    produit = await createProduct(shop.business.id, {
      nom: 'Tabouret bois',
      type: 'PRODUIT',
      prixVente: 15_000,
      prixAchat: 0,
      stock: 0,
      seuilAlerte: 2,
      unite: 'piece',
    });
    client = await createCustomer(shop.business.id, { nom: 'Mme Kone' });
  });

  it('reception, ventes, casse, inventaire et depense remontent ensemble et dans l ordre', async () => {
    const ctx = {
      businessId: shop.business.id,
      userId: shop.owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
      cashRegisterMode: shop.business.cashRegisterMode,
    };

    const categorieDepense = await prisma.category.findFirstOrThrow({
      where: { businessId: shop.business.id, type: 'DEPENSE' },
    });

    const journee: SyncOperation[] = [
      op('STOCK_RECEPTION', {
        fournisseur: 'Grossiste Adjame',
        lignes: [{ productId: produit.id, quantite: 20, prixAchatUnitaire: 9_000 }],
      }),
      op('CREATE_SALE', {
        customerId: client.id,
        items: [{ productId: produit.id, qte: 3 }],
        montantRecu: 45_000,
        methode: 'ESPECES',
      }),
      op('CREATE_SALE', {
        customerId: client.id,
        items: [{ productId: produit.id, qte: 2 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      op('STOCK_MOVEMENT', {
        productId: produit.id,
        type: 'CASSE',
        quantite: 1,
        motif: 'Tombe du camion',
      }),
      op('CREATE_EXPENSE', {
        montant: 5_000,
        categoryId: categorieDepense.id,
        note: 'Transport',
        methode: 'ESPECES',
      }),
      op('STOCK_COUNT', {
        perimetre: 'TOUT',
        lignes: [{ productId: produit.id, stockCompte: 13 }],
      }),
    ];

    const resultats = await pushSyncOperations(ctx, journee);

    expect(resultats).toHaveLength(6);
    expect(resultats.filter((r) => r.status === 'SYNCED')).toHaveLength(6);
    expect(resultats.filter((r) => r.status === 'ERROR')).toHaveLength(0);

    // 20 recus, 5 vendus, 1 casse = 14 attendus ; l inventaire en a compte 13.
    const apres = await prisma.product.findUniqueOrThrow({ where: { id: produit.id } });
    expect(apres.stock).toBe(13);
    expect(apres.cmp).toBe(9_000);

    expect(await prisma.order.count({ where: { businessId: shop.business.id } })).toBe(2);
    expect(await prisma.expense.count({ where: { businessId: shop.business.id } })).toBe(1);
  });

  it('une operation fautive n empeche pas les autres de passer', async () => {
    const ctx = {
      businessId: shop.business.id,
      userId: shop.owner.id,
      role: 'OWNER' as const,
      remiseMaxVendeur: 0,
      cashRegisterMode: shop.business.cashRegisterMode,
    };

    const avant = await prisma.order.count({ where: { businessId: shop.business.id } });

    const resultats = await pushSyncOperations(ctx, [
      op('CREATE_SALE', {
        customerId: client.id,
        items: [{ productId: produit.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      // Client inexistant : cette seule operation doit echouer.
      op('CREATE_SALE', {
        customerId: 'cmt00000000000000000000000',
        items: [{ productId: produit.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }),
      op('CREATE_SALE', {
        customerId: client.id,
        items: [{ productId: produit.id, qte: 1 }],
        montantRecu: 0,
        methode: 'ESPECES',
      }),
    ]);

    expect(resultats.map((r) => r.status)).toEqual(['SYNCED', 'ERROR', 'SYNCED']);
    expect(resultats[1].error?.code).toBeTruthy();
    expect(await prisma.order.count({ where: { businessId: shop.business.id } })).toBe(avant + 2);
  });
});

describe('Hors ligne — remise faite par un vendeur', () => {
  it('une remise dans le plafond de la boutique passe a la synchronisation', async () => {
    const shop = await makeShop('Verif Hors Ligne Remise', '2', 10);
    const produit = await createProduct(shop.business.id, {
      nom: 'Lampe',
      type: 'PRODUIT',
      prixVente: 20_000,
      prixAchat: 0,
      stock: 10,
      seuilAlerte: 1,
      unite: 'piece',
    });
    const client = await createCustomer(shop.business.id, { nom: 'Client Remise' });

    const ctx = {
      businessId: shop.business.id,
      userId: shop.owner.id,
      role: 'SELLER' as const,
      remiseMaxVendeur: 10,
      cashRegisterMode: shop.business.cashRegisterMode,
    };

    // Le plafond etait force a 0 dans la synchronisation : une vente remisee
    // par un vendeur, acceptee a l ecran hors ligne, etait refusee pour
    // toujours au retour du reseau.
    const [dansLePlafond] = await pushSyncOperations(ctx, [
      op('CREATE_SALE', {
        customerId: client.id,
        items: [{ productId: produit.id, qte: 1 }],
        remiseMode: 'POURCENTAGE',
        remiseValeur: 10,
        montantRecu: 0,
        methode: 'ESPECES',
      }),
    ]);
    expect(dansLePlafond.status).toBe('SYNCED');

    const commande = await prisma.order.findFirstOrThrow({
      where: { businessId: shop.business.id },
    });
    expect(commande.remiseMontant).toBe(2_000);
    expect(commande.total).toBe(18_000);

    // Au-dela du plafond, le refus reste ferme.
    const [horsPlafond] = await pushSyncOperations(ctx, [
      op('CREATE_SALE', {
        customerId: client.id,
        items: [{ productId: produit.id, qte: 1 }],
        remiseMode: 'POURCENTAGE',
        remiseValeur: 40,
        montantRecu: 0,
        methode: 'ESPECES',
      }),
    ]);
    expect(horsPlafond.status).toBe('ERROR');
    expect(horsPlafond.error?.code).toBe('DISCOUNT_ABOVE_LIMIT');
  });
});
