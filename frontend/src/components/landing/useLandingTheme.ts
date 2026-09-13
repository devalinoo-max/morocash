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
 * La pastille ne concerne QUE le site public.
 *
 * L'attribut est pose sur <html> parce que les elements natifs de la page —
 * barre de defilement, champs de saisie — ne savent pas lire une classe posee
 * plus bas ; sans lui, un formulaire reste clair sur une page sombre. Il est
 * retire des qu'on quitte la page publique (voir le nettoyage ci-dessous),
 * pour ne rien laisser trainer sur les ecrans de l'app.
 *
 * Le tableau de bord n'a pas de mode sombre et n'en aura pas tant que personne
 * ne l'aura demande : il est fait pour etre lu en plein jour, dans une
 * boutique. Faire croire le contraire par un interrupteur serait une promesse
 * que l'app ne tient pas.
 */
function applyTheme(theme: LandingTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

function clearTheme() {
  if (typeof document === 'undefined') return;
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
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

  // Quitter la page publique remet le document a neutre. Le choix reste
  // memorise pour la prochaine visite ; il ne suit simplement pas le visiteur
  // dans l'app.
  useEffect(() => clearTheme, []);

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
