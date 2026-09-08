import React, { useState } from 'react';
import { Eye, EyeOff, MessageCircle, Scissors, Users } from 'lucide-react';
import { Reveal } from './Reveal';

export const BentoPersonasSection: React.FC = () => {
  const [extracted, setExtracted] = useState(false);

  return (
    <section id="solutions" className="py-24 px-4 md:px-8 max-w-6xl mx-auto space-y-16">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Reveal variant="up">
          <span className="text-xs font-mono-data font-bold accent-emerald uppercase tracking-widest">Pour qui ?</span>
        </Reveal>
        <Reveal variant="up" delayMs={70}>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
            MoroCash s&apos;adapte à <span className="font-serif-em italic accent-emerald font-normal">ton métier</span>.
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Persona 1 : La vendeuse WhatsApp (interactif) */}
        <Reveal variant="left" className="md:col-span-7 theme-card border theme-border rounded-[2rem] p-8 flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="w-11 h-11 rounded-2xl tint-emerald-10 border border-emerald-500/20 flex items-center justify-center accent-emerald mb-4">
                <MessageCircle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold theme-text">La vendeuse WhatsApp</h3>
              <p className="theme-text-muted text-xs leading-relaxed max-w-xs mt-1">
                Awa prend ses commandes toute la journée sur WhatsApp. Un clic transforme le message en reçu propre.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setExtracted((prev) => !prev)}
              className="shrink-0 bg-accent-emerald text-[#06110B] text-[11px] font-extrabold px-3.5 py-2 rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
            >
              {extracted ? 'Revenir au message' : 'Transformer en reçu'}
            </button>
          </div>

          <div className="relative min-h-[150px]">
            <div className={`raw-message theme-badge border theme-border rounded-2xl rounded-tl-sm p-4 text-xs theme-text max-w-sm ${extracted ? 'hidden-msg' : ''}`}>
              <p className="font-semibold">
                Awa T. <span className="theme-text-muted font-normal">· 21:14</span>
              </p>
              <p className="mt-1 theme-text-muted">« Bjr Awa, tu me mets 2 mèches et 1 crème svp, je passe demain »</p>
            </div>
            <div className={`receipt-panel theme-badge border border-emerald-tint-30 rounded-2xl p-4 text-xs ${extracted ? 'shown' : ''}`}>
              <p className="font-mono-data font-bold accent-emerald uppercase tracking-wider text-[10px] mb-2">Reçu MoroCash · #0231</p>
              <div className="flex justify-between theme-text py-1">
                <span>2x Mèches Synthétiques</span>
                <span className="font-mono-data">12 000 F</span>
              </div>
              <div className="flex justify-between theme-text py-1">
                <span>1x Crème de Soin</span>
                <span className="font-mono-data">4 500 F</span>
              </div>
              <div className="flex justify-between font-bold theme-text pt-2 mt-2 border-t theme-border">
                <span>Total</span>
                <span className="font-mono-data accent-emerald">16 500 F</span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Persona 2 : Le boutiquier */}
        <Reveal variant="right" delayMs={70} className="md:col-span-5 theme-card border theme-border rounded-[2rem] p-8 flex flex-col gap-6">
          <div className="w-11 h-11 rounded-2xl tint-violet-10 border border-violet-500/20 flex items-center justify-center accent-violet">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold theme-text">Le boutiquier</h3>
            <p className="theme-text-muted text-xs leading-relaxed mt-1">
              Il gère une équipe de vendeurs. Ils encaissent, mais ne voient jamais les marges.
            </p>
          </div>
          <div className="theme-badge border theme-border rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="theme-text font-semibold">Vente de Kouadio</span>
              <span className="font-mono-data theme-text">12 500 F</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="theme-text-muted flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5" />
                Marge réelle
              </span>
              <span className="font-mono-data theme-text-muted">•••• masquée</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t theme-border">
              <span className="accent-emerald font-semibold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                Toi, le patron
              </span>
              <span className="font-mono-data accent-emerald font-bold">+3 200 F</span>
            </div>
          </div>
        </Reveal>

        {/* Persona 3 : Le prestataire */}
        <Reveal variant="up" delayMs={140} className="md:col-span-12 theme-card border theme-border rounded-[2rem] p-8 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="w-11 h-11 rounded-2xl tint-terre-10 border border-amber-500/20 flex items-center justify-center accent-terre mb-4">
              <Scissors className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold theme-text">Le prestataire</h3>
            <p className="theme-text-muted text-xs leading-relaxed mt-1 max-w-sm">
              Coiffure, couture, réparation : pas de stock à gérer, juste des prestations encaissées en 10 secondes.
            </p>
          </div>
          <div className="theme-badge border theme-border rounded-2xl p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="theme-text font-semibold">Coupe Homme</span>
              <span className="font-mono-data accent-emerald">3 000 F</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="theme-text font-semibold">Tresses Awalé</span>
              <span className="font-mono-data accent-emerald">8 000 F</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="theme-text font-semibold">Retouche express</span>
              <span className="font-mono-data accent-emerald">1 500 F</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
