import React, { useState } from 'react';
import { CheckCircle, Package, PieChart, PlayCircle, ShieldCheck, ShoppingCart, Users, WifiOff, Zap } from 'lucide-react';
import { Reveal } from './Reveal';
import { CountUp } from './CountUp';

interface HeroSectionProps {
  onScrollToPricing: () => void;
  onScrollToHowItWorks: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onScrollToPricing, onScrollToHowItWorks }) => {
  const [counterTriggered, setCounterTriggered] = useState(false);

  return (
    <section className="relative min-h-screen pt-40 pb-20 px-4 md:px-8 flex items-center">
      <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-14 items-center">
        <div className="lg:col-span-7 flex flex-col space-y-6">
          <Reveal variant="up" className="inline-flex items-center gap-2 theme-badge border theme-border py-1.5 px-4 rounded-full w-fit">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald" />
            </span>
            <span className="text-[10px] font-mono-data theme-text font-bold uppercase tracking-wider">
              14 jours gratuits · sans carte bancaire
            </span>
          </Reveal>

          <Reveal variant="blur" delayMs={70}>
            <h1 className="text-4xl md:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight theme-text leading-[1.08]">
              Tu vends tous les jours.
              <br />
              Mais est-ce que tu <span className="font-serif-em italic accent-emerald font-normal">gagnes</span> ?
            </h1>
          </Reveal>

          <Reveal variant="up" delayMs={140}>
            <p className="text-base md:text-lg theme-text-muted leading-relaxed max-w-xl">
              MoroCash te dit chaque soir ce que tu as vraiment gagné, ce qui te reste en stock, et qui te doit de
              l&apos;argent. En 10 secondes par vente.
            </p>
          </Reveal>

          <Reveal variant="up" delayMs={210} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
            <button
              type="button"
              onClick={onScrollToPricing}
              className="bg-accent-violet hover:opacity-90 text-white font-extrabold text-sm py-4 px-8 rounded-2xl text-center shadow-lg shadow-violet-500/20 hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              Essayer gratuitement
            </button>
            <button
              type="button"
              onClick={onScrollToHowItWorks}
              className="border theme-border theme-card-hover theme-text font-bold text-sm py-4 px-8 rounded-2xl text-center transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" /> Voir comment ça marche
            </button>
          </Reveal>

          <Reveal variant="up" delayMs={280} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs theme-text-muted pt-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 accent-emerald" />
              Pas de carte bancaire
            </span>
            <span className="flex items-center gap-1.5">
              <WifiOff className="w-4 h-4 accent-emerald" />
              Marche sans réseau
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 accent-emerald" />
              Prêt en 3 minutes
            </span>
          </Reveal>
        </div>

        <Reveal
          variant="zoom"
          delayMs={200}
          onReveal={() => setCounterTriggered(true)}
          className="lg:col-span-5 flex justify-center items-center relative"
        >
          <div className="absolute -inset-6 tint-violet-10 rounded-full blur-3xl pointer-events-none" />

          <div className="floating-phone w-[280px] h-[580px] theme-card border-[6px] theme-border rounded-[2.6rem] shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-4 rounded-b-xl z-20" style={{ background: 'var(--border)' }} />

            <div className="w-full h-full flex flex-col pt-6 text-xs theme-text-muted">
              <div className="p-4 border-b theme-border flex justify-between items-center">
                <div>
                  <p className="text-[9px] uppercase font-mono-data font-bold tracking-wider accent-emerald">Bénéfice du jour</p>
                  <h4 className="text-lg font-extrabold theme-text font-mono-data">
                    <CountUp target={21350} duration={1250} suffix=" F CFA" trigger={counterTriggered} />
                  </h4>
                </div>
                <span className="tint-emerald-10 accent-emerald font-mono-data text-[8px] font-bold px-2 py-1 rounded-full flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald animate-pulse" /> Connecté
                </span>
              </div>

              <div className="px-4 pt-4 flex items-end gap-1.5 h-16">
                <div className="flex-1 rounded-t" style={{ height: '35%', backgroundColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }} />
                <div className="flex-1 rounded-t" style={{ height: '55%', backgroundColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }} />
                <div className="flex-1 rounded-t" style={{ height: '40%', backgroundColor: 'color-mix(in srgb, var(--emerald) 70%, transparent)' }} />
                <div className="flex-1 rounded-t" style={{ height: '70%', backgroundColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }} />
                <div className="flex-1 rounded-t bg-accent-emerald" style={{ height: '95%' }} />
                <div className="flex-1 rounded-t" style={{ height: '50%', backgroundColor: 'color-mix(in srgb, var(--violet) 30%, transparent)' }} />
              </div>

              <div className="p-4 flex-1 flex flex-col gap-2.5 justify-end">
                <p className="font-bold theme-text text-[11px]">Dernières ventes</p>
                <div className="theme-badge border theme-border p-2.5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded tint-emerald-10 flex items-center justify-center accent-emerald font-bold text-[10px]">3x</div>
                    <p className="font-bold theme-text text-[10px]">Mèches Synthétiques</p>
                  </div>
                  <span className="font-mono-data theme-text font-bold text-[10px]">6 000 F</span>
                </div>
                <div className="theme-badge border theme-border p-2.5 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded tint-violet-10 flex items-center justify-center accent-violet font-bold text-[10px]">1x</div>
                    <p className="font-bold theme-text text-[10px]">Crème de Soin</p>
                  </div>
                  <span className="font-mono-data theme-text font-bold text-[10px]">4 500 F</span>
                </div>
                <div className="bg-accent-emerald text-[#06110B] p-2.5 rounded-xl text-center font-extrabold flex items-center justify-center gap-1.5 mt-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Vente enregistrée
                </div>
              </div>

              <div className="p-2 border-t theme-border flex justify-around text-[8px] theme-text-muted font-bold">
                <span className="flex flex-col items-center gap-0.5 accent-emerald">
                  <ShoppingCart className="w-3 h-3" />
                  Vendre
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <Package className="w-3 h-3" />
                  Stock
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <Users className="w-3 h-3" />
                  Clients
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <PieChart className="w-3 h-3" />
                  Rapports
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
