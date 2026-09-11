import React, { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '../common/Logo';
import { ThemeToggle } from './ThemeToggle';
import type { LandingTheme } from './useLandingTheme';

interface LandingHeaderProps {
  theme: LandingTheme;
  onToggleTheme: () => void;
  onLogin: () => void;
  onStartTrial: () => void;
  isAuthenticated?: boolean;
  onOpenDashboard?: () => void;
}

const NAV_LINKS = [
  { id: 'solutions', label: 'Pour qui ?' },
  { id: 'pourquoi', label: 'Pourquoi ?' },
  { id: 'comment-ca-marche', label: 'Comment ça marche ?' },
  { id: 'comparatif', label: 'Comparatif' },
  { id: 'tarifs', label: 'Tarifs' },
];

// Navbar flottante ("l'île flottante") : reste ancrée en haut, jamais liée
// au scroll (pas de shrink/hide-on-scroll) pour une identité stable pendant
// toute la traversée des 12 sections.
export const LandingHeader: React.FC<LandingHeaderProps> = ({
  theme,
  onToggleTheme,
  onLogin,
  onStartTrial,
  isAuthenticated = false,
  onOpenDashboard,
}) => {
  const [panneauOuvert, setPanneauOuvert] = useState(false);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Échap referme le panneau, et le fond ne défile pas derrière lui.
  useEffect(() => {
    if (!panneauOuvert) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanneauOuvert(false);
    };
    const defilement = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = defilement;
      window.removeEventListener('keydown', onKey);
    };
  }, [panneauOuvert]);

  const allerVers = (id: string) => {
    setPanneauOuvert(false);
    scrollTo(id);
  };

  const depuisPanneau = (action?: () => void) => () => {
    setPanneauOuvert(false);
    action?.();
  };

  return (
    <header className="fixed top-5 left-0 right-0 z-50 px-4 md:px-8">
      <nav className="max-w-6xl mx-auto theme-badge backdrop-blur-xl border theme-border rounded-full py-3 px-5 flex items-center justify-between shadow-2xl shadow-black/10">
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2 group shrink-0 cursor-pointer"
        >
          <Logo size={30} onDark={theme === 'dark'} className="transition-transform group-hover:scale-105" />
        </button>

        <div className="hidden lg:flex items-center gap-6 text-xs font-semibold theme-text-muted">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollTo(link.id)}
              className="hover:text-[var(--emerald)] transition-colors cursor-pointer"
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* Partie droite — grand écran */}
        <div className="hidden lg:flex items-center gap-4">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          {isAuthenticated ? (
            <button type="button" onClick={onOpenDashboard} className="menu-cta">
              Ouvrir mon tableau de bord →
            </button>
          ) : (
            <>
              <button type="button" onClick={onLogin} className="menu-link">
                Se connecter
              </button>
              <button type="button" onClick={onStartTrial} className="menu-cta">
                Essayer gratuitement
              </button>
            </>
          )}
        </div>

        {/* Partie droite — petit écran : la pastille reste toujours dans la
            barre, l'essai est réduit, le reste passe dans le panneau. */}
        <div className="flex lg:hidden items-center gap-2.5">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          {isAuthenticated ? (
            <button type="button" onClick={onOpenDashboard} className="menu-cta menu-cta-compact">
              Tableau de bord →
            </button>
          ) : (
            <button type="button" onClick={onStartTrial} className="menu-cta menu-cta-compact">
              Essayer gratuitement
            </button>
          )}
          <button
            type="button"
            onClick={() => setPanneauOuvert(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={panneauOuvert}
            className="theme-text p-1 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {panneauOuvert && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setPanneauOuvert(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm cursor-default"
          />
          <div className="absolute top-0 right-0 h-full w-[82%] max-w-xs theme-card border-l theme-border p-6 flex flex-col gap-1 overflow-y-auto">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setPanneauOuvert(false)}
                aria-label="Fermer le menu"
                className="theme-text p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                type="button"
                onClick={() => allerVers(link.id)}
                className="text-left theme-text font-semibold text-[15px] py-3 cursor-pointer hover:text-[var(--emerald)] transition-colors"
              >
                {link.label}
              </button>
            ))}

            {!isAuthenticated && (
              <>
                <div className="border-t theme-border my-3" />
                <button
                  type="button"
                  onClick={depuisPanneau(onLogin)}
                  className="menu-link text-left py-3"
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  onClick={depuisPanneau(onStartTrial)}
                  className="menu-cta menu-cta-block mt-2"
                >
                  Essayer gratuitement
                </button>
              </>
            )}
            {isAuthenticated && (
              <>
                <div className="border-t theme-border my-3" />
                <button
                  type="button"
                  onClick={depuisPanneau(onOpenDashboard)}
                  className="menu-cta menu-cta-block"
                >
                  Ouvrir mon tableau de bord →
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
