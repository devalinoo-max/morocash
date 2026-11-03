import type { TourScenario, TourScenarioId, TourStep } from './types';

/**
 * Les textes de la visite guidée. Un titre fait 5 mots au plus, une phrase 20
 * au plus : au-delà personne ne lit, et une bulle qu'on ne lit pas ne sert à
 * rien. Une bulle qui aurait besoin de plus est coupée en deux.
 *
 * Trois règles d'écriture, parce que « trop général » veut dire « compris par
 * les seuls qui n'avaient pas besoin d'aide » :
 *
 *  1. Dire OÙ appuyer, pas seulement quoi faire — « le bouton violet en bas »,
 *     « le cadre juste au-dessus ». Le nom du bouton va en `**gras**`.
 *  2. Donner un exemple chiffré, toujours. Le commerçant recopie l'exemple et
 *     comprend par l'action, pas par la description.
 *  3. Dire le format attendu quand il y a un piège — « sans espace, sans le F ».
 *
 * Les repères visés sont les identifiants déjà posés sur les écrans
 * (`#input-product-form-name`, `#btn-pos-checkout`...) et quelques attributs
 * `data-tour` ajoutés là où il n'y avait rien à viser. Un repère introuvable
 * fait sauter la bulle : c'est voulu, et c'est ce qui permet à la visite de
 * survivre à une refonte d'écran.
 *
 * Un même repère existe souvent deux fois — barre du bas sur téléphone, barre
 * latérale sur ordinateur — et le moteur retient celui qui est affiché. Les
 * deux chemins ne font pas le même nombre d'appuis : sur téléphone « Créer »
 * ouvre un menu, et « Plus » précède « Mes chiffres », là où la barre latérale
 * mène droit au but. Les bulles intermédiaires sont donc écrites pour les deux
 * et se passent toutes seules là où l'étape n'existe pas.
 */

/** Montant saisi dans un champ d'argent : au moins un chiffre, et non nul. */
function montantSaisi(cible: Element | null): boolean {
  if (!(cible instanceof HTMLInputElement)) return false;
  const chiffres = cible.value.replace(/\D/g, '');
  return chiffres.length > 0 && Number(chiffres) > 0;
}

/** Texte saisi dans un champ : au moins deux caractères. */
function texteSaisi(cible: Element | null): boolean {
  if (!(cible instanceof HTMLInputElement)) return false;
  return cible.value.trim().length >= 2;
}

// ── La visite d'accueil ───────────────────────────────────────────────────
// Quatre bulles « Regarde » qui situent les quatre endroits dont on a besoin
// le premier jour, puis une cinquième, centrée, qui propose d'enchaîner sur la
// première vente. Elle ne joue qu'une fois, à la première ouverture.

const ACCUEIL: TourStep[] = [
  {
    id: 'accueil-chiffres',
    kind: 'regarde',
    target: '[data-tour="kpis-accueil"]',
    titre: 'Tes chiffres du jour',
    texte: 'Ils se mettent à jour tout seuls, à chaque vente que tu enregistres. Rien à calculer.',
  },
  {
    id: 'accueil-vendre',
    kind: 'regarde',
    target: '[data-tour="btn-vendre"]',
    titre: 'Ton bouton principal',
    texte: 'C’est ici que tu enregistres chaque vente. Tu vas l’utiliser tous les jours.',
  },
  {
    id: 'accueil-benefice',
    kind: 'regarde',
    target: '[data-tour="nav-chiffres"], [data-tour="nav-plus"]',
    titre: 'Ce que tu as gagné',
    texte: 'Chaque soir, tu viens ici. C’est le chiffre qui compte vraiment.',
  },
  {
    // L'ancienne version disait « Perdu ? Appuie ici, le guide revient quand
    // tu veux ». Trop vague : personne n'y devinait qu'un assistant attend
    // derrière, ni qu'on peut lui parler en langage normal. Ces deux choses-là
    // sont tout l'intérêt du bouton, elles sont donc dites.
    id: 'accueil-aide',
    kind: 'regarde',
    target: '#btn-help-assistant',
    titre: 'Si tu es bloqué',
    texte: 'Appuie sur ce bouton et pose ta question à l’assistant. Il te dira où aller.',
    bouton: 'C’est parti',
  },
  {
    // Le vrai déclencheur du parcours. « Passer » tient ici le rôle de
    // « Plus tard ».
    id: 'accueil-enchainer',
    kind: 'regarde',
    target: null,
    titre: 'Tes 4 premières étapes',
    texte: 'Fais-les dans l’ordre. Ça te prend 5 minutes et après tu sais tout.',
    bouton: 'On y va',
  },
];

// ── Acte 1 — Ajouter un produit ───────────────────────────────────────────
// La visite ne change jamais d'écran toute seule : avant chaque changement,
// une bulle « Appuie » montre le bouton qui y mène, et attend l'appui réel.
// Le commerçant apprend ainsi où appuyer la prochaine fois, ce qu'une visite
// qui l'y téléporte ne lui apprend jamais.

const ACTE_1: TourStep[] = [
  {
    id: 'produit-onglet',
    kind: 'appuie',
    target: '[data-tour="nav-produits"]',
    titre: 'Voici le chemin',
    texte: 'Appuie sur **Produits**, en bas : c’est là que vit ta liste de produits.',
    passeQuand: (app) => app.ecran === 'products',
  },
  {
    id: 'produit-ajouter',
    kind: 'appuie',
    target: '#btn-add-new-product',
    titre: 'Voici le bouton',
    texte: 'Appuie sur **Ajouter** : la fiche du produit va s’ouvrir.',
    passeQuand: (app) => app.produitOuvert,
  },
  {
    id: 'produit-nom',
    kind: 'remplis',
    target: '#input-product-form-name',
    titre: 'Le nom du produit',
    texte: 'Appuie sur le cadre et tape le nom. Exemple : Sac à main.',
    valide: texteSaisi,
  },
  {
    // Le formulaire demande le prix de vente avant le prix d'achat : on suit
    // son ordre réel plutôt que de faire descendre puis remonter l'écran.
    id: 'produit-prix-vente',
    kind: 'remplis',
    target: '#input-product-form-sale-price',
    titre: 'Le prix de vente',
    texte: 'Le prix que le client paie. Exemple : 5000. La différence, c’est ton gain.',
    valide: montantSaisi,
  },
  {
    // « Prix d’achat » dort sous l'accordéon « Plus de détails ». Sans lui, le
    // bénéfice affiché serait faux : la bulle qui porte tout l'intérêt de
    // l'acte ne peut pas être sautée. On ne déplie pas le volet à la place du
    // commerçant — on lui montre le bouton, comme pour un changement d'écran.
    id: 'produit-details',
    kind: 'appuie',
    target: '#btn-product-form-details',
    titre: 'Encore un prix',
    texte: 'Appuie sur **Plus de détails** : le prix d’achat est caché là-dessous.',
    passeQuandVisible: '#input-product-form-purchase-price',
  },
  {
    id: 'produit-prix-achat',
    kind: 'remplis',
    target: '#input-product-form-purchase-price',
    titre: 'Le prix d’achat',
    texte: 'Le prix que **toi** tu paies au fournisseur. Exemple : 3500. Sans espace, sans le F.',
    valide: montantSaisi,
  },
  {
    id: 'produit-enregistrer',
    kind: 'appuie',
    target: '#btn-submit-product-form',
    titre: 'Enregistre',
    texte: 'Appuie sur le bouton violet en bas. Ton produit sera dans ta liste pour toujours.',
    passeQuand: (app) => app.nbProduits > 0 && !app.produitOuvert,
  },
  {
    // Bulle de passage. Son bouton ramène au tableau de bord — et non droit à
    // l'écran de vente : l'acte 2 commence par montrer le bouton « Créer »,
    // qui ne s'apprend que depuis le tableau de bord.
    id: 'produit-cree',
    kind: 'regarde',
    target: null,
    variante: 'panneau-bas',
    texte: 'Produit créé. Maintenant, vends-le.',
    bouton: 'Continuer',
    action: (app) => app.ouvrirEcran('home'),
  },
];

// ── Acte 2 — Enregistrer une vente ────────────────────────────────────────
// Quatre bulles au programme — le bouton, le produit, la quantité, la
// validation — plus celles sans lesquelles le commerçant resterait bloqué :
// une commande ne s'enregistre pas sans client, et l'app réclame en chemin un
// récapitulatif et un mode de paiement. Les taire, c'est se taire pile au
// moment où il bute sur le seul vrai obstacle du parcours.

const ACTE_2: TourStep[] = [
  {
    id: 'vente-bouton',
    kind: 'appuie',
    target: '[data-tour="btn-vendre"]',
    titre: 'Voici le bouton',
    texte: 'Appuie sur **Créer** : l’écran de la vente va s’ouvrir.',
    // Sur téléphone le bouton ouvre un menu à deux choix ; sur ordinateur la
    // barre latérale ouvre la vente directement. Les deux comptent.
    passeQuand: (app) =>
      app.venteOuverte || document.querySelector('#btn-create-menu-sale') !== null,
  },
  {
    // Inexistante sur ordinateur : la vente est déjà ouverte en arrivant ici,
    // et l'étape se passe au premier battement, sans attente visible.
    id: 'vente-menu',
    kind: 'appuie',
    target: '#btn-create-menu-sale',
    titre: 'Choisis la vente',
    texte: 'Appuie sur **Nouvelle commande**, tout en haut du menu.',
    passeQuand: (app) => app.venteOuverte,
  },
  {
    id: 'vente-produit',
    kind: 'appuie',
    target: '[data-tour="pos-produit"]',
    titre: 'Choisis le produit',
    texte: 'Appuie sur le produit que tu viens de créer. Il devient violet.',
    passeQuand: (app) => app.nbArticlesPanier > 0,
  },
  {
    // Il n'y a pas de champ Quantité à la caisse : elle vaut déjà 1 et se
    // règle avec « − » et « + ». Rien à saisir, donc rien à attendre — une
    // bulle qui montre, pas une bulle qui réclame.
    //
    // Sur téléphone le panier est replié derrière sa barre basse : on désigne
    // alors la barre, seule chose visible, plutôt que de sauter la bulle.
    id: 'vente-quantite',
    kind: 'regarde',
    target: '[data-tour="pos-quantite"], #btn-mobile-cart-collapsed',
    titre: 'La quantité',
    texte: 'Combien le client en prend. Exemple : 2. Les boutons moins et plus la changent.',
  },
  {
    id: 'vente-voir',
    kind: 'appuie',
    target: '#btn-pos-checkout, #btn-pos-checkout-mobile-bar, #btn-pos-checkout-mobile',
    titre: 'Vérifie la commande',
    texte: 'Appuie sur le bouton violet en bas : tu vas relire la commande avant de valider.',
    passeQuandVisible: '#btn-review-pay',
  },
  {
    id: 'vente-client',
    kind: 'appuie',
    target: '#btn-choose-customer-review',
    titre: 'Dis à qui tu vends',
    texte: 'Appuie ici et choisis un client. Tu peux en créer un en dix secondes.',
    passeQuandVisible: '#btn-change-customer-review',
  },
  {
    id: 'vente-encaisser',
    kind: 'appuie',
    target: '#btn-review-pay',
    titre: 'Passe au paiement',
    texte: 'Tout est bon ? Appuie sur le bouton violet en bas de l’écran.',
    passeQuandVisible: '#btn-pay-full',
  },
  {
    id: 'vente-paiement',
    kind: 'appuie',
    target: '#btn-pay-full',
    titre: 'Comment il a payé',
    texte: 'Le client a tout payé : choisis ça. S’il doit encore, prends « Payé en partie ».',
    passeQuandVisible: '#btn-confirm-and-make-receipt',
  },
  {
    id: 'vente-valider',
    kind: 'appuie',
    target: '#btn-confirm-and-make-receipt',
    titre: 'Valide la vente',
    texte: 'Appuie sur le bouton violet. Ton stock baisse tout seul.',
    passeQuand: (app) => app.nbVentes > 0 && !app.venteOuverte,
  },
];

// ── Acte 3 — Comprendre son bénéfice ──────────────────────────────────────
// Les félicitations viennent de montrer les trois chiffres de la vente — ceux
// que le commerçant vient lui-même de saisir, jamais des chiffres d'exemple.
// Reste à lui montrer où les retrouver tous les soirs, et le bouton
// « Continuer » des félicitations l'a ramené au tableau de bord pour qu'il
// prenne le chemin lui-même.

const ACTE_3: TourStep[] = [
  {
    id: 'benefice-onglet',
    kind: 'appuie',
    target: '[data-tour="nav-chiffres"], [data-tour="nav-plus"]',
    titre: 'Voici le chemin',
    texte: 'Appuie ici : tes chiffres du jour vont s’afficher.',
    passeQuand: (app) =>
      app.ecran === 'more/reports' || document.querySelector('#btn-more-reports') !== null,
    // Le reçu de la vente s'ouvre de lui-même juste avant : on le referme,
    // sinon la bulle éclaire un onglet caché derrière un reçu.
    prepare: (app) => app.fermerRecu(),
  },
  {
    // Inexistante sur ordinateur, où « Mes chiffres » est dans la barre
    // latérale : l'étape se passe au premier battement.
    id: 'benefice-entree',
    kind: 'appuie',
    target: '#btn-more-reports',
    titre: 'Mes chiffres',
    texte: 'Appuie sur **Mes chiffres** : c’est la ligne avec le petit graphique.',
    passeQuand: (app) => app.ecran === 'more/reports',
  },
  {
    id: 'benefice-lecture',
    kind: 'regarde',
    target: '[data-tour="chiffres-indicateurs"]',
    titre: 'Tes chiffres, expliqués',
    texte: 'Vendu, c’est ce que tu as facturé. Gagné, c’est ce qui te reste vraiment.',
    bouton: 'J’ai compris',
  },
];

/**
 * Le parcours est un seul scénario de bout en bout : c'est ce qui permet de
 * reprendre à la bonne étape après une fermeture de l'application, et de ne
 * jamais lâcher la personne entre deux écrans.
 *
 * L'écran de félicitations s'intercale entre l'acte 2 et l'acte 3 ; ce n'est
 * pas une étape, c'est le moteur qui le pose (voir TourProvider).
 */
const PARCOURS: TourStep[] = [...ACTE_1, ...ACTE_2, ...ACTE_3];

/** Rang de l'étape qui ouvre l'acte 3, pour savoir où poser les félicitations. */
export const INDEX_ACTE_3 = ACTE_1.length + ACTE_2.length;

/** Exposés pour les tests : chaque acte doit garder sa forme. */
export const ACTES = { ACCUEIL, ACTE_1, ACTE_2, ACTE_3 };

// ── Les bulles isolées, à la première visite d'un écran ───────────────────
// Une seule bulle « Regarde », centrée, la toute première fois qu'un écran est
// ouvert, jamais ensuite.

function bulleEcran(id: TourScenarioId, titre: string, texte: string): TourScenario {
  return {
    id,
    steps: [{ id: `${id}-bulle`, kind: 'regarde', target: null, titre, texte, bouton: 'Compris' }],
  };
}

export const SCENARIOS: Record<TourScenarioId, TourScenario> = {
  accueil: { id: 'accueil', steps: ACCUEIL },
  parcours: { id: 'parcours', steps: PARCOURS },
  'ecran-clients': bulleEcran(
    'ecran-clients',
    'Tes clients qui doivent',
    'Tous ceux qui te doivent de l’argent sont ici, avec le nombre de jours de retard.'
  ),
  'ecran-depenses': bulleEcran(
    'ecran-depenses',
    'Note tout ce qui sort',
    'Transport, marchandise, loyer. Exemple : 500 de taxi. Sinon ton bénéfice est faux.'
  ),
  'ecran-stock': bulleEcran(
    'ecran-stock',
    'Ce qui va manquer',
    'Quand un produit descend trop bas, il passe en rouge ici. Pense à le racheter.'
  ),
  'ecran-rapports': bulleEcran(
    'ecran-rapports',
    'Tes chiffres à montrer',
    'De quoi montrer tes chiffres à ta banque ou à ton comptable, sans rien recopier.'
  ),
};

/**
 * Écran ouvert → bulle de première visite correspondante. Le tableau de bord,
 * les commandes et le catalogue n'y sont pas : la visite d'accueil les a déjà
 * présentés, et une bulle de plus serait une bulle de trop.
 */
export const BULLE_PAR_ECRAN: Record<string, TourScenarioId> = {
  customers: 'ecran-clients',
  'more/expenses': 'ecran-depenses',
  movements: 'ecran-stock',
  'more/reports': 'ecran-rapports',
};
