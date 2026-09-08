import React from 'react';
import { useLandingTheme } from './useLandingTheme';
import { ScrollProgressBar } from './ScrollProgressBar';
import { LandingHeader } from './LandingHeader';
import { HeroSection } from './HeroSection';
import { PaymentMethodsBand } from './PaymentMethodsBand';
import { ProblemSection } from './ProblemSection';
import { BeforeAfterSection } from './BeforeAfterSection';
import { LiveSimulatorSection } from './LiveSimulatorSection';
import { StatsSection } from './StatsSection';
import { ThreePillarsSection } from './ThreePillarsSection';
import { TestimonialsSection } from './TestimonialsSection';
import { ComparisonSection } from './ComparisonSection';
import { BentoPersonasSection } from './BentoPersonasSection';
import { PricingSection } from './PricingSection';
import { FinalCtaSection } from './FinalCtaSection';
import { LandingFooter } from './LandingFooter';

interface LandingPageProps {
  onOpenApp: (mode?: 'login' | 'register') => void;
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

export const LandingPage: React.FC<LandingPageProps> = ({ onOpenApp }) => {
  const { theme, toggleTheme } = useLandingTheme();

  const handleSelectPlan = (_plan: 'solo' | 'business') => {
    onOpenApp('register');
  };
  const handleStartTrial = () => onOpenApp('register');
  const handleLogin = () => onOpenApp('login');

  return (
    <div className={`morocash-landing ${theme === 'light' ? 'light' : ''} relative min-h-screen overflow-x-clip`}>
      <div className="noise-overlay" />
      <ScrollProgressBar />

      {/* Halos décoratifs */}
      <div
        className="fixed top-[-10%] left-[10%] w-[480px] h-[480px] rounded-full pointer-events-none -z-10"
        style={{ background: 'radial-gradient(circle, var(--violet) 0%, transparent 70%)', opacity: 0.12, filter: 'blur(120px)' }}
      />
      <div
        className="fixed top-[60vh] right-[-5%] w-[520px] h-[520px] rounded-full pointer-events-none -z-10"
        style={{ background: 'radial-gradient(circle, var(--emerald) 0%, transparent 70%)', opacity: 0.12, filter: 'blur(120px)' }}
      />
      <div
        className="fixed top-[160vh] left-[-5%] w-[480px] h-[480px] rounded-full pointer-events-none -z-10"
        style={{ background: 'radial-gradient(circle, var(--emerald) 0%, transparent 70%)', opacity: 0.1, filter: 'blur(120px)' }}
      />
      <div
        className="fixed top-[260vh] right-[10%] w-[480px] h-[480px] rounded-full pointer-events-none -z-10"
        style={{ background: 'radial-gradient(circle, var(--violet) 0%, transparent 70%)', opacity: 0.1, filter: 'blur(120px)' }}
      />

      <LandingHeader theme={theme} onToggleTheme={toggleTheme} onLogin={handleLogin} onStartTrial={handleStartTrial} />

      <main id="top">
        <HeroSection onScrollToPricing={() => scrollTo('tarifs')} onScrollToHowItWorks={() => scrollTo('comment-ca-marche')} />
        <PaymentMethodsBand />
        <ProblemSection />
        <BeforeAfterSection />
        <LiveSimulatorSection />
        <StatsSection />
        <ThreePillarsSection />
        <TestimonialsSection />
        <ComparisonSection />
        <BentoPersonasSection />
        <PricingSection onSelectPlan={handleSelectPlan} />
        <FinalCtaSection onStartTrial={handleStartTrial} />
      </main>

      <LandingFooter theme={theme} />
    </div>
  );
};
