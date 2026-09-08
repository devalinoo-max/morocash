import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { TopBar } from './components/navigation/TopBar';
import { BottomNav } from './components/navigation/BottomNav';
import { DesktopSidebar } from './components/navigation/DesktopSidebar';
import { DashboardTab } from './components/dashboard/DashboardTab';
import { SalesTab } from './components/sales/SalesTab';
import { ReceiptsTab } from './components/receipts/ReceiptsTab';
import { ProductsTab } from './components/products/ProductsTab';
import { MovementsTab } from './components/movements/MovementsTab';
import { CustomersTab } from './components/customers/CustomersTab';
import { CashRegisterTab } from './components/cash/CashRegisterTab';
import { MoreTab } from './components/more/MoreTab';
import { NewSaleModal } from './components/pos/NewSaleModal';
import { ReceiptModal } from './components/pos/ReceiptModal';
import { AuthScreen } from './components/auth/AuthScreen';
import { LandingPage } from './components/landing/LandingPage';
import { WelcomeChoiceScreen } from './components/onboarding/WelcomeChoiceScreen';
import { InstallAppButton } from './components/pwa/InstallAppButton';
import { PwaUpdateToast } from './components/pwa/PwaUpdateToast';
import {
  OfflineBanner,
  ReadOnlyBanner,
  TrialBanner,
  ToastNotification,
} from './components/common/UIStates';
import {
  AlertCircle,
  RefreshCw,
  ServerCrash,
  WifiOff,
  PackageOpen,
  ArrowRight,
  Search,
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const { activeTab, uiState, setUiState, syncPendingOperations, attemptNewSale, authStatus, justRegistered } = useApp();
  // La landing doit toujours être la première chose vue : on n'entre dans
  // l'app (login puis dashboard) qu'après un clic explicite depuis la landing.
  const [viewMode, setViewMode] = useState<'landing' | 'app'>('landing');
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>('register');
  const [isMobileFrame, setIsMobileFrame] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);

  // Keyboard shortcut listener for ⌘+K / Ctrl+K and F2
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((prev) => !prev);
      }
      if (e.key === 'F2') {
        e.preventDefault();
        attemptNewSale();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [attemptNewSale]);

  // If viewing landing page
  if (viewMode === 'landing') {
    return (
      <div className="relative">
        <LandingPage
          onOpenApp={(mode) => {
            setAuthInitialMode(mode ?? 'register');
            setViewMode('app');
          }}
        />
        <NewSaleModal />
        <InstallAppButton variant="floating" />
        <PwaUpdateToast />
      </div>
    );
  }

  // Porte d'authentification réelle (étape 13) — tant que la session cookie
  // n'a pas été vérifiée auprès du vrai backend, on n'affiche ni l'app ni
  // l'écran de connexion pour éviter un flash de l'écran de connexion.
  if (authStatus === 'loading') {
    return (
      <div className="min-h-screen bg-[#F4F4F8] flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-[#4F46E5] animate-spin" />
      </div>
    );
  }
  if (authStatus === 'anonymous') {
    return <AuthScreen initialMode={authInitialMode === 'login' ? 'LOGIN' : 'REGISTER'} />;
  }

  // Choix "essai gratuit vs voir les formules" affiché une seule fois, juste
  // après une inscription réussie (jamais après une connexion existante).
  if (justRegistered) {
    return <WelcomeChoiceScreen />;
  }

  // Render Current Tab View
  const renderActiveView = () => {
    // 1. Check UI State Overrides (§13: 11 États d'interface)
    if (uiState === 'LOADING') {
      return (
        <div className="p-12 flex flex-col items-center justify-center min-h-[50vh] space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-[#4F46E5] animate-spin" />
          </div>
          <p className="text-sm font-bold text-slate-700">Chargement de la caisse...</p>
          <p className="text-xs text-slate-400">Synchronisation des bases locales</p>
        </div>
      );
    }

    if (uiState === 'SERVER_ERROR') {
      return (
        <div className="p-8 my-8 mx-4 text-center bg-white rounded-3xl border border-rose-200 shadow-sm space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <ServerCrash className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            Connexion au serveur momentanément indisponible
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Pas d’inquiétude : tes ventes locales restent bien au chaud sur cet appareil.
          </p>
          <button
            onClick={() => setUiState('READY')}
            className="px-4 py-2.5 rounded-xl bg-[#4F46E5] text-white text-xs font-bold shadow-md cursor-pointer hover:bg-indigo-700"
          >
            Réessayer maintenant
          </button>
        </div>
      );
    }

    if (uiState === 'SYNC_ERROR') {
      return (
        <div className="p-8 my-8 mx-4 text-center bg-white rounded-3xl border border-amber-200 shadow-sm space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">
            La synchronisation a été interrompue
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Le réseau est instable. Les données en attente restent protégées.
          </p>
          <button
            onClick={syncPendingOperations}
            className="px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold shadow-md cursor-pointer"
          >
            Relancer la synchronisation
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'receipts':
        return <ReceiptsTab />;
      case 'sales':
        return <SalesTab />;
      case 'products':
        return <ProductsTab />;
      case 'movements':
        return <MovementsTab />;
      case 'customers':
        return <CustomersTab />;
      case 'cash':
        return <CashRegisterTab />;
      case 'more':
        return <MoreTab />;
      case 'home':
      default:
        return <DashboardTab />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F4F8] text-slate-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      {/* Toast notification alerts */}
      <ToastNotification />

      {/* VIEWPORT MODE 1: High-End Smartphone Frame Simulation */}
      {isMobileFrame ? (
        <div className="flex-1 flex items-center justify-center p-2 sm:p-6 bg-slate-950 min-h-screen">
          <div className="w-full max-w-[420px] h-[890px] max-h-[96vh] bg-white rounded-[44px] shadow-[0_25px_70px_rgba(0,0,0,0.8)] border-[9px] border-slate-800 overflow-hidden flex flex-col relative ring-1 ring-slate-700/50">
            {/* Dynamic Island / Speaker notch */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-900 rounded-full z-50 pointer-events-none flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mr-2"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-900/60"></div>
            </div>

            {/* Top Navigation */}
            <div className="pt-5 shrink-0">
              <TopBar
                isMobileFrame={isMobileFrame}
                setIsMobileFrame={setIsMobileFrame}
                onOpenLanding={() => setViewMode('landing')}
              />
              <OfflineBanner />
              <TrialBanner />
              <ReadOnlyBanner />
            </div>

            {/* Scrollable Mobile View */}
            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
              {renderActiveView()}
            </main>

            {/* Bottom Nav (5 slots as per BLOC 3) */}
            <BottomNav />
          </div>
        </div>
      ) : (
        /* VIEWPORT MODE 2: Responsive Full Desktop Layout (BLOC 4) */
        <div className="flex-1 flex min-h-screen">
          {/* SIDEBAR: Hidden on mobile (<768px), icon-only on tablet (768-1023px), fixed 246px on desktop (>=1024px) */}
          <div className="hidden md:block shrink-0">
            <DesktopSidebar
              onOpenSearch={() => setQuickSearchOpen(true)}
              onOpenLanding={() => setViewMode('landing')}
            />
          </div>

          {/* MAIN APPLICATION WORKSPACE */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#F4F4F8]">
            {/* Top bar 62px with user, shop name, sync badge, new sale button */}
            <TopBar
              isMobileFrame={isMobileFrame}
              setIsMobileFrame={setIsMobileFrame}
              onOpenLanding={() => setViewMode('landing')}
            />
            <OfflineBanner />
            <TrialBanner />
            <ReadOnlyBanner />

            {/* Main Content Area with 24px padding and 1460px max width */}
            <main className="flex-1 px-4 sm:px-6 pt-6 pb-28 md:pb-10 overflow-y-auto">
              <div className="max-w-[1460px] mx-auto">
                {renderActiveView()}
              </div>
            </main>

            {/* Bottom Navigation ONLY on Mobile (0-767px) - BLOC 4 Mandate (aucune barre basse sur ordinateur) */}
            <div className="md:hidden">
              <BottomNav />
            </div>
          </div>
        </div>
      )}

      {/* Global Interactive Modals */}
      <NewSaleModal />
      <ReceiptModal />
      <InstallAppButton variant="floating" />
      <PwaUpdateToast />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
