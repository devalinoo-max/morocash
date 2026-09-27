import type { NavigationTab } from '../../types';
import type { MoreSubTab } from '../../utils/routes';

/**
 * Assistant d'aide : aucune IA, aucun appel réseau. MoroCash a un nombre fini
 * d'écrans et d'actions ; chacun est décrit ici avec les façons dont un
 * commerçant peut le demander. La question est comparée à ces formulations —
 * ça marche hors ligne, c'est gratuit, et une redirection ne peut jamais être
 * inventée : seules les destinations listées ici existent.
 */

/** Ce que fait le bouton de la réponse. Chaque cible correspond à un vrai écran ou à une vraie action. */
export type HelpTarget =
  | { kind: 'screen'; tab: NavigationTab; subTab?: MoreSubTab; debtorsOnly?: boolean }
  | { kind: 'action'; action: 'newSale' | 'newExpense' | 'newProduct' };

export interface HelpIntent {
  id: string;
  /** Formulations reconnues, en langage courant. Les mots vides sont ignorés. */
  phrases: string[];
  answer: string;
  /** Absent : réponse d'information seule, sans bouton. */
  button?: { label: string; target: HelpTarget };
  /** Écran de stock : masqué pour une activité de services. */
  stockOnly?: boolean;
}

export const HELP_INTENTS: HelpIntent[] = [
  {
    id: 'new-sale',
    phrases: [
      'nouvelle commande', 'creer commande', 'faire commande', 'ajouter commande', 'passer commande',
      'enregistrer vente', 'faire vente', 'nouvelle vente', 'vendre', 'encaisser client', 'panier',
    ],
    answer:
      'Touche le bouton « + » en bas de l’écran (ou « Nouvelle commande » sur ordinateur), choisis les produits, puis valide le paiement. Le reçu est créé tout de suite.',
    button: { label: 'Créer une commande maintenant', target: { kind: 'action', action: 'newSale' } },
  },
  {
    id: 'sales-list',
    phrases: ['mes commandes', 'voir commandes', 'liste commandes', 'historique commandes', 'historique ventes', 'mes ventes', 'retrouver commande', 'annuler commande'],
    answer: 'Toutes tes commandes sont dans « Mes commandes », avec un filtre par période en haut de la liste.',
    button: { label: 'Aller à Mes commandes', target: { kind: 'screen', tab: 'sales' } },
  },
  {
    id: 'sales-export',
    phrases: ['exporter commandes', 'excel commandes', 'csv commandes', 'exporter ventes', 'excel ventes', 'imprimer commandes', 'pdf commandes'],
    answer:
      'Dans « Mes commandes », ouvre le menu « … » en haut : tu y trouveras « Exporter Excel (.csv) » et « Imprimer / PDF ».',
    button: { label: 'Aller à Mes commandes', target: { kind: 'screen', tab: 'sales' } },
  },
  {
    id: 'receipts',
    phrases: ['recu', 'renvoyer recu', 'envoyer recu', 'recu whatsapp', 'imprimer recu', 'facture', 'ticket', 'client rien recu', 'telecharger recu'],
    answer:
      'Dans « Mes reçus », tu retrouves chaque reçu : tu peux le renvoyer sur WhatsApp, l’imprimer ou télécharger les PDF.',
    button: { label: 'Aller à Mes reçus', target: { kind: 'screen', tab: 'receipts' } },
  },
  {
    id: 'products',
    phrases: ['mes produits', 'voir produits', 'liste produits', 'modifier produit', 'changer prix', 'prix produit', 'supprimer produit', 'photo produit', 'catalogue'],
    answer:
      'Tes produits sont dans « Mon catalogue ». Touche un produit pour changer son prix, sa photo ou son stock.',
    button: { label: 'Aller à Mes produits', target: { kind: 'screen', tab: 'products' } },
  },
  {
    id: 'new-product',
    phrases: ['ajouter produit', 'nouveau produit', 'creer produit', 'enregistrer produit', 'mettre produit', 'ajouter article', 'nouvel article'],
    answer: 'Remplis le nom, le prix et, si tu veux, une photo et le stock de départ. Le produit apparaît aussitôt dans ton catalogue.',
    button: { label: 'Ajouter un produit maintenant', target: { kind: 'action', action: 'newProduct' } },
  },
  {
    id: 'catalog-export',
    phrases: ['telecharger catalogue', 'exporter catalogue', 'sortir catalogue', 'catalogue pdf', 'partager catalogue', 'envoyer catalogue', 'exporter produits', 'telecharger produits'],
    answer: 'Dans « Mes produits », touche « Télécharger votre catalogue » : tu obtiens un PDF avec tes produits, leurs prix et leurs photos.',
    button: { label: 'Aller à Mes produits', target: { kind: 'screen', tab: 'products' } },
  },
  {
    id: 'labels',
    phrases: ['etiquette', 'imprimer etiquettes', 'code barre', 'qr code', 'etiquette prix'],
    answer: 'Dans « Mes produits », touche « Imprimer vos étiquettes », puis choisis les produits à étiqueter.',
    button: { label: 'Aller à Mes produits', target: { kind: 'screen', tab: 'products' } },
  },
  {
    id: 'low-stock',
    phrases: ['rupture', 'stock faible', 'va manquer', 'bientot fini', 'plus de stock', 'produits finis', 'alerte stock'],
    answer: 'Les produits presque épuisés sont signalés par un point de couleur dans « Mes produits » ; filtre la liste pour ne voir qu’eux.',
    button: { label: 'Aller à Mes produits', target: { kind: 'screen', tab: 'products' } },
    stockOnly: true,
  },
  {
    id: 'stock-reception',
    phrases: ['marchandise recue', 'reception marchandise', 'ajouter stock', 'recharger stock', 'arrivage', 'livraison fournisseur', 'entree stock', 'reapprovisionner'],
    answer: 'Dans « Mon stock », touche « + Marchandise reçue » et indique les quantités arrivées : le stock se met à jour.',
    button: { label: 'Aller à Mon stock', target: { kind: 'screen', tab: 'movements' } },
    stockOnly: true,
  },
  {
    id: 'stock-loss',
    phrases: ['casse', 'abime', 'perdu', 'vole', 'vol', 'perte stock', 'retirer stock', 'produit gate'],
    answer: 'Dans « Mon stock », touche « Cassé ou abîmé » ou « Perdu ou volé » pour sortir ces quantités du stock.',
    button: { label: 'Aller à Mon stock', target: { kind: 'screen', tab: 'movements' } },
    stockOnly: true,
  },
  {
    id: 'stock-count',
    phrases: ['inventaire', 'comptage', 'compter stock', 'verifier stock', 'corriger stock', 'mon stock', 'mouvements stock'],
    answer: 'Dans « Mon stock », touche « Faire un comptage » : tu saisis ce que tu comptes réellement et l’écart est corrigé et gardé en historique.',
    button: { label: 'Aller à Mon stock', target: { kind: 'screen', tab: 'movements' } },
    stockOnly: true,
  },
  {
    id: 'customers',
    phrases: ['mes clients', 'ajouter client', 'nouveau client', 'liste clients', 'numero client', 'fichier client'],
    answer: 'Dans « Mes clients », touche « Ajouter un client » pour enregistrer son nom et son numéro.',
    button: { label: 'Aller à Mes clients', target: { kind: 'screen', tab: 'customers' } },
  },
  {
    id: 'debtors',
    phrases: ['qui me doit', 'dette', 'credit client', 'impaye', 'relancer client', 'relance', 'rappeler dette', 'remboursement', 'client doit'],
    answer:
      '« Qui me doit » liste les clients qui ont une dette. Touche « Relance WhatsApp » pour leur rappeler, ou « Encaisser remboursement » quand ils paient.',
    button: { label: 'Aller à Qui me doit', target: { kind: 'screen', tab: 'customers', debtorsOnly: true } },
  },
  {
    id: 'cash-open',
    phrases: ['ouvrir caisse', 'commencer journee', 'fond caisse', 'debut journee', 'ma caisse', 'caisse'],
    answer: 'Dans « Ma caisse », touche « Ouvrir la caisse » et saisis le fond de départ (l’argent déjà dans le tiroir).',
    button: { label: 'Aller à Ma caisse', target: { kind: 'screen', tab: 'cash' } },
  },
  {
    id: 'cash-close',
    phrases: ['fermer caisse', 'cloturer caisse', 'fin journee', 'compter caisse', 'ecart caisse', 'bilan journee'],
    answer: 'Dans « Ma caisse », touche « Fermer la caisse et compter » : tu saisis ce qu’il y a dans le tiroir et MoroCash affiche l’écart éventuel.',
    button: { label: 'Aller à Ma caisse', target: { kind: 'screen', tab: 'cash' } },
  },
  {
    id: 'new-expense',
    phrases: ['nouvelle depense', 'ajouter depense', 'enregistrer depense', 'noter depense', 'sortie argent', 'payer loyer', 'payer fournisseur', 'achat marchandise'],
    answer: 'Indique le montant, la catégorie et une note si besoin. La dépense est déduite de ce que tu gagnes.',
    button: { label: 'Enregistrer une dépense maintenant', target: { kind: 'action', action: 'newExpense' } },
  },
  {
    id: 'expenses',
    phrases: ['mes depenses', 'voir depenses', 'liste depenses', 'ce que je depense', 'historique depenses'],
    answer: 'Toutes tes dépenses sont dans « Ce que je dépense », classées par date et par catégorie.',
    button: { label: 'Aller à mes dépenses', target: { kind: 'screen', tab: 'more', subTab: 'expenses' } },
  },
  {
    id: 'reports',
    phrases: ['mes chiffres', 'benefice', 'combien gagne', 'chiffre affaires', 'rapport', 'statistique', 'meilleur produit', 'resultat mois', 'combien vendu'],
    answer: '« Mes chiffres » montre ce que tu as vendu, dépensé et gagné, par période, avec tes meilleurs produits.',
    button: { label: 'Aller à Mes chiffres', target: { kind: 'screen', tab: 'more', subTab: 'reports' } },
  },
  {
    id: 'home',
    phrases: ['accueil', 'tableau bord', 'resume journee', 'vente aujourd hui', 'ventes jour'],
    answer: 'L’accueil résume ta journée : ventes, argent encaissé et alertes.',
    button: { label: 'Aller à l’accueil', target: { kind: 'screen', tab: 'home' } },
  },
  {
    id: 'employees',
    phrases: ['employe', 'vendeur', 'ajouter vendeur', 'ajouter personne', 'mon equipe', 'caissier', 'gerant', 'donner acces'],
    answer: 'Dans « Employés », touche « Ajouter une personne » : tu choisis son numéro, son code et ce qu’elle a le droit de faire.',
    button: { label: 'Aller à Mon équipe', target: { kind: 'screen', tab: 'more', subTab: 'employees' } },
  },
  {
    id: 'permissions',
    phrases: ['qui peut voir quoi', 'droits', 'permission', 'acces employe', 'limiter vendeur', 'remise vendeur', 'plafond remise'],
    answer: '« Qui peut voir quoi » te montre ce que chaque personne de l’équipe peut faire, et le plafond de remise des vendeurs.',
    button: { label: 'Aller à Qui peut voir quoi', target: { kind: 'screen', tab: 'more', subTab: 'permissions' } },
  },
  {
    id: 'subscription',
    phrases: ['abonnement', 'payer abonnement', 'renouveler', 'prix application', 'tarif', 'essai gratuit', 'formule', 'fin essai', 'expire'],
    answer: '« Mon abonnement » affiche ta formule, sa date de fin, et te permet de payer ou de renouveler.',
    button: { label: 'Aller à Mon abonnement', target: { kind: 'screen', tab: 'more', subTab: 'subscription' } },
  },
  {
    id: 'settings-shop',
    phrases: ['reglages', 'parametres', 'nom boutique', 'logo', 'adresse boutique', 'ma boutique', 'devise', 'changer activite'],
    answer: 'Dans « Réglages », la section « Ma boutique » permet de changer le nom, le logo et les coordonnées de ta boutique.',
    button: { label: 'Aller aux Réglages', target: { kind: 'screen', tab: 'more', subTab: 'settings' } },
  },
  {
    id: 'settings-receipts',
    phrases: ['modifier recu', 'personnaliser recu', 'note recu', 'imprimante', 'page essai', 'format impression', 'ticket caisse'],
    answer: 'Dans « Réglages », la section « Mes reçus » règle ce qui apparaît sur le reçu et l’imprimante ; « Imprimer une page d’essai » vérifie qu’elle marche.',
    button: { label: 'Aller aux Réglages', target: { kind: 'screen', tab: 'more', subTab: 'settings' } },
  },
  {
    id: 'settings-categories',
    phrases: ['categorie', 'ajouter categorie', 'mes categories', 'ranger produits'],
    answer: 'Dans « Réglages », la section « Mes catégories » permet d’ajouter, renommer ou retirer une catégorie.',
    button: { label: 'Aller aux Réglages', target: { kind: 'screen', tab: 'more', subTab: 'settings' } },
  },
  {
    id: 'password',
    phrases: ['mot de passe', 'changer code', 'code oublie', 'modifier code', 'nouveau code', 'mon compte', 'pin'],
    answer: 'Dans « Réglages », section « Mon compte », touche « Changer mon mot de passe ».',
    button: { label: 'Aller aux Réglages', target: { kind: 'screen', tab: 'more', subTab: 'settings' } },
  },
  {
    id: 'export',
    phrases: ['sauvegarde', 'sauvegarder', 'exporter donnees', 'telecharger donnees', 'backup', 'recuperer donnees'],
    answer: '« Sauvegarde & Export » permet de télécharger tes données (commandes, produits) dans un fichier.',
    button: { label: 'Aller à Sauvegarde & Export', target: { kind: 'screen', tab: 'more', subTab: 'export' } },
  },
  {
    id: 'logout',
    phrases: ['deconnexion', 'deconnecter', 'se deconnecter', 'changer compte', 'quitter application'],
    answer: 'Le bouton « Déconnexion » se trouve en haut du menu « Plus ».',
    button: { label: 'Aller au menu Plus', target: { kind: 'screen', tab: 'more' } },
  },
  {
    id: 'offline',
    phrases: ['hors ligne', 'sans internet', 'pas internet', 'pas connexion', 'sans connexion', 'reseau', 'synchronisation', 'donnees perdues'],
    answer:
      'MoroCash marche sans internet : tes commandes sont gardées sur le téléphone et envoyées automatiquement dès que la connexion revient. Une bande en bas de l’écran indique ce qui attend d’être envoyé.',
  },
  {
    id: 'greeting',
    phrases: ['bonjour', 'bonsoir', 'salut', 'merci', 'aide', 'help'],
    answer: 'Je suis là pour t’aider. Dis-moi ce que tu veux faire, avec tes mots : par exemple « ajouter un produit » ou « voir qui me doit ».',
  },
];

// ── Correspondance ─────────────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    'a au aux avec ce ces cet cette comment de des du dans en est et il je j la le les leur leurs ma mais me mes moi mon ' +
    'ne nos notre on ou par pas pour qu que quel quelle quels quoi sa se ses si son sur ta te tes toi ton tu un une ' +
    'vos votre vous y ai as avoir faut veux voudrais veut peux peut puis sais savoir besoin aimerais souhaite svp stp ' +
    'plait bien comme ici alors donc l d s n c'
  ).split(' ')
);

// Formes courantes ramenées à un seul mot, pour que « crée », « créer » et
// « création » tombent au même endroit.
const SYNONYMS: Record<string, string> = {
  cree: 'creer', crees: 'creer', creez: 'creer', creation: 'creer', creer: 'creer',
  ajoute: 'ajouter', ajout: 'ajouter', rajouter: 'ajouter', rajoute: 'ajouter', mettre: 'ajouter',
  fais: 'faire', fait: 'faire', faites: 'faire',
  article: 'produit', articles: 'produit', marchandises: 'marchandise',
  vente: 'vente', ventes: 'vente', vendu: 'vendre', vends: 'vendre',
  employes: 'employe', employee: 'employe', employees: 'employe',
  facture: 'recu', factures: 'recu', ticket: 'recu', tickets: 'recu', recue: 'recu', recues: 'recu',
  dettes: 'dette', doit: 'doit', doivent: 'doit',
  wifi: 'internet', data: 'internet',
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Racine grossière : assez pour « télécharge » = « télécharger » = « téléchargement ». */
function stem(word: string): string {
  const canonical = SYNONYMS[word] ?? word;
  const noPlural = canonical.length > 3 ? canonical.replace(/[sx]$/, '') : canonical;
  return noPlural.length > 6 ? noPlural.slice(0, 6) : noPlural;
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem);
}

// Les formulations sont découpées une seule fois.
const INDEXED = HELP_INTENTS.map((intent) => ({
  intent,
  phrases: intent.phrases.map(tokens).filter((p) => p.length > 0),
}));

// Un mot présent dans beaucoup d'intentions (« produit », « commande ») pèse
// peu ; un mot rare (« cassé », « étiquette ») désigne presque à lui seul
// la bonne réponse.
const WEIGHT = new Map<string, number>();
for (const { phrases } of INDEXED) {
  for (const w of new Set(phrases.flat())) WEIGHT.set(w, (WEIGHT.get(w) ?? 0) + 1);
}
for (const [w, count] of WEIGHT) WEIGHT.set(w, 1 / count);

/**
 * Meilleure intention pour la question, ou null si rien ne correspond
 * vraiment : l'assistant dit alors qu'il ne sait pas, plutôt que de proposer
 * un écran au hasard.
 */
export function matchHelpIntent(question: string, opts: { servicesOnly?: boolean } = {}): HelpIntent | null {
  const words = new Set(tokens(question));
  if (words.size === 0) return null;

  let best: { intent: HelpIntent; score: number } | null = null;
  for (const { intent, phrases } of INDEXED) {
    if (opts.servicesOnly && intent.stockOnly) continue;
    for (const phrase of phrases) {
      // Toute la formulation doit être présente : « commande » seul ne suffit
      // pas à choisir entre créer, lister ou exporter des commandes.
      if (!phrase.every((w) => words.has(w))) continue;
      const score = phrase.reduce((sum, w) => sum + (WEIGHT.get(w) ?? 0), 0);
      if (!best || score > best.score) best = { intent, score };
    }
  }
  return best?.intent ?? null;
}
