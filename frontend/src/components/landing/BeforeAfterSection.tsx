import React from 'react';
import { BookX, Check, Sparkles, X } from 'lucide-react';
import { Reveal } from './Reveal';

const CAHIER_POINTS = [
  'Tu comptes ta caisse le soir sans savoir si le compte est juste.',
  'Tu découvres une rupture quand le client est déjà devant toi.',
  'Tu oublies des crédits, parfois pendant des mois.',
  'Tu confonds ce que tu vends et ce que tu gagnes.',
  'Tu ne sais pas quel produit te rapporte vraiment.',
  'Ton vendeur note sur un bout de papier, ou pas du tout.',
  "Un cahier perdu, et tout l'historique disparaît.",
];

const MOROCASH_POINTS = [
  'Tu sais au franc près ce que tu dois avoir en caisse.',
  "Tu es prévenu avant la rupture, pas après.",
  'Chaque crédit est noté, avec son ancienneté et un rappel WhatsApp.',
  'Un seul chiffre chaque soir : ce que tu as réellement gagné.',
  'Tu vois quel produit te fait gagner, et lequel te fait travailler.',
  'Ton vendeur enregistre, sans jamais voir tes bénéfices.',
  "Ton historique est en sécurité, et il t'appartient à vie.",
];

export const BeforeAfterSection: React.FC = () => {
  return (
    <section className="py-24 px-4 md:px-8 theme-badge border-y theme-border overflow-hidden">
      <div className="max-w-6xl mx-auto space-y-16">
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <Reveal variant="up">
            <span className="text-xs font-mono-data font-bold accent-emerald uppercase tracking-widest">La révolution</span>
          </Reveal>
          <Reveal variant="up" delayMs={70}>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
              Le même commerce. <span className="font-serif-em italic accent-emerald font-normal">Deux façons</span> de le tenir.
            </h2>
          </Reveal>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          <Reveal variant="left" className="theme-card border theme-border rounded-[2rem] p-8 lg:p-10 space-y-6">
            <h3 className="text-xl font-bold text-red-500 flex items-center gap-2">
              <BookX className="w-5 h-5" /> AVEC TON CAHIER
            </h3>
            <div className="space-y-4 text-sm">
              {CAHIER_POINTS.map((point) => (
                <div key={point} className="flex gap-3 items-start opacity-80">
                  <X className="text-red-500 w-5 h-5 mt-0.5 shrink-0" />
                  <p className="theme-text">{point}</p>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal
            variant="right"
            delayMs={140}
            className="theme-card border-2 border-accent-emerald rounded-[2rem] p-8 lg:p-10 space-y-6"
            style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--emerald) 6%, transparent), transparent 60%)' }}
          >
            <h3 className="text-xl font-bold accent-emerald flex items-center gap-2">
              <Sparkles className="w-5 h-5" /> AVEC MOROCASH
            </h3>
            <div className="space-y-4 text-sm">
              {MOROCASH_POINTS.map((point) => (
                <div key={point} className="flex gap-3 items-start">
                  <Check className="accent-emerald w-5 h-5 mt-0.5 shrink-0 tint-emerald-10 rounded-full p-0.5" />
                  <p className="theme-text font-semibold">{point}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};
