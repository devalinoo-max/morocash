import type { MoreSubTab } from '../../utils/routes';
import type { NavigationTab } from '../../types';

/**
 * Ce que le moteur de visite sait de l'app. Volontairement étroit : un
 * scénario ne peut que lire l'avancement du commerçant, jamais enregistrer une
 * vente ou modifier un produit à sa place.
 *
 * Il ne peut pas non plus changer d'écran de lui-même. La visite montre le
 * chemin, le commerçant le prend : c'est ainsi qu'il apprend où appuyer la
 * prochaine fois, ce qu'une visite qui l'y téléporte ne lui apprend jamais.
 * Seuls deux boutons sur lesquels le commerçant appuie lui-même — « Continuer »
 * de la bulle de passage et celui des félicitations — ramènent au tableau de
 * bord, et ils passent par `ouvrirEcran`.
 */
export interface TourApp {
  /** Nombre de produits au catalogue. */
  nbProduits: number;
  /** Nombre de ventes enregistrées, annulées comprises. */
  nbVentes: number;
  /** Articles dans le panier de la vente en cours. */
  nbArticlesPanier: number;
  /** La fenêtre de nouvelle vente est ouverte. */
  venteOuverte: boolean;
  /** La fenêtre de nouveau produit est ouverte. */
  produitOuvert: boolean;
  /** Écran affiché : `home`, `products`, `more/reports`... */
  ecran: string;

  /** Réservé aux boutons « Continuer » de la visite. Jamais à une bulle. */
  ouvrirEcran: (tab: NavigationTab, subTab?: MoreSubTab | null) => void;
  /** Referme le reçu qui s'ouvre tout seul après une vente. */
  fermerRecu: () => void;
}

/**
 * Les trois types de bulle. C'est la pièce maîtresse du moteur : de quoi
 * dépend l'avancement, et donc qui garde la main.
 *
 * `regarde` présente un endroit — un onglet, une icône. Bouton « Suivant »,
 * toujours actif.
 *
 * `remplis` désigne un champ à saisir. Bouton « Suivant » désactivé et grisé
 * tant que le champ n'est pas valide, actif dès qu'il l'est. Elle n'avance
 * **jamais** toute seule, quel que soit le contenu du champ : sinon la bulle
 * saute au bout de deux lettres et le voile vient recouvrir le champ que le
 * commerçant était encore en train de remplir. Il finit d'écrire, puis appuie.
 *
 * `appuie` désigne un bouton à presser. Pas de bouton dans la bulle : elle
 * avance toute seule quand l'appui réel a lieu, et c'est le seul cas où
 * l'avance automatique est permise.
 */
export type TourStepKind = 'regarde' | 'remplis' | 'appuie';

export interface TourStep {
  /** Identifiant stable, sert aux tests et au journal. */
  id: string;
  kind: TourStepKind;
  /**
   * Sélecteur CSS de l'élément à éclairer. `null` = bulle centrée, sans
   * projecteur (fin d'acte, félicitations).
   */
  target: string | null;
  /** 5 mots maximum. Absent sur les bulles du parcours, qui vont droit au but. */
  titre?: string;
  /** 20 mots maximum. `**gras**` y désigne le bouton sur lequel appuyer. */
  texte: string;
  /** Libellé du bouton d'une bulle « Regarde » ou « Remplis ». Défaut : « Suivant ». */
  bouton?: string;
  /**
   * Préparer l'écran avant d'afficher la bulle : déplier un volet, refermer un
   * reçu. Jamais un changement d'écran — une bulle « Appuie » s'en charge, en
   * faisant appuyer le commerçant lui-même.
   */
  prepare?: (app: TourApp) => void;
  /**
   * Bulle « Remplis » : vrai quand le champ est valide. Le bouton « Suivant »
   * s'allume, et rien d'autre ne se produit — surtout pas une avance.
   */
  valide?: (cible: Element | null) => boolean;
  /**
   * Bulle « Appuie » : vrai quand l'appui attendu a eu lieu. C'est la seule
   * condition d'avance automatique du moteur.
   */
  passeQuand?: (app: TourApp, cible: Element | null) => boolean;
  /**
   * Variante de `passeQuand` pour les gestes dont l'app ne publie pas l'état :
   * l'étape passe dès que cet élément apparaît à l'écran. C'est ainsi qu'on
   * suit l'avancement d'une vente d'un écran de la caisse au suivant, sans
   * aller câbler la visite dans la fenêtre de vente.
   */
  passeQuandVisible?: string;
  /** Joué quand le commerçant appuie sur le bouton de la bulle. */
  action?: (app: TourApp) => void;
  /** Habillage plein écran au lieu d'une bulle (félicitations, fin d'acte). */
  variante?: 'bulle' | 'panneau-bas' | 'plein-ecran';
}

export interface TourScenario {
  id: TourScenarioId;
  steps: TourStep[];
}

/**
 * Les scénarios. `accueil` et `parcours` ne jouent qu'une fois dans la vie du
 * compte ; les `ecran-*` sont les bulles isolées de première visite.
 */
export type TourScenarioId =
  | 'accueil'
  | 'parcours'
  | 'ecran-clients'
  | 'ecran-depenses'
  | 'ecran-stock'
  | 'ecran-rapports';

export interface TourApi {
  /** Scénario en cours, null quand aucune visite ne tourne. */
  scenario: TourScenarioId | null;
  step: TourStep | null;
  /** Rang de l'étape affichée dans son scénario, à partir de 0. */
  index: number;
  total: number;
  /** Avance d'une bulle à bouton. Sans effet sur une bulle « Appuie ». */
  suivant: () => void;
  /** « Passer » et la touche Échap : on quitte la visite pour de bon. */
  passer: () => void;
  /** Aide → « Revoir la visite ». */
  rejouerAccueil: () => void;
  /** Lance le parcours en 3 actes depuis le début, ou là où il s'est arrêté. */
  lancerParcours: () => void;
  /** Le parcours en 3 actes reste à faire (bande du tableau de bord, Aide). */
  parcoursRestant: boolean;
}
