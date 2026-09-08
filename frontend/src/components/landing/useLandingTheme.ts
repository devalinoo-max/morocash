import { useEffect, useState } from 'react';

export type LandingTheme = 'dark' | 'light';

const STORAGE_KEY = 'morocash-theme';

// Sombre par défaut ("Midnight Obsidian"), clair disponible via le switch
// du header — persisté localement, scopé au conteneur .morocash-landing
// (jamais sur <html>) pour ne jamais affecter le reste de l'app.
export function useLandingTheme() {
  const [theme, setTheme] = useState<LandingTheme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible (navigation privée, quota) : le thème reste
      // simplement non persisté pour cette session.
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));

  return { theme, toggleTheme };
}
