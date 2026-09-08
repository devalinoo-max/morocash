import React from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import { Reveal } from './Reveal';

interface FinalCtaSectionProps {
  onStartTrial: () => void;
}

export const FinalCtaSection: React.FC<FinalCtaSectionProps> = ({ onStartTrial }) => {
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-8 pb-28 pt-8">
      <Reveal
        variant="zoom"
        className="animated-gradient rounded-[2.5rem] text-white p-12 lg:p-16 text-center relative overflow-hidden shadow-2xl"
        style={{ backgroundImage: 'linear-gradient(120deg, #4F46E5, #7B61FF, #00E687, #7B61FF, #4F46E5)' }}
      >
        <div className="absolute -inset-4 bg-white/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto space-y-6">
          <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
            Ce soir, sais-tu ce que tu as <span className="font-serif-em italic font-normal">gagné aujourd&apos;hui</span> ?
          </h2>
          <p className="text-sm md:text-base text-white/85 leading-relaxed max-w-lg mx-auto">
            Essaie MoroCash gratuitement pendant 14 jours. Sans engagement, sans carte bancaire exigée.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onStartTrial}
              className="inline-block bg-white text-[#1C1917] font-extrabold text-base py-5 px-12 rounded-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            >
              Essayer gratuitement
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/75 pt-2">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Prêt en 3 minutes
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Sans carte bancaire
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  );
};
