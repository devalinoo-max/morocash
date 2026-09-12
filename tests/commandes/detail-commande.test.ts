import { describe, it, expect } from 'vitest';
import type { ReceiptDelivery, Sale } from '../../frontend/src/types';
import { buildHistory, debtSentence, statusSubtitle } from '../../frontend/src/utils/orderDetail';
import { buildReceiptMessage, buildReminderMessage } from '../../frontend/src/utils/saleMessages';
import { toFrontendSale, type ApiOrder } from '../../frontend/src/api/orders';

/**
 * Le detail d'une commande.
 *
 * Trois choses s'y jouent et aucune n'est cosmetique : ce que le statut veut
 * dire, ce que le client doit AU TOTAL (et non sur cette seule commande), et
 * ce qu'une annulation a corrige. Se tromper sur la deuxieme, c'est reclamer
 * le mauvais montant a quelqu'un qui est devant soi.
 */

/**
 * Les montants sont groupes par une espace INSECABLE, pour qu'un « 12 500 F »
 * ne se coupe jamais en fin de ligne. On normalise donc avant de comparer,
 * plutot que de glisser un caractere invisible dans les attentes.
 */
function sansInsecable(texte: string | null | undefined): string {
  return (texte ?? '').replace(new RegExp(String.fromCharCode(160), 'g'), ' ');
}

function commande(over: Partial<Sale> = {}): Sale {
  return {
    id: 'cmd1',
    clientUuid: 'uuid-1',
    reference: 'CMD-20260911-0004',
    items: [{ productId: 'p1', name: 'Riz', unitPrice: 4_800, quantity: 2, total: 9_600 }],
    subtotal: 12_500,
    discount: 0,
    totalAmount: 12_500,
    paidAmount: 12_500,
    remainingAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    customerName: 'Yao Kouassi',
    createdAt: '2026-09-11T14:32:00.000Z',
    sellerName: 'Mamadou',
    syncStatus: 'SYNCED',
    ...over,
  };
}

const partielle = () =>
  commande({ paymentStatus: 'PARTIAL', paidAmount: 5_000, remainingAmount: 7_500 });

describe('Sous-titre du statut', () => {
  it('dit ce que « payee » veut dire', () => {
    expect(statusSubtitle(commande())).toBe('Réglée en totalité');
  });

  it('chiffre ce qui est entre et ce qui reste a rentrer', () => {
    const texte = statusSubtitle(partielle());
    expect(texte).toContain('reçus');
    expect(texte).toContain('à recevoir');
  });

  it('distingue « rien paye » de « partiellement paye »', () => {
    const credit = commande({ paymentStatus: 'CREDIT', paidAmount: 0, remainingAmount: 12_500 });
    expect(statusSubtitle(credit)).toBe('Rien n’a encore été payé');
  });

  it('une commande annulee ne compte nulle part', () => {
    expect(statusSubtitle(commande({ isCancelled: true }))).toBe(
      'N’est comptée dans aucun chiffre'
    );
  });
});

describe('La phrase de dette', () => {
  it('additionne les anciennes commandes et celle-ci', () => {
    // 1 500 F d'avant + 7 500 F d'ici = 9 000 F au total.
    const phrase = debtSentence(partielle(), 9_000);
    expect(phrase).toContain('Yao');
    expect(sansInsecable(phrase)).toContain('9 000');
    expect(sansInsecable(phrase)).toContain('1 500');
    expect(sansInsecable(phrase)).toContain('7 500');
  });

  it('ne parle pas d anciennes commandes quand il n y en a pas', () => {
    const phrase = debtSentence(partielle(), 7_500);
    expect(sansInsecable(phrase)).toContain('7 500');
    expect(phrase).not.toContain('anciennes commandes');
  });

  it('annonce un compte a jour sans supposer le genre du client', () => {
    const phrase = debtSentence(commande(), 0);
    expect(phrase).toBe('Yao n’a aucune dette : son compte est à jour.');
    expect(phrase).not.toMatch(/\b(Elle|Il) est\b/);
  });

  it('se tait pour une commande annulee', () => {
    expect(debtSentence(commande({ isCancelled: true }), 5_000)).toBeNull();
  });

  it('retombe sur le reste de la commande quand le client n est pas au carnet', () => {
    const phrase = debtSentence(partielle(), undefined);
    expect(sansInsecable(phrase)).toContain('7 500');
    expect(phrase).not.toContain('anciennes commandes');
  });

  it('ne sort jamais une dette negative si la base est en retard d un paiement', () => {
    // La dette totale peut arriver plus basse que le reste de la commande
    // (encaissement deja pris en compte ailleurs). On ne doit pas afficher
    // « -2 000 F d'anciennes commandes ».
    const phrase = debtSentence(partielle(), 3_000)!;
    expect(phrase).not.toContain('-');
    expect(phrase).not.toContain('anciennes commandes');
  });
});

describe('Historique de la commande', () => {
  const aucunEnvoi: ReceiptDelivery[] = [];

  it('commence toujours par l enregistrement, avec le vendeur', () => {
    const lignes = buildHistory(commande(), aucunEnvoi);
    const creation = lignes.find((l) => l.titre === 'Commande enregistrée');
    expect(creation?.detail).toBe('par Mamadou');
  });

  it('liste chaque encaissement avec son moyen', () => {
    const s = partielle();
    s.payments = [
      {
        id: 'pay1',
        amount: 5_000,
        method: 'WAVE',
        createdAt: '2026-09-11T15:00:00.000Z',
        isCancelled: false,
      },
    ];
    const lignes = buildHistory(s, aucunEnvoi);
    const paiement = lignes.find((l) => l.titre.startsWith('Paiement reçu'));
    expect(sansInsecable(paiement?.titre)).toContain('5 000');
    expect(paiement?.detail).toBe('Wave');
  });

  it('va du plus recent au plus ancien', () => {
    const s = commande();
    s.payments = [
      {
        id: 'pay1',
        amount: 12_500,
        method: 'CASH',
        createdAt: '2026-09-11T16:00:00.000Z',
        isCancelled: false,
      },
    ];
    const lignes = buildHistory(s, aucunEnvoi);
    expect(lignes[0].at >= lignes[lignes.length - 1].at).toBe(true);
    expect(lignes[0].titre).toContain('Paiement reçu');
  });

  it('rattache un envoi de recu par identifiant ou par numero', () => {
    const parId: ReceiptDelivery = {
      id: 'd1',
      businessId: 'b1',
      orderId: 'cmd1',
      canal: 'WHATSAPP',
      userId: 'u1',
      userName: 'Mamadou',
      createdAt: '2026-09-11T14:33:00.000Z',
    };
    const parNumero: ReceiptDelivery = {
      ...parId,
      id: 'd2',
      orderId: 'autre-id',
      orderReference: 'CMD-20260911-0004',
      canal: 'IMPRESSION',
    };
    const lignes = buildHistory(commande(), [parId, parNumero]);
    expect(lignes.some((l) => l.titre === 'Reçu envoyé sur WhatsApp')).toBe(true);
    expect(lignes.some((l) => l.titre === 'Reçu imprimé')).toBe(true);
  });

  it('ignore l envoi d une autre commande', () => {
    const autre: ReceiptDelivery = {
      id: 'd3',
      businessId: 'b1',
      orderId: 'cmd-999',
      orderReference: 'CMD-20260910-0001',
      canal: 'WHATSAPP',
      userId: 'u1',
      createdAt: '2026-09-10T09:00:00.000Z',
    };
    const lignes = buildHistory(commande(), [autre]);
    expect(lignes.some((l) => l.titre.startsWith('Reçu'))).toBe(false);
  });

  it('detaille ce que l annulation a corrige', () => {
    const annulee = commande({
      isCancelled: true,
      cancelledAt: '2026-09-11T15:52:00.000Z',
      cancelReason: 'Erreur de saisie',
      paidAmount: 11_000,
      items: [
        { productId: 'p1', name: 'Riz', unitPrice: 4_800, quantity: 2, total: 9_600 },
        { productId: 'p2', name: 'Huile', unitPrice: 1_400, quantity: 1, total: 1_400 },
      ],
    });
    const lignes = buildHistory(annulee, aucunEnvoi);
    const titres = lignes.map((l) => l.titre);

    expect(titres).toContain('Commande annulée');
    expect(titres).toContain('Stock remis');
    expect(titres).toContain('Paiement annulé');

    const stock = lignes.find((l) => l.titre === 'Stock remis');
    expect(stock?.detail).toBe('3 articles sont revenus en stock');

    const caisse = lignes.find((l) => l.titre === 'Paiement annulé');
    expect(sansInsecable(caisse?.detail)).toContain('11 000');

    const motif = lignes.find((l) => l.titre === 'Commande annulée');
    expect(motif?.detail).toBe('Erreur de saisie');
  });

  it('ne parle pas de caisse quand rien n avait ete encaisse', () => {
    const annulee = commande({
      isCancelled: true,
      cancelledAt: '2026-09-11T15:52:00.000Z',
      paymentStatus: 'CREDIT',
      paidAmount: 0,
      remainingAmount: 12_500,
    });
    const titres = buildHistory(annulee, aucunEnvoi).map((l) => l.titre);
    expect(titres).toContain('Stock remis');
    expect(titres).not.toContain('Paiement annulé');
  });
});

describe('Messages envoyes au client', () => {
  it('le recu porte le numero, les lignes et le total', () => {
    const texte = buildReceiptMessage(commande(), 'Chez Awa');
    expect(texte).toContain('CMD-20260911-0004');
    expect(texte).toContain('Chez Awa');
    expect(texte).toContain('Riz');
    expect(sansInsecable(texte)).toContain('12 500');
  });

  it('le recu annonce le reste seulement s il y en a un', () => {
    expect(buildReceiptMessage(commande(), 'Chez Awa')).not.toContain('Reste à régler');
    expect(buildReceiptMessage(partielle(), 'Chez Awa')).toContain('Reste à régler');
  });

  it('la relance ne parle que de ce qui reste du', () => {
    const texte = buildReminderMessage(partielle(), 'Chez Awa');
    expect(sansInsecable(texte)).toContain('7 500');
    expect(texte).not.toContain('Riz');
  });

  it('sans nom de boutique enregistre, le message reste lisible', () => {
    expect(buildReceiptMessage(commande(), '')).toContain('notre boutique');
  });
});

describe('Les encaissements remontent de l API jusqu a l ecran', () => {
  it('chaque paiement est conserve, un par un', () => {
    // Le modele ne portait qu'un seul paymentMethod : le detail ne pouvait
    // donc pas lister un acompte puis le solde, alors que l'API les renvoie.
    const order: ApiOrder = {
      id: 'o1',
      clientUuid: 'uuid-1',
      numero: 'CMD-20260911-0004',
      customerId: 'cl1',
      sousTotal: 12_500,
      remiseMontant: 0,
      total: 12_500,
      statutPaiement: 'PARTIELLE',
      statut: 'VALIDEE',
      createdAt: '2026-09-11T14:32:00.000Z',
      items: [
        {
          id: 'i1',
          productId: 'p1',
          libelle: 'Riz',
          qte: 2,
          prixUnitaire: 4_800,
          totalLigne: 9_600,
        },
      ],
      payments: [
        {
          id: 'pay1',
          orderId: 'o1',
          customerId: 'cl1',
          montant: 3_000,
          methode: 'ESPECES',
          type: 'VENTE',
          statut: 'VALIDE',
          createdAt: '2026-09-11T14:32:00.000Z',
        },
        {
          id: 'pay2',
          orderId: 'o1',
          customerId: 'cl1',
          montant: 2_000,
          methode: 'WAVE',
          type: 'VENTE',
          statut: 'VALIDE',
          createdAt: '2026-09-12T09:10:00.000Z',
        },
      ],
    };

    const vente = toFrontendSale(order, { customerName: 'Yao Kouassi' });

    expect(vente.payments).toHaveLength(2);
    expect(vente.payments![0].method).toBe('CASH');
    expect(vente.payments![1].method).toBe('WAVE');
    expect(vente.paidAmount).toBe(5_000);
    expect(vente.remainingAmount).toBe(7_500);
  });

  it('un paiement annule reste dans l historique mais ne compte plus', () => {
    const order: ApiOrder = {
      id: 'o2',
      clientUuid: 'uuid-2',
      numero: 'CMD-20260911-0005',
      customerId: 'cl1',
      sousTotal: 5_000,
      remiseMontant: 0,
      total: 5_000,
      statutPaiement: 'CREDIT',
      statut: 'VALIDEE',
      createdAt: '2026-09-11T14:32:00.000Z',
      items: [],
      payments: [
        {
          id: 'pay3',
          orderId: 'o2',
          customerId: 'cl1',
          montant: 5_000,
          methode: 'ESPECES',
          type: 'VENTE',
          statut: 'ANNULE',
          createdAt: '2026-09-11T14:32:00.000Z',
        },
      ],
    };

    const vente = toFrontendSale(order, {});
    expect(vente.payments).toHaveLength(1);
    expect(vente.payments![0].isCancelled).toBe(true);
    expect(vente.paidAmount).toBe(0);
    expect(vente.remainingAmount).toBe(5_000);

    // ... et l'historique l'annonce comme annule, pas comme recu.
    const lignes = buildHistory(vente, []);
    expect(lignes.some((l) => l.titre.startsWith('Paiement annulé'))).toBe(true);
    expect(lignes.some((l) => l.titre.startsWith('Paiement reçu'))).toBe(false);
  });
});
