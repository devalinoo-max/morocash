/**
 * Boutique de démonstration pour essayer le renouvellement d'abonnement et le
 * suivi par commercial, sans passer par pawaPay : les paiements sont simulés
 * avec la même fonction que le vrai retour de paiement (activatePaidSubscription).
 *
 * Lancer : npx tsx scripts/demo-renouvellement.ts
 * Chaque critère vérifié est affiché OK / ÉCHEC. La boutique reste en base pour
 * être essayée dans l'app (identifiants affichés à la fin).
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { addDays, addMonths } from 'date-fns';
import { registerBusiness } from '@/server/modules/auth/register';
import {
  activatePaidSubscription,
  createPendingSubscriptionPayment,
  findActivePlanByCode,
  findPaymentByReference,
} from '@/server/repositories/subscriptions';
import { getRenewalQuote, getSubscriptionOverview } from '@/server/modules/subscriptions/service';
import { createProduct } from '@/server/modules/products/service';
import { createCustomer } from '@/server/modules/customers/service';
import { createOrder, type CreateOrderContext } from '@/server/modules/orders/createOrder';
import { cancelOrder } from '@/server/modules/orders/cancelOrder';
import { collectOrderPayment } from '@/server/modules/payments/versements';
import { createEmployee } from '@/server/modules/users/service';
import { createCommercial, getCommerciauxReport, updateCommercial } from '@/server/modules/commerciaux/service';
import { getRangeReport } from '@/server/modules/reports/queries';
import { ownerPrisma } from '../tests/support/owner-prisma';

const DAY = 24 * 60 * 60 * 1000;
let echecs = 0;
function check(label: string, ok: boolean, detail = '') {
  if (!ok) echecs++;
  console.log(`${ok ? '  OK    ' : '  ÉCHEC '} ${label}${detail ? ` — ${detail}` : ''}`);
}
const jour = (d: Date | null | undefined) => (d ? d.toLocaleDateString('fr-FR') : '—');
const memeJour = (a: Date | null | undefined, b: Date) => !!a && Math.abs(a.getTime() - b.getTime()) < 60_000;

/** Paiement simulé : comme un retour pawaPay « COMPLETED ». */
async function payer(businessId: string, planCode: 'SOLO' | 'BUSINESS', periode: 'MENSUEL' | 'TRIMESTRIEL' | 'ANNUEL') {
  const plan = (await findActivePlanByCode(planCode))!;
  const depositId = `demo-${randomUUID()}`;
  const montant = periode === 'MENSUEL' ? plan.prixMensuel : periode === 'TRIMESTRIEL' ? plan.prixTrimestriel : plan.prixAnnuel;
  await createPendingSubscriptionPayment({ businessId, planId: plan.id, periode, montant, depositId, clientUuid: randomUUID() });
  const payment = (await findPaymentByReference(depositId))!;
  const ok = await activatePaidSubscription({ payment, methode: 'WAVE', referencePasserelle: 'DEMO', payload: { demo: true } });
  return { depositId, payment, ok, montant };
}

async function fixerFin(businessId: string, fin: Date) {
  await ownerPrisma.business.update({ where: { id: businessId }, data: { subscriptionEndsAt: fin, statut: 'ACTIF' } });
}

async function main() {
  const telephone = `0711${Date.now().toString().slice(-6)}`;
  const { business } = await registerBusiness(
    { businessNom: 'Démo Renouvellement', telephone, pin: '123456', pays: 'CI' },
    {}
  );
  const owner = await ownerPrisma.user.findFirstOrThrow({ where: { businessId: business.id, role: 'OWNER' } });
  const bid = business.id;
  console.log(`\nBoutique créée : ${business.nom} (${telephone})\n`);

  console.log('CHANTIER 1 — Renouvellement');

  // Essai : le paiement met fin à l'essai, la date part du jour du paiement.
  const t0 = new Date();
  await payer(bid, 'SOLO', 'MENSUEL');
  let b = await ownerPrisma.business.findUniqueOrThrow({ where: { id: bid } });
  check('Essai : 1 mois payé part du jour du paiement', memeJour(b.subscriptionEndsAt, addMonths(t0, 1)), jour(b.subscriptionEndsAt));

  // Critère 1 : actif, fin dans 15 jours, paie 1 mois → fin + 1 mois.
  const fin15 = addDays(new Date(), 15);
  await fixerFin(bid, fin15);
  const r1 = await payer(bid, 'SOLO', 'MENSUEL');
  b = await ownerPrisma.business.findUniqueOrThrow({ where: { id: bid } });
  check('Critère 1 : actif → fin actuelle + 1 mois', memeJour(b.subscriptionEndsAt, addMonths(fin15, 1)), `${jour(fin15)} → ${jour(b.subscriptionEndsAt)}`);
  const p1 = await ownerPrisma.subscriptionPayment.findUniqueOrThrow({ where: { referenceInterne: r1.depositId } });
  check('Le paiement garde la fin avant / après', memeJour(p1.dateFinAvant, fin15) && memeJour(p1.dateFinApres, addMonths(fin15, 1)));

  // Critère 2 : expiré → maintenant + 1 mois.
  await fixerFin(bid, addDays(new Date(), -20));
  const t2 = new Date();
  await payer(bid, 'SOLO', 'MENSUEL');
  b = await ownerPrisma.business.findUniqueOrThrow({ where: { id: bid } });
  check('Critère 2 : expiré → date du paiement + 1 mois', memeJour(b.subscriptionEndsAt, addMonths(t2, 1)), jour(b.subscriptionEndsAt));

  // Critère 4 : le même paiement confirmé deux fois ne prolonge qu'une fois.
  const avant = b.subscriptionEndsAt;
  const plan = (await findActivePlanByCode('SOLO'))!;
  const dep = `demo-${randomUUID()}`;
  const uuid = randomUUID();
  await createPendingSubscriptionPayment({ businessId: bid, planId: plan.id, periode: 'MENSUEL', montant: plan.prixMensuel, depositId: dep, clientUuid: uuid });
  let doublon = false;
  try {
    await createPendingSubscriptionPayment({ businessId: bid, planId: plan.id, periode: 'MENSUEL', montant: plan.prixMensuel, depositId: `demo-${randomUUID()}`, clientUuid: uuid });
  } catch {
    doublon = true;
  }
  check('Critère 4 : même clientUuid → un seul paiement créé', doublon);
  const pay = (await findPaymentByReference(dep))!;
  const [a1, a2] = await Promise.all([
    activatePaidSubscription({ payment: pay, methode: 'WAVE', referencePasserelle: 'DEMO', payload: {} }),
    activatePaidSubscription({ payment: pay, methode: 'WAVE', referencePasserelle: 'DEMO', payload: {} }),
  ]);
  b = await ownerPrisma.business.findUniqueOrThrow({ where: { id: bid } });
  check('Critère 4 : deux confirmations → une seule prolongation', [a1, a2].filter(Boolean).length === 1 && memeJour(b.subscriptionEndsAt, addMonths(avant!, 1)));

  // Devis et plafond de 12 mois.
  await fixerFin(bid, addDays(new Date(), 15));
  b = await ownerPrisma.business.findUniqueOrThrow({ where: { id: bid } });
  const quote = await getRenewalQuote(b, 'SOLO');
  const q3 = quote.options.find((o) => o.periode === 'TRIMESTRIEL')!;
  const q12 = quote.options.find((o) => o.periode === 'ANNUEL')!;
  check('Devis 3 mois : fin actuelle + 3 mois', memeJour(q3.dateFinApres, addMonths(b.subscriptionEndsAt!, 3)), jour(q3.dateFinApres));
  check('12 mois possibles avec 15 jours restants (fin actuelle + 12 mois)', !q12.bloque && memeJour(q12.dateFinApres, addMonths(b.subscriptionEndsAt!, 12)), jour(q12.dateFinApres));

  // Critère 6 : historique avec le bon montant.
  const overview = await getSubscriptionOverview(bid);
  check('Critère 6 : historique au bon montant', overview.payments[0]?.montant === plan.prixMensuel, `${overview.payments.length} paiements, dernier ${overview.payments[0]?.montant} F`);

  console.log('\nCHANTIER 2 — Commerciaux');
  await ownerPrisma.business.update({ where: { id: bid }, data: { suiviCommercialActif: true } });
  const ctxOwner: CreateOrderContext = { businessId: bid, userId: owner.id, role: 'OWNER', remiseMaxVendeur: 0, cashRegisterMode: 'LIBRE', suiviCommercialActif: true };

  const koffi = await createCommercial({ businessId: bid, userId: owner.id }, { id: randomUUID(), nom: 'Koffi', telephone: undefined });
  const mariam = await createCommercial({ businessId: bid, userId: owner.id }, { id: randomUUID(), nom: 'Mariam', telephone: undefined });
  const awa = await createCommercial({ businessId: bid, userId: owner.id }, { id: randomUUID(), nom: 'Awa', telephone: undefined });

  const produit = await createProduct(bid, { nom: 'Pagne wax', prixVente: 15000, prixAchat: 8000, stock: 100, seuilAlerte: 0, unite: 'pièce', type: 'PRODUIT' });
  const client = await createCustomer(bid, { nom: 'Client Démo' });
  const vendre = (qte: number, recu: number, commercialId: string | null, commercialNom?: string, ctx: CreateOrderContext = ctxOwner) =>
    createOrder(ctx, {
      clientUuid: randomUUID(),
      customerId: client.id,
      items: [{ productId: produit.id, qte }],
      montantRecu: recu,
      methode: 'ESPECES',
      fraisLivraison: 0,
      commercialId,
      commercialNom,
    });

  await vendre(8, 60000, mariam.id); // 120 000 F, moitié encaissée
  const k1 = await vendre(3, 45000, koffi.id);
  await vendre(2, 30000, koffi.id);
  await vendre(1, 15000, awa.id);
  const annulee = await vendre(1, 15000, awa.id);
  await cancelOrder({ businessId: bid, userId: owner.id }, annulee.order.id, 'Démo : vente annulée');
  void k1;

  // Hors ligne : commercial inconnu du serveur, nom joint → créé avec la vente.
  const horsLigneId = randomUUID();
  const hl = await vendre(1, 0, horsLigneId, 'Ibrahim (hors ligne)');
  check('Hors ligne : la vente garde son commercial', hl.order.commercialId === horsLigneId);

  // Vendeur commercial : ne peut pas attribuer à un collègue.
  const vendeur = await createEmployee(bid, { nom: 'Fatou', telephone: `0712${Date.now().toString().slice(-6)}`, pin: '123456', role: 'SELLER', permissions: [], estCommercial: true });
  const fiche = await ownerPrisma.commercial.findUniqueOrThrow({ where: { userId: vendeur.id } });
  const vf = await vendre(1, 15000, koffi.id, undefined, { ...ctxOwner, userId: vendeur.id, role: 'SELLER' });
  check('Critère 3 : un vendeur commercial vend toujours pour lui', vf.order.commercialId === fiche.id);

  // Encaissement plus tard sur la vente de Mariam (encaissé de la période).
  const venteMariam = await ownerPrisma.order.findFirstOrThrow({ where: { businessId: bid, commercialId: mariam.id } });
  await collectOrderPayment({ businessId: bid, userId: owner.id, cashRegisterMode: 'LIBRE' }, venteMariam.id, { clientUuid: randomUUID(), montant: 10000, methode: 'WAVE' });

  // Commercial désactivé : ses ventes restent comptées.
  await updateCommercial(bid, awa.id, { actif: false });

  const today = new Date();
  const report = await getCommerciauxReport(bid, today, today);
  const general = await getRangeReport(bid, today, today);
  const ligne = (id: string) => report.rows.find((r) => r.commercialId === id);
  console.log('');
  for (const r of report.rows) {
    console.log(`     ${r.nom.padEnd(22)} ventes ${String(r.ventes).padStart(2)}  CA ${String(r.chiffreAffaires).padStart(7)}  encaissé ${String(r.encaisse).padStart(7)}  reste ${String(r.resteDu).padStart(7)}`);
  }
  console.log(`     ${'TOTAL'.padEnd(22)} ventes ${String(report.total.ventes).padStart(2)}  CA ${String(report.total.chiffreAffaires).padStart(7)}  encaissé ${String(report.total.encaisse).padStart(7)}  reste ${String(report.total.resteDu).padStart(7)}\n`);
  check('Mariam : CA 120 000, encaissé 70 000, reste 50 000', ligne(mariam.id)?.chiffreAffaires === 120000 && ligne(mariam.id)?.encaisse === 70000 && ligne(mariam.id)?.resteDu === 50000);
  check('Koffi : 2 ventes, 75 000 encaissés', ligne(koffi.id)?.ventes === 2 && ligne(koffi.id)?.encaisse === 75000);
  check('Critère 8 : vente annulée sortie des totaux (Awa = 1 vente)', ligne(awa.id)?.ventes === 1 && ligne(awa.id)?.encaisse === 15000);
  check('Critère 7 : Awa désactivée mais toujours comptée', !!ligne(awa.id) && ligne(awa.id)?.actif === false);
  check('Classement par encaissé décroissant', report.rows.slice(0, -1).every((r, i, a) => i === 0 || a[i - 1].encaisse >= r.encaisse));
  check('Critère 6 : total encaissé = encaissé du rapport général', report.total.encaisse === general.recu, `${report.total.encaisse} / ${general.recu}`);

  // Laisser la boutique prête à essayer : Solo actif, 15 jours restants.
  await fixerFin(bid, addDays(new Date(), 15));

  console.log(`\n${echecs === 0 ? 'Tout est passé.' : `${echecs} vérification(s) en échec.`}`);
  console.log(`\nPour essayer dans l'app : téléphone ${telephone}, mot de passe 123456`);
  console.log(`(vendeuse commerciale : ${vendeur.telephone}, mot de passe 123456)`);
  console.log(`Boutique id : ${bid}`);
  await ownerPrisma.$disconnect();
  process.exit(echecs === 0 ? 0 : 1);
}

void DAY;
main().catch(async (error) => {
  console.error(error);
  await ownerPrisma.$disconnect();
  process.exit(1);
});
