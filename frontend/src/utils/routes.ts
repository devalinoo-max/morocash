import type { NavigationTab } from '../types';

export type MoreSubTab =
  | 'expenses'
  | 'reports'
  | 'subscription'
  | 'settings'
  | 'help'
  | 'export'
  | 'employees'
  | 'permissions';

/** Écran qui s'ouvre par-dessus l'onglet (une adresse partageable par action). */
export type RouteModal = 'new-sale' | 'new-product';

export interface RouteMatch {
  tab: NavigationTab;
  subTab: MoreSubTab | null;
  modal: RouteModal | null;
  /** /qui-me-doit : liste clients deja filtree sur les debiteurs. */
  debtorsOnly: boolean;
}

/** La landing publique, et elle seule, vit a la racine. */
export const LANDING_PATH = '/';
export const LOGIN_PATH = '/connexion';
export const REGISTER_PATH = '/inscription';
/** Accueil de l'app : cible de la PWA et de toute redirection apres connexion. */
export const HOME_PATH = '/accueil';

/**
 * Une seule table fait foi pour les deux sens (ecran -> URL, URL -> ecran).
 * Les adresses sont en francais, sans accent ni majuscule, tirets entre les
 * mots : elles s'affichent dans la barre du navigateur et se partagent.
 */
interface RouteDef {
  path: string;
  tab: NavigationTab;
  subTab?: MoreSubTab;
  modal?: RouteModal;
  debtorsOnly?: boolean;
  /** Titre de l'onglet du navigateur, sans le suffixe MoroCash. */
  title: string;
}

const ROUTES: RouteDef[] = [
  { path: '/accueil', tab: 'home', title: 'Accueil' },
  { path: '/commandes', tab: 'sales', title: 'Mes commandes' },
  { path: '/commandes/nouvelle', tab: 'sales', modal: 'new-sale', title: 'Nouvelle commande' },
  { path: '/recus', tab: 'receipts', title: 'Mes reçus' },
  { path: '/produits', tab: 'products', title: 'Mes produits' },
  { path: '/produits/nouveau', tab: 'products', modal: 'new-product', title: 'Nouveau produit' },
  { path: '/mouvements', tab: 'movements', title: 'Mouvements de stock' },
  { path: '/clients', tab: 'customers', title: 'Mes clients' },
  { path: '/qui-me-doit', tab: 'customers', debtorsOnly: true, title: 'Qui me doit' },
  { path: '/caisse', tab: 'cash', title: 'Ma caisse' },
  { path: '/plus', tab: 'more', title: 'Plus' },
  { path: '/depenses', tab: 'more', subTab: 'expenses', title: 'Mes dépenses' },
  { path: '/mes-chiffres', tab: 'more', subTab: 'reports', title: 'Mes chiffres' },
  { path: '/abonnement', tab: 'more', subTab: 'subscription', title: 'Mon abonnement' },
  { path: '/reglages', tab: 'more', subTab: 'settings', title: 'Réglages' },
  { path: '/aide', tab: 'more', subTab: 'help', title: 'Aide' },
  { path: '/exporter', tab: 'more', subTab: 'export', title: 'Exporter mes données' },
  { path: '/employes', tab: 'more', subTab: 'employees', title: 'Mon équipe' },
  { path: '/qui-peut-voir-quoi', tab: 'more', subTab: 'permissions', title: 'Qui peut voir quoi' },
];

/**
 * Anciennes adresses (anglaises) et variantes deja partagees : elles restent
 * valides et pointent vers l'adresse francaise canonique. Le serveur les
 * redirige en 301 (voir server.ts / vercel.json) ; cette table sert au meme
 * usage cote navigateur, pour un favori ouvert dans une PWA deja installee.
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/dashboard': '/accueil',
  '/home': '/accueil',
  '/tableau-de-bord': '/accueil',
  '/orders': '/commandes',
  '/orders/new': '/commandes/nouvelle',
  '/sales': '/commandes',
  '/ventes': '/commandes',
  '/receipts': '/recus',
  '/products': '/produits',
  '/products/new': '/produits/nouveau',
  '/stock-movements': '/mouvements',
  '/movements': '/mouvements',
  '/stock': '/mouvements',
  '/customers': '/clients',
  '/customers/debts': '/qui-me-doit',
  '/expenses': '/depenses',
  '/cash-register': '/caisse',
  '/cash': '/caisse',
  '/reports': '/mes-chiffres',
  '/mes-rapports': '/mes-chiffres',
  '/employees': '/employes',
  '/permissions': '/qui-peut-voir-quoi',
  '/subscription': '/abonnement',
  '/settings': '/reglages',
  '/parametres': '/reglages',
  '/help': '/aide',
  '/export': '/exporter',
  '/login': '/connexion',
  '/register': '/inscription',
  '/more': '/plus',
  '/more/expenses': '/depenses',
  '/more/reports': '/mes-chiffres',
  '/more/subscription': '/abonnement',
  '/more/settings': '/reglages',
  '/more/help': '/aide',
  '/more/export': '/exporter',
  '/more/employees': '/employes',
  '/more/permissions': '/qui-peut-voir-quoi',
};

function normalize(pathname: string): string {
  let trimmed = pathname.toLowerCase();
  while (trimmed.length > 1 && trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed === '' ? '/' : trimmed;
}

/** Adresse francaise d'une adresse quelconque (ancienne ou deja francaise). */
function resolveLegacy(pathname: string): string {
  const path = normalize(pathname);
  return LEGACY_REDIRECTS[path] ?? path;
}

export function pathForTab(
  tab: NavigationTab,
  subTab: MoreSubTab | null = null,
  opts: { modal?: RouteModal | null; debtorsOnly?: boolean } = {}
): string {
  const { modal = null, debtorsOnly = false } = opts;

  if (modal) {
    const withModal = ROUTES.find((r) => r.modal === modal);
    if (withModal) return withModal.path;
  }
  if (tab === 'customers' && debtorsOnly) return '/qui-me-doit';
  if (tab === 'more' && subTab) {
    const withSub = ROUTES.find((r) => r.tab === 'more' && r.subTab === subTab);
    if (withSub) return withSub.path;
  }
  const base = ROUTES.find((r) => r.tab === tab && !r.subTab && !r.modal && !r.debtorsOnly);
  return base?.path ?? HOME_PATH;
}

/**
 * Renvoie l'ecran vise par une adresse, ou null si l'adresse n'appartient pas
 * a l'app (racine, page inconnue) : l'appelant retombe alors sur la landing.
 */
export function matchPath(pathname: string): RouteMatch | null {
  const path = resolveLegacy(pathname);
  if (path === LANDING_PATH) return null;

  const route = ROUTES.find((r) => r.path === path);
  if (!route) return null;

  return {
    tab: route.tab,
    subTab: route.subTab ?? null,
    modal: route.modal ?? null,
    debtorsOnly: route.debtorsOnly ?? false,
  };
}

export function isAuthPath(pathname: string): boolean {
  const path = resolveLegacy(pathname);
  return path === LOGIN_PATH || path === REGISTER_PATH;
}

export type AuthMode = 'login' | 'register';

export interface ViewState {
  viewMode: 'landing' | 'app';
  isAnonymous: boolean;
  authMode: AuthMode;
  tab: NavigationTab;
  subTab: MoreSubTab | null;
  modal?: RouteModal | null;
  debtorsOnly?: boolean;
}

/** Adresse que doit afficher la barre d'URL pour l'ecran actuellement rendu. */
export function pathForView(view: ViewState): string {
  if (view.viewMode === 'landing') return LANDING_PATH;
  if (view.isAnonymous) return view.authMode === 'login' ? LOGIN_PATH : REGISTER_PATH;
  return pathForTab(view.tab, view.subTab, {
    modal: view.modal ?? null,
    debtorsOnly: view.debtorsOnly ?? false,
  });
}

/**
 * Adresse canonique de l'ecran designe par une URL : sert a distinguer une
 * simple normalisation (ancienne adresse anglaise, majuscules, slash final,
 * a remplacer dans l'historique) d'un vrai changement d'ecran (a empiler).
 */
export function canonicalPath(pathname: string): string {
  const match = matchPath(pathname);
  if (match) {
    return pathForTab(match.tab, match.subTab, {
      modal: match.modal,
      debtorsOnly: match.debtorsOnly,
    });
  }
  if (isAuthPath(pathname)) return resolveLegacy(pathname);
  return LANDING_PATH;
}

/**
 * Titre affiche dans l'onglet du navigateur, en francais comme les adresses.
 * La landing garde son titre commercial (celui d'index.html).
 */
export const LANDING_TITLE = 'MoroCash — Gestion de Caisse & Ventes Hors-Ligne';

export function titleForPath(pathname: string): string {
  const path = resolveLegacy(pathname);
  if (path === LOGIN_PATH) return 'Connexion · MoroCash';
  if (path === REGISTER_PATH) return 'Inscription · MoroCash';
  const route = ROUTES.find((r) => r.path === path);
  return route ? `${route.title} · MoroCash` : LANDING_TITLE;
}
