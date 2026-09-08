import React from 'react';
import { Moon, Sun, LayoutDashboard } from 'lucide-react';
import { Logo } from '../common/Logo';
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
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Changer de thème"
            className="w-11 h-6 rounded-full border theme-border relative shrink-0 cursor-pointer theme-bg"
          >
            <span className="absolute inset-0 flex items-center px-1">
              <span className="theme-knob w-4 h-4 rounded-full bg-gradient-to-tr from-accent-emerald to-accent-violet flex items-center justify-center relative">
                <Moon className="theme-icon-dark w-2.5 h-2.5 text-[#06110B] absolute" />
                <Sun className="theme-icon-light w-2.5 h-2.5 text-[#06110B] absolute" />
              </span>
            </span>
          </button>
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onOpenDashboard}
              className="bg-accent-violet hover:opacity-90 text-white font-bold text-xs py-2.5 px-4 md:px-5 rounded-full transition-all shadow-md shadow-violet-500/20 hover:scale-105 active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Mon dashboard</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onLogin}
                className="theme-text-muted hover:text-[var(--emerald)] font-semibold text-xs px-2 transition-colors cursor-pointer hidden sm:inline-block"
              >
                Se connecter
              </button>
              <button
                type="button"
                onClick={onStartTrial}
                className="bg-accent-violet hover:opacity-90 text-white font-bold text-xs py-2.5 px-4 md:px-5 rounded-full transition-all shadow-md shadow-violet-500/20 hover:scale-105 active:scale-95 cursor-pointer inline-flex items-center gap-1.5"
              >
                <span className="hidden sm:inline">Essayer 14 jours</span>
                <span className="sm:hidden">Essayer</span>
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
};
