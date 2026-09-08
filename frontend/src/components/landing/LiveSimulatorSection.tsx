import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Reveal } from './Reveal';
import { CountUp } from './CountUp';

const STEPS = [
  {
    id: 1,
    title: 'Tu enregistres ta vente',
    text: (
      <>
        Tu touches le produit, tu indiques combien le client t&apos;a donné. Tu peux même scanner le code-barres.{' '}
        <span className="font-mono-data accent-emerald font-semibold">10s</span>
      </>
    ),
  },
  {
    id: 2,
    title: 'Tout se met à jour',
    text: 'Le stock baisse, le client est créé, sa dette est notée, le reçu part sur WhatsApp.',
  },
  {
    id: 3,
    title: 'Tu vois ce que tu as gagné',
    text: "Chaque soir, un seul chiffre : ce qu'il te reste vraiment en poche, une fois le coût d'achat et les frais retirés.",
  },
];

// Widget interactif à 3 étapes : chaque déclenchement ponctuel (remplissage
// des barres de stock à l'étape 2, compteur de bénéfice à l'étape 3) ne se
// joue qu'une seule fois par visite, même si on navigue entre les onglets.
export const LiveSimulatorSection: React.FC = () => {
  const [activeStep, setActiveStep] = useState(1);
  const [stockFilled, setStockFilled] = useState(false);
  const [step3Triggered, setStep3Triggered] = useState(false);

  const handleStep = (step: number) => {
    setActiveStep(step);
    if (step === 2) setStockFilled(true);
    if (step === 3) setStep3Triggered(true);
  };

  return (
    <section id="comment-ca-marche" className="py-24 px-4 md:px-8 max-w-6xl mx-auto space-y-16">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Reveal variant="up">
          <span className="text-xs font-mono-data font-bold accent-violet uppercase tracking-widest">Fonctionnement</span>
        </Reveal>
        <Reveal variant="up" delayMs={70}>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight theme-text">
            Trois étapes, et <span className="font-serif-em italic accent-violet font-normal">tu sais tout</span>.
          </h2>
        </Reveal>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6 space-y-4">
          {STEPS.map((step, i) => {
            const isActive = activeStep === step.id;
            return (
              <Reveal key={step.id} variant="up" delayMs={i * 70}>
                <button
                  type="button"
                  onClick={() => handleStep(step.id)}
                  className={`w-full text-left p-6 rounded-[1.5rem] border theme-border theme-card theme-card-hover transition-all duration-300 cursor-pointer ${
                    isActive ? '' : 'opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`w-8 h-8 rounded-full font-mono-data font-bold flex items-center justify-center text-xs shrink-0 transition-colors duration-300 ${
                        isActive ? (step.id === 3 ? 'bg-accent-emerald text-[#06110B]' : 'bg-accent-violet text-white') : ''
                      }`}
                      style={isActive ? undefined : { background: 'var(--border)', color: 'var(--text-muted)' }}
                    >
                      {step.id}
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-bold text-base theme-text">{step.title}</h3>
                      <p className="theme-text-muted text-xs leading-relaxed">{step.text}</p>
                    </div>
                  </div>
                </button>
              </Reveal>
            );
          })}
        </div>

        <Reveal variant="zoom" delayMs={210} className="lg:col-span-6 flex justify-center">
          <div className="w-[320px] h-[380px] theme-card border-2 theme-border rounded-[2rem] p-6 relative overflow-hidden shadow-xl">
            {activeStep === 1 && (
              <div className="h-full flex flex-col justify-between">
                <div className="space-y-2">
                  <p className="text-[10px] font-mono-data accent-violet font-bold uppercase tracking-wider">Panier en cours</p>
                  <div className="space-y-2 pt-2">
                    <div className="theme-badge border theme-border p-2.5 rounded-xl flex justify-between items-center text-xs">
                      <span className="theme-text">3x Mèches Synthétiques</span>
                      <span className="font-mono-data accent-emerald font-semibold">6 000 F</span>
                    </div>
                    <div className="theme-badge border theme-border p-2.5 rounded-xl flex justify-between items-center text-xs">
                      <span className="theme-text">1x Crème de Soin</span>
                      <span className="font-mono-data accent-emerald font-semibold">4 500 F</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="pt-4 border-t theme-border flex justify-between items-center">
                    <span className="text-xs theme-text-muted font-bold">Total :</span>
                    <span className="font-mono-data font-bold text-base accent-emerald">10 500 F</span>
                  </div>
                  <div className="bg-accent-violet text-white p-2.5 rounded-xl text-center font-extrabold text-xs">Encaisser</div>
                </div>
              </div>
            )}

            {activeStep === 2 && (
              <div className="h-full flex flex-col justify-between">
                <div className="space-y-3">
                  <p className="text-[10px] font-mono-data accent-violet font-bold uppercase tracking-wider">Mises à jour instantanées</p>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="theme-text">Mèches Synthétiques</span>
                      <span className="font-mono-data theme-text-muted">14 restants</span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden theme-badge">
                      <div
                        className={`stock-bar-fill h-full rounded-full bg-accent-violet ${stockFilled ? 'filled' : ''}`}
                        style={{ width: '70%' }}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="theme-text">Crème de Soin</span>
                      <span className="font-mono-data theme-text-muted">8 restants</span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden theme-badge">
                      <div
                        className={`stock-bar-fill h-full rounded-full bg-accent-violet ${stockFilled ? 'filled' : ''}`}
                        style={{ width: '40%' }}
                      />
                    </div>
                  </div>
                </div>
                <div className="theme-badge border theme-border rounded-xl p-3 flex items-center gap-2 mt-4">
                  <MessageCircle className="w-4 h-4 accent-emerald shrink-0" />
                  <p className="text-[10px] theme-text font-semibold">Reçu envoyé à Awa T. sur WhatsApp</p>
                </div>
              </div>
            )}

            {activeStep === 3 && (
              <div className="h-full flex flex-col justify-between">
                <div className="space-y-2">
                  <p className="text-[10px] font-mono-data accent-emerald font-bold uppercase tracking-wider">Rapport du soir</p>
                  <h4 className="font-bold theme-text text-xs">Ton bénéfice net :</h4>
                  <div className="tint-emerald-5 border border-emerald-500/20 rounded-2xl p-5 flex flex-col items-center gap-1 mt-2">
                    <span className="text-[10px] theme-text-muted uppercase font-bold">Ce que tu as gagné</span>
                    <span className="text-3xl font-extrabold accent-emerald font-mono-data">
                      <CountUp target={21350} duration={1100} suffix=" F" trigger={step3Triggered} />
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-center theme-text-muted leading-relaxed">
                  Ventes 45 000 F − Achats 18 650 F − Dépenses 5 000 F
                </p>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
};
