import React from 'react';
import { Logo } from '../common/Logo';
import type { LandingTheme } from './useLandingTheme';

interface LandingFooterProps {
  theme: LandingTheme;
}

const PRODUCT_LINKS = [
  { id: 'solutions', label: 'Pour qui ?' },
  { id: 'comment-ca-marche', label: 'Fonctionnement' },
  { id: 'tarifs', label: 'Tarifs' },
];

export const LandingFooter: React.FC<LandingFooterProps> = ({ theme }) => {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <footer className="border-t theme-border py-14 px-4 md:px-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 text-xs">
        <div className="md:col-span-5 space-y-3">
          <Logo size={28} onDark={theme === 'dark'} />
          <p className="theme-text-muted leading-relaxed max-w-xs">
            Conçu pour les commerçants d&apos;Afrique de l&apos;Ouest. Suivi de caisse, stocks, clients et relances intelligentes.
          </p>
        </div>
        <div className="md:col-span-3 space-y-3">
          <p className="theme-text font-bold text-[11px] uppercase tracking-wider">Produit</p>
          <ul className="space-y-2 theme-text-muted">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.id}>
                <button
                  type="button"
                  onClick={() => scrollTo(link.id)}
                  className="hover:text-[var(--emerald)] transition-colors cursor-pointer"
                >
                  {link.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-4 flex md:justify-end items-start">
          <div className="theme-badge border theme-border py-1.5 px-4 rounded-full flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald animate-pulse" />
            <span className="font-mono-data text-[9px] theme-text-muted">Système MoroCash Opérationnel</span>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto h-px my-8" style={{ background: 'var(--border)' }} />
      <p className="max-w-6xl mx-auto text-[10px] theme-text-muted text-center md:text-left">
        © 2026 MoroCash Technologies. Tous droits réservés.
      </p>
    </footer>
  );
};
