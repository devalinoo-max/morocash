import { useCallback, useEffect, useState } from 'react';

export type LandingTheme = 'dark' | 'light';

const STORAGE_KEY = 'morocash-theme';

/**
 * Preference de theme du visiteur.
 *
 * Trois regles, dans cet ordre :
 *   1. le choix explicite deja fait, s'il en existe un ;
 *   2. sinon la preference du systeme (prefers-color-scheme) — au tout premier
 *      passage, on ne decide pas a la place du visiteur ;
 *   3. sombre en dernier recours (identite de la page).
 */
function readStoredTheme(): LandingTheme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function systemTheme(): LandingTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function resolveInitialTheme(): LandingTheme {
  if (typeof window === 'undefined') return 'dark';
  return readStoredTheme() ?? systemTheme();
}

/**
 * Le choix est pose sur <html data-theme> et non sur le seul conteneur de la
 * page publique : c'est ainsi une preference de compte, lisible par n'importe
 * quel ecran de l'app. Un commercant qui choisit le clair ici le retrouve
 * ailleurs, sans avoir a le redire.
 *
 * Les styles de la page publique restent, eux, scopes a .morocash-landing :
 * poser l'attribut ne repeint rien d'autre par accident.
 */
function applyTheme(theme: LandingTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  // Indique au navigateur comment peindre les elements natifs (barres de
  // defilement, champs de saisie) : sans ca, un formulaire reste clair sur
  // une page sombre.
  document.documentElement.style.colorScheme = theme;
}

export function useLandingTheme() {
  const [theme, setTheme] = useState<LandingTheme>(resolveInitialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible (navigation privée, quota) : le thème reste
      // simplement non persisté pour cette session.
    }
  }, [theme]);

  // Tant que le visiteur n'a rien choisi, on suit le systeme s'il change en
  // cours de route (bascule automatique jour/nuit du telephone).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (readStoredTheme() !== null) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => setTheme(e.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}

/**
 * Pose le thème retenu dès le démarrage de l'app, avant tout rendu.
 *
 * Sans ça, la préférence ne s'appliquerait qu'en passant par la page
 * publique : un commerçant qui ouvre directement son tableau de bord
 * repartirait du thème par défaut à chaque visite.
 */
export function applyStoredTheme() {
  applyTheme(resolveInitialTheme());
}
