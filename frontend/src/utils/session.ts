/**
 * Indice local de session : permet de savoir, DES le premier rendu et sans
 * attendre la reponse de /auth/me, qu'une session existe tres probablement.
 *
 * A quoi ca sert : un commercant deja connecte qui ouvre morocash.com ne doit
 * jamais voir la page de presentation, pas meme une fraction de seconde. Or
 * la verification reelle de la session est un aller-retour reseau. Sans cet
 * indice, il faudrait soit afficher la landing puis la remplacer (le
 * clignotement interdit), soit faire attendre TOUS les visiteurs, y compris
 * ceux qui decouvrent le produit, devant un ecran vide.
 *
 * L'indice ne donne aucun acces : il ne fait que choisir l'ecran d'attente.
 * La verite reste le cookie de session verifie par le serveur, qui peut
 * toujours repondre "expiree" (on bascule alors sur l'ecran de code).
 */
const HAS_SESSION_KEY = 'morocash_has_session';
const LAST_PHONE_KEY = 'morocash_last_phone';

export function markSessionStarted(telephone?: string): void {
  try {
    localStorage.setItem(HAS_SESSION_KEY, '1');
    if (telephone) localStorage.setItem(LAST_PHONE_KEY, telephone);
  } catch {
    // Navigation privee / stockage refuse : on retombe simplement sur la landing.
  }
}

export function markSessionEnded(): void {
  try {
    localStorage.removeItem(HAS_SESSION_KEY);
  } catch {
    // Idem.
  }
}

export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(HAS_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Numero de la derniere connexion reussie : reaffiche pre-rempli quand la
 * session a expire, pour que le commercant n'ait plus qu'a taper son code.
 */
export function lastKnownPhone(): string {
  try {
    return localStorage.getItem(LAST_PHONE_KEY) ?? '';
  } catch {
    return '';
  }
}
