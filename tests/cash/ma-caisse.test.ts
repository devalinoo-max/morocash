import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'crypto';
import { registerBusiness } from '@/server/modules/auth/register';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder } from '@/server/modules/orders/createOrder';
import { cancelOrder } from '@/server/modules/orders/cancelOrder';
import { addOrderPayment } from '@/server/modules/orders/payments';
import { repayDebt } from '@/server/modules/customers/debt';
import {
  openRegister,
  closeRegister,
  createManualMovement,
  listMovements,
  getCurrentRegister,
  manualMovementSchema,
  openRegisterSchema,
  closeRegisterSchema,
} from '@/server/modules/cash/service';

/**
 * Ma caisse.
 *
 * C'est le seul ecran ou le commercant compare ce que l'app dit a ce qu'il a
 * reellement dans la main. Un ecart faux ne se discute pas : soit il cherche
 * un billet qui n'a jamais existe, soit il ne voit pas un billet qui manque.
 * Ces tests verifient donc l'argent, pas l'affichage.
 */

interface Boutique {
  ctx: {
    businessId: string;
    userId: string;
    role: 'OWNER';
    remiseMaxVendeur: number;
    cashRegisterMode: 'LIBRE' | 'STRICT';
  };
  productId: string;
  customerId: string;
}

let compteur = 0;
function telephoneUnique(): string {
  compteur += 1;
  return `225${Date.now().toString().slice(-7)}${String(compteur).padStart(2, '0')}`;
}

/** Une boutique neuve, avec un article a 1 000 F et un client. */
async function nouvelleBoutique(nom: string): Promise<Boutique> {
  const { business, owner } = await registerBusiness(
    { businessNom: `Verif ${nom}`, telephone: telephoneUnique(), pin: '123456' },
    {}
  );

  const ctx = {
    businessId: business.id,
    userId: owner.id,
    role: 'OWNER' as const,
    remiseMaxVendeur: 0,
    cashRegisterMode: business.cashRegisterMode as 'LIBRE' | 'STRICT',
  };

  const product = await createProduct(business.id, {
    nom: 'Bidon eau 5L',
    type: 'PRODUIT',
    prixVente: 1_000,
    prixAchat: 600,
    stock: 500,
    seuilAlerte: 5,
    unite: 'bidon',
  });
  const customer = await createCustomer(business.id, { nom: `Client ${nom}` });

  return { ctx, productId: product.id, customerId: customer.id };
}

function vente(
  b: Boutique,
  qte: number,
  montantRecu: number,
  methode: 'ESPECES' | 'ORANGE_MONEY' | 'WAVE' = 'ESPECES'
) {
  return createOrder(b.ctx, {
    clientUuid: randomUUID(),
    customerId: b.customerId,
    items: [{ productId: b.productId, qte }],
    montantRecu,
    methode,
  });
}

describe('Ma caisse — ce que les formulaires refusent avant d atteindre la base', () => {
  it('un mouvement manuel sans motif est refuse', () => {
    // Un APPORT sans motif est un trou dans la comptabilite : trois jours plus
    // tard, personne ne sait d'ou venait l'argent.
    const sansMotif = manualMovementSchema.safeParse({
      clientUuid: randomUUID(),
      type: 'APPORT',
      montant: 1_000,
      motif: '   ',
    });
    expect(sansMotif.success).toBe(false);
  });

  it('un mouvement manuel de zero ou negatif est refuse', () => {
    for (const montant of [0, -500]) {
      const parsed = manualMovementSchema.safeParse({
        clientUuid: randomUUID(),
        type: 'RETRAIT',
        montant,
        motif: 'Test',
      });
      expect(parsed.success).toBe(false);
    }
  });

  it('les especes sont le moyen par defaut d un mouvement manuel', () => {
    const parsed = manualMovementSchema.parse({
      clientUuid: randomUUID(),
      type: 'APPORT',
      montant: 1_000,
      motif: 'Apport du matin',
    });
    expect(parsed.methode).toBe('ESPECES');
  });

  it('un fond de depart negatif est refuse, zero est accepte', () => {
    expect(openRegisterSchema.safeParse({ clientUuid: randomUUID(), fondDepart: -1 }).success).toBe(
      false
    );
    expect(openRegisterSchema.safeParse({ clientUuid: randomUUID(), fondDepart: 0 }).success).toBe(
      true
    );
  });

  it('un montant compte negatif est refuse a la fermeture', () => {
    // On peut compter zero (caisse videe), jamais moins que rien.
    expect(closeRegisterSchema.safeParse({ montantCompte: -100 }).success).toBe(false);
    expect(closeRegisterSchema.safeParse({ montantCompte: 0 }).success).toBe(true);
  });
});

describe('Ma caisse — ouverture', () => {
  let b: Boutique;

  beforeAll(async () => {
    b = await nouvelleBoutique('CaisseOuv');
  });

  it('deux caisses ouvertes en meme temps sont impossibles', async () => {
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 10_000 });
    await expect(
      openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 5_000 })
    ).rejects.toMatchObject({ code: 'CASH_REGISTER_ALREADY_OPEN' });
  });

  it('la caisse courante est celle qui vient d etre ouverte', async () => {
    const courante = await getCurrentRegister(b.ctx.businessId);
    expect(courante?.fondDepart).toBe(10_000);
    expect(courante?.statut).toBe('OUVERTE');
  });

  it('une fois fermee, on peut en rouvrir une', async () => {
    await closeRegister(b.ctx, { montantCompte: 10_000 });
    const suivante = await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 2_000 });
    expect(suivante.statut).toBe('OUVERTE');
    expect(suivante.fondDepart).toBe(2_000);
  });
});

describe('Ma caisse — mouvements manuels', () => {
  let b: Boutique;

  beforeAll(async () => {
    b = await nouvelleBoutique('CaisseMvt');
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 0 });
  });

  it('un APPORT entre, un RETRAIT sort', async () => {
    const apport = await createManualMovement(b.ctx, {
      clientUuid: randomUUID(),
      type: 'APPORT',
      montant: 3_000,
      motif: 'Fond complementaire',
      methode: 'ESPECES',
    });
    const retrait = await createManualMovement(b.ctx, {
      clientUuid: randomUUID(),
      type: 'RETRAIT',
      montant: 800,
      motif: 'Achat de sachets',
      methode: 'ESPECES',
    });

    expect(apport.movement.type).toBe('ENTREE');
    expect(apport.movement.origine).toBe('APPORT');
    expect(retrait.movement.type).toBe('SORTIE');
    expect(retrait.movement.origine).toBe('RETRAIT');
  });

  it('le meme clientUuid rejoue ne double pas le mouvement', async () => {
    // Le telephone renvoie souvent deux fois la meme requete quand le reseau
    // hesite. Sans cette garde, un apport de 5 000 F en devient 10 000.
    const clientUuid = randomUUID();
    const premier = await createManualMovement(b.ctx, {
      clientUuid,
      type: 'APPORT',
      montant: 5_000,
      motif: 'Apport unique',
      methode: 'ESPECES',
    });
    const rejoue = await createManualMovement(b.ctx, {
      clientUuid,
      type: 'APPORT',
      montant: 5_000,
      motif: 'Apport unique',
      methode: 'ESPECES',
    });

    expect(premier.status).toBe('CREATED');
    expect(rejoue.status).toBe('DUPLICATE');
    expect(rejoue.movement.id).toBe(premier.movement.id);

    const mouvements = await listMovements(b.ctx.businessId);
    const apports = mouvements.filter((m) => m.motif === 'Apport unique');
    expect(apports).toHaveLength(1);
  });

  it('le motif est conserve tel quel pour etre relu plus tard', async () => {
    const mouvements = await listMovements(b.ctx.businessId);
    expect(mouvements.some((m) => m.motif === 'Achat de sachets')).toBe(true);
  });
});

describe('Ma caisse — ce qui entre et ce qui sort tout seul', () => {
  let b: Boutique;

  beforeAll(async () => {
    b = await nouvelleBoutique('CaisseFlux');
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 0 });
  });

  it('une vente reglee en especes entre en caisse pour le montant recu', async () => {
    await vente(b, 3, 3_000, 'ESPECES');
    const mouvements = await listMovements(b.ctx.businessId);
    const entrees = mouvements.filter((m) => m.type === 'ENTREE' && m.origine === 'COMMANDE');
    expect(entrees).toHaveLength(1);
    expect(entrees[0].montant).toBe(3_000);
    expect(entrees[0].methode).toBe('ESPECES');
  });

  it('une vente entierement a credit ne fait rien entrer', async () => {
    // Rien n'a ete recu : la caisse ne doit pas bouger d'un franc.
    const avant = (await listMovements(b.ctx.businessId)).length;
    await vente(b, 2, 0, 'ESPECES');
    const apres = await listMovements(b.ctx.businessId);
    expect(apres).toHaveLength(avant);
  });

  it('un acompte n entre que pour ce qui a ete verse', async () => {
    const commande = await vente(b, 5, 2_000, 'ESPECES'); // 5 000 F dus, 2 000 verses
    expect(commande.order.total).toBe(5_000);
    expect(commande.cashMovement?.montant).toBe(2_000);
    // La ligne de caisse sait de quelle vente elle vient : c'est ce que
    // l'ecran Caisse affiche au commercant.
    expect(commande.cashMovement?.referenceId).toBe(commande.order.id);
  });

  it('encaisser le reste plus tard fait une seconde entree, sur la meme commande', async () => {
    // C'est le geste ajoute au detail de commande : il doit atterrir en caisse,
    // et rester rattache a la vente d'origine.
    const commande = await vente(b, 4, 1_000, 'ESPECES'); // 4 000 dus, 1 000 verses
    await addOrderPayment(b.ctx, commande.order.id, {
      clientUuid: randomUUID(),
      montant: 3_000,
      methode: 'ESPECES',
    });

    const liees = (await listMovements(b.ctx.businessId)).filter(
      (m) => m.type === 'ENTREE' && m.referenceId === commande.order.id
    );
    expect(liees.map((m) => m.montant).sort((x, y) => x - y)).toEqual([1_000, 3_000]);
  });

  it('un remboursement de dette entre en caisse, au nom du client', async () => {
    const avant = (await listMovements(b.ctx.businessId)).filter((m) => m.type === 'ENTREE').length;
    await repayDebt(b.ctx, b.customerId, {
      clientUuid: randomUUID(),
      montant: 500,
      methode: 'ESPECES',
    });
    const apres = (await listMovements(b.ctx.businessId)).filter((m) => m.type === 'ENTREE');
    expect(apres).toHaveLength(avant + 1);

    // Un remboursement ne vient d'aucune commande : il vient d'un client, et
    // c'est son nom que l'ecran Caisse doit pouvoir afficher.
    const remboursement = apres.find((m) => m.origine === 'REMBOURSEMENT');
    expect(remboursement?.referenceId).toBe(b.customerId);
  });
});

describe('Ma caisse — annuler une commande retire l argent', () => {
  let b: Boutique;

  beforeAll(async () => {
    b = await nouvelleBoutique('CaisseAnnul');
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 0 });
  });

  it('l encaissement est contre-passe, pas efface', async () => {
    // Le detail de commande annonce au commercant que "les X F ont ete retires
    // de la caisse". Cette phrase doit etre vraie.
    const commande = await vente(b, 11, 11_000, 'ESPECES');
    await cancelOrder(b.ctx, commande.order.id, 'Erreur de saisie');

    const mouvements = await listMovements(b.ctx.businessId);
    const entree = mouvements.find(
      (m) => m.type === 'ENTREE' && m.paymentId === commande.payment!.id
    );
    const sortie = mouvements.find(
      (m) => m.type === 'SORTIE' && m.referenceId === commande.order.id
    );

    expect(entree?.montant).toBe(11_000);
    expect(sortie?.montant).toBe(11_000);
    // L'entree d'origine reste : on ne reecrit pas l'histoire, on la corrige.
    expect(mouvements.filter((m) => m.montant === 11_000)).toHaveLength(2);
  });

  it('les deux sens designent la meme commande', async () => {
    /*
     * L'entree et sa contre-passation se retrouvent desormais par la meme cle.
     *
     * Avant, une entree ne portait que paymentId et la sortie que referenceId :
     * impossible de les rapprocher, et l'ecran Caisse — qui lit referenceId —
     * n'affichait rien du tout sur un encaissement. Trois lignes « COMMANDE »
     * identiques, sans moyen de savoir laquelle etait quelle vente.
     */
    const commande = await vente(b, 1, 1_000, 'ESPECES');
    await cancelOrder(b.ctx, commande.order.id, 'Verification du rattachement');

    const liees = (await listMovements(b.ctx.businessId)).filter(
      (m) => m.referenceId === commande.order.id
    );

    expect(liees).toHaveLength(2);
    expect(liees.filter((m) => m.type === 'ENTREE')).toHaveLength(1);
    expect(liees.filter((m) => m.type === 'SORTIE')).toHaveLength(1);
    // Le paiement reste rattache a l'entree : on ajoute une cle, on n'en
    // remplace aucune.
    expect(liees.find((m) => m.type === 'ENTREE')?.paymentId).toBe(commande.payment!.id);
  });

  it('la caisse revient a son niveau d avant la vente', async () => {
    const resultat = await closeRegister(b.ctx, { montantCompte: 0 });
    expect(resultat.attenduEnEspeces).toBe(0);
    expect(resultat.ecart).toBe(0);
  });

  it('annuler une commande jamais payee ne sort rien de la caisse', async () => {
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 0 });
    const aCredit = await vente(b, 2, 0, 'ESPECES');
    await cancelOrder(b.ctx, aCredit.order.id, 'Le client a change d avis');

    const mouvements = await listMovements(b.ctx.businessId);
    expect(mouvements.filter((m) => m.referenceId === aCredit.order.id)).toHaveLength(0);
  });
});

describe('Ma caisse — fermeture et ecart', () => {
  let b: Boutique;

  beforeAll(async () => {
    b = await nouvelleBoutique('CaisseFerm');
  });

  it('le mobile money compte dans le total mais jamais dans les especes', async () => {
    // C'est l'erreur qui fait chercher un billet inexistant : le commerçant
    // compte ses especes, l'app lui oppose un attendu qui inclut du Wave.
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 5_000 });
    await vente(b, 3, 3_000, 'ESPECES');
    await vente(b, 2, 2_000, 'ORANGE_MONEY');

    const resultat = await closeRegister(b.ctx, { montantCompte: 8_000 });

    expect(resultat.attenduEnEspeces).toBe(8_000); // 5 000 + 3 000
    expect(resultat.attenduTotal).toBe(10_000); // + 2 000 de mobile money
    expect(resultat.ecart).toBe(0);
  });

  it('un excedent donne un ecart positif, un manquant un ecart negatif', async () => {
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 1_000 });
    const excedent = await closeRegister(b.ctx, { montantCompte: 1_300 });
    expect(excedent.ecart).toBe(300);

    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 1_000 });
    const manquant = await closeRegister(b.ctx, { montantCompte: 700 });
    expect(manquant.ecart).toBe(-300);
  });

  it('les mouvements d une session fermee ne polluent pas la suivante', async () => {
    // Sans le filtre par session, la caisse du mardi hériterait des ventes du
    // lundi et afficherait un manquant enorme chaque matin.
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 0 });
    await vente(b, 7, 7_000, 'ESPECES');
    await closeRegister(b.ctx, { montantCompte: 7_000 });

    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 0 });
    const lendemain = await closeRegister(b.ctx, { montantCompte: 0 });

    expect(lendemain.attenduEnEspeces).toBe(0);
    expect(lendemain.ecart).toBe(0);
  });

  it('le commentaire d ecart est conserve', async () => {
    await openRegister(b.ctx, { clientUuid: randomUUID(), fondDepart: 2_000 });
    const resultat = await closeRegister(b.ctx, {
      montantCompte: 1_500,
      commentaireEcart: 'Piece de 500 tombee sous le comptoir',
    });
    expect(resultat.register.commentaireEcart).toBe('Piece de 500 tombee sous le comptoir');
    expect(resultat.register.statut).toBe('FERMEE');
  });

  it('fermer sans caisse ouverte est refuse', async () => {
    await expect(closeRegister(b.ctx, { montantCompte: 0 })).rejects.toMatchObject({
      code: 'CASH_REGISTER_CLOSED',
    });
  });
});

describe('Ma caisse — mode LIBRE contre mode STRICT', () => {
  it('en mode LIBRE, encaisser sans caisse ouverte en ouvre une silencieusement', async () => {
    // Le commercant n'a pas a connaitre la ceremonie d'ouverture pour vendre.
    const b = await nouvelleBoutique('CaisseLibre');
    expect(b.ctx.cashRegisterMode).toBe('LIBRE');

    expect(await getCurrentRegister(b.ctx.businessId)).toBeNull();
    await vente(b, 1, 1_000, 'ESPECES');

    const ouverte = await getCurrentRegister(b.ctx.businessId);
    expect(ouverte?.statut).toBe('OUVERTE');
    expect(ouverte?.fondDepart).toBe(0);
  });

  it('en mode STRICT, encaisser sans caisse ouverte est refuse', async () => {
    const b = await nouvelleBoutique('CaisseStricte');
    const strict = { ...b.ctx, cashRegisterMode: 'STRICT' as const };

    await expect(
      createOrder(strict, {
        clientUuid: randomUUID(),
        customerId: b.customerId,
        items: [{ productId: b.productId, qte: 1 }],
        montantRecu: 1_000,
        methode: 'ESPECES',
      })
    ).rejects.toMatchObject({ code: 'CASH_REGISTER_CLOSED' });
  });

  it('en mode STRICT, une vente entierement a credit passe quand meme', async () => {
    // Rien n'est encaisse, donc aucune caisse n'est requise : refuser ici
    // empecherait de noter une dette le matin avant d'ouvrir.
    const b = await nouvelleBoutique('CaisseStricteCredit');
    const strict = { ...b.ctx, cashRegisterMode: 'STRICT' as const };

    const commande = await createOrder(strict, {
      clientUuid: randomUUID(),
      customerId: b.customerId,
      items: [{ productId: b.productId, qte: 2 }],
      montantRecu: 0,
      methode: 'ESPECES',
    });

    expect(commande.order.statutPaiement).toBe('CREDIT');
    expect(await getCurrentRegister(b.ctx.businessId)).toBeNull();
  });
});
