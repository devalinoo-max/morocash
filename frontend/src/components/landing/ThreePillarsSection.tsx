import React from 'react';
import { DownloadCloud, MessageSquare, WifiOff } from 'lucide-react';
import { Reveal } from './Reveal';

const PILLARS = [
  {
    icon: WifiOff,
    accentClass: 'tint-emerald-10 border-emerald-500/20 accent-emerald',
    title: 'Le réseau coupe ? Tu continues à vendre.',
    text: 'Tes commandes s’enregistrent sur ton téléphone même sans internet grâce à la technologie PWA. Tout se synchronise dès que le réseau revient.',
  },
  {
    icon: MessageSquare,
    accentClass: 'tint-violet-10 border-violet-500/20 accent-violet',
    title: 'Si tu sais utiliser WhatsApp, tu sais utiliser MoroCash.',
    text: 'Pas de jargon comptable. On écrit « ce que tu as gagné », jamais « bénéfice net d’exploitation ».',
  },
  {
    icon: DownloadCloud,
    accentClass: 'tint-terre-10 border-amber-500/20 accent-terre',
    title: 'Tes données sont à toi. Même si tu arrêtes.',
    text: 'Exporte tout en Excel ou PDF quand tu veux. Si tu arrêtes de payer, tu gardes un accès en lecture seule à vie.',
  },
];

export const ThreePillarsSection: React.FC = () => {
  return (
    <section id="pourquoi" className="py-24 px-4 md:px-8 max-w-6xl mx-auto space-y-16">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Reveal variant="up">
          <span className="text-xs font-mono-data font-bold accent-emerald uppercase tracking-widest">Notre philosophie</span>
        </Reveal>
        <Reveal variant="up" delayMs={70}>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
            Fait pour ton commerce, pas pour un <span className="font-serif-em italic accent-emerald font-normal">bureau climatisé</span>.
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {PILLARS.map((pillar, i) => (
          <Reveal
            key={pillar.title}
            variant="up"
            delayMs={i * 70}
            className="theme-card border theme-border rounded-[2rem] p-8 hover:-translate-y-1 transition-transform duration-300 space-y-4"
          >
            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${pillar.accentClass}`}>
              <pillar.icon className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold theme-text">{pillar.title}</h3>
            <p className="theme-text-muted text-xs leading-relaxed">{pillar.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
};
