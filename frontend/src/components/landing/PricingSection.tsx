import React, { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { Reveal } from './Reveal';

interface PricingSectionProps {
  onSelectPlan: (plan: 'solo' | 'business') => void;
}

const PRICES = {
  solo: { monthly: '15 000', yearly: '150 000' },
  business: { monthly: '20 000', yearly: '200 000' },
};

export const PricingSection: React.FC<PricingSectionProps> = ({ onSelectPlan }) => {
  const [isYearly, setIsYearly] = useState(false);
  const period = isYearly ? '/ an' : '/ mois';

  return (
    <section id="tarifs" className="py-24 px-4 md:px-8 max-w-6xl mx-auto space-y-16">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Reveal variant="up">
          <span className="text-xs font-mono-data font-bold accent-emerald uppercase tracking-widest">Investissement rentable</span>
        </Reveal>
        <Reveal variant="up" delayMs={70}>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
            Un tarif transparent en <span className="font-serif-em italic accent-emerald font-normal">Francs CFA</span>.
          </h2>
        </Reveal>

        <Reveal variant="up" delayMs={140} className={`inline-flex items-center gap-3 pt-2 ${isYearly ? 'billing-yearly' : ''}`}>
          <span className={`text-xs font-bold ${isYearly ? 'theme-text-muted' : 'theme-text'}`}>Mensuel</span>
          <button
            type="button"
            onClick={() => setIsYearly((prev) => !prev)}
            className="w-12 h-6 rounded-full relative theme-border border cursor-pointer"
            style={{ background: 'var(--border)' }}
          >
            <span className="billing-knob absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-accent-violet" />
          </button>
          <span className={`text-xs font-bold ${isYearly ? 'theme-text' : 'theme-text-muted'}`}>
            Annuel <span className="accent-emerald">(2 mois offerts)</span>
          </span>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
        <Reveal
          variant="zoom"
          className="theme-card border theme-border rounded-[2rem] p-8 flex flex-col justify-between hover-border-violet-30 transition-colors duration-300"
        >
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold theme-text">Formule Solo</h3>
              <p className="theme-text-muted text-xs">Pour les entrepreneurs qui vendent seuls.</p>
            </div>
            <div className="flex items-baseline gap-1 font-mono-data">
              <span className="text-4xl font-extrabold theme-text">{isYearly ? PRICES.solo.yearly : PRICES.solo.monthly}</span>
              <span className="accent-emerald font-bold text-lg">FCFA</span>
              <span className="theme-text-muted text-xs ml-1">{period}</span>
            </div>
            <div className="h-px" style={{ background: 'var(--border)' }} />
            <ul className="space-y-3 text-xs theme-text-muted">
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                <span className="theme-text font-semibold">1 compte administrateur</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                Historique de ventes illimité
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                Gestion complète des stocks &amp; alertes
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                Suivi des dettes et relances WhatsApp
              </li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onSelectPlan('solo')}
            className="mt-8 block w-full border theme-border theme-card-hover theme-text font-extrabold text-sm py-4 rounded-xl text-center transition-colors cursor-pointer"
          >
            Choisir Solo
          </button>
          {/* La durée ne vit plus dans le bouton : elle est ici, sous lui. */}
          <p className="mt-3 text-center text-[11px] theme-text-muted">
            ✓ 14 jours · sans carte bancaire · sans engagement
          </p>
        </Reveal>

        <Reveal
          variant="zoom"
          delayMs={70}
          className="theme-card border-2 border-accent-emerald rounded-[2rem] p-8 flex flex-col justify-between relative"
          style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--emerald) 6%, transparent), transparent 60%)' }}
        >
          <div className="absolute top-4 right-4 tint-emerald-10 accent-emerald font-mono-data text-[9px] font-extrabold px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-wider">
            Équipe &amp; Vendeurs
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold theme-text">Formule Business</h3>
              <p className="theme-text-muted text-xs">Pour les boutiques avec vendeurs et personnel.</p>
            </div>
            <div className="flex items-baseline gap-1 font-mono-data">
              <span className="text-4xl font-extrabold theme-text">{isYearly ? PRICES.business.yearly : PRICES.business.monthly}</span>
              <span className="accent-emerald font-bold text-lg">FCFA</span>
              <span className="theme-text-muted text-xs ml-1">{period}</span>
            </div>
            <div className="h-px" style={{ background: 'var(--border)' }} />
            <ul className="space-y-3 text-xs theme-text-muted">
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                <span className="theme-text font-semibold">Jusqu&apos;à 5 vendeurs</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                <span className="theme-text font-semibold">Bénéfices masqués aux vendeurs</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                Suivi et comparaison de performances
              </li>
              <li className="flex items-center gap-2.5">
                <Check className="accent-emerald w-4 h-4" />
                Export complet Excel &amp; PDF en 1 clic
              </li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onSelectPlan('business')}
            className="mt-8 block w-full bg-accent-emerald text-[#06110B] font-extrabold text-sm py-4 rounded-xl text-center transition-transform hover:scale-[1.02] cursor-pointer"
          >
            Choisir Business
          </button>
          {/* La durée ne vit plus dans le bouton : elle est ici, sous lui. */}
          <p className="mt-3 text-center text-[11px] theme-text-muted">
            ✓ 14 jours · sans carte bancaire · sans engagement
          </p>
        </Reveal>
      </div>

      <Reveal variant="up">
        <p className="text-center text-xs theme-text-muted max-w-lg mx-auto leading-relaxed">
          <Lock className="w-3.5 h-3.5 inline accent-emerald -mt-0.5 mr-1" />
          Si l&apos;abonnement expire, tes données passent en lecture seule. Tu ne perds jamais ton historique.
        </p>
      </Reveal>
    </section>
  );
};
