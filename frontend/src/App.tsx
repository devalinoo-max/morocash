import React, { useState, useEffect, useRef } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import {
  LOGIN_PATH,
  canonicalPath,
  isAuthPath,
  matchPath,
  pathForView,
  titleForPath,
} from './utils/routes';
import { hasSessionHint } from './utils/session';
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
import { PendingSyncBar } from './components/common/PendingSyncBar';
import { Logo } from './components/common/Logo';
import {
  AlertCircle,
  RefreshCw,
  ServerCrash,
} from 'lucide-react';

/**
 * Ecran d'attente neutre affiche pendant la verification de session, quand on
 * sait deja (indice local) que l'utilisateur est connecte : ni landing, ni
 * ecran de connexion, donc aucun clignotement avant le tableau de bord.
 */
const AppSplash: React.FC = () => (
  <div className="min-h-screen bg-[#F4F4F8] flex flex-col items-center justify-center gap-4">
    <Logo size={44} />
    <RefreshCw className="w-5 h-5 text-[#4F46E5] animate-spin" />
  </div>
);

const MainLayout: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    activeMoreSubTab,
    setActiveMoreSubTab,
    uiState,
    setUiState,
    syncPendingOperations,
    attemptNewSale,
    authStatus,
    justRegistered,
    isNewSaleOpen,
    setIsNewSaleOpen,
    isNewProductOpen,
    setIsNewProductOpen,
    customersDebtorsFilter,
    setCustomersDebtorsFilter,
  } = useApp();

  // ── Ecran affiche au tout premier rendu ─────────────────────────────────
  // Regle (point 3) : si une session valide existe, l'utilisateur ne voit
  // JAMAIS la page de presentation. On ne peut pas attendre /auth/me pour en
  // decider (ce serait faire patienter aussi les visiteurs qui decouvrent le
  // produit), donc on tranche avec l'indice local pose a la connexion.
  const bootHadSession = useRef(hasSessionHint());
  const bootPathWasApp = useRef(
    typeof window !== 'undefined' &&
      (matchPath(window.location.pathname) !== null || isAuthPath(window.location.pathname))
  );

  const [viewMode, setViewMode] = useState<'landing' | 'app'>(() => {
    if (typeof window === 'undefined') return 'landing';
    if (bootPathWasApp.current) return 'app';
    // Racine + session probable : on entre directement dans l'app.
    return bootHadSession.current ? 'app' : 'landing';
  });

  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register'>(() => {
    if (typeof window === 'undefined') return 'register';
    if (isAuthPath(window.location.pathname)) {
      return canonicalPath(window.location.pathname) === LOGIN_PATH ? 'login' : 'register';
    }
    // Session expiree (l'indice existait mais /auth/me a repondu non) : on
    // rouvre l'ecran de code, jamais le formulaire d'inscription.
    return bootHadSession.current ? 'login' : 'register';
  });

  const [isMobileFrame, setIsMobileFrame] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);

  // ── Permaliens ──────────────────────────────────────────────────────────
  // L'adresse affichee decrit toujours l'ecran ouvert : "/" pour la landing,
  // /connexion ou /inscription pour la porte d'authentification, sinon
  // l'onglet courant (/accueil, /produits, /reglages...).
  const currentPath = pathForView({
    viewMode,
    isAnonymous: authStatus === 'anonymous',
    authMode: authInitialMode,
    tab: activeTab,
    subTab: activeMoreSubTab,
    modal: isNewSaleOpen ? 'new-sale' : isNewProductOpen ? 'new-product' : null,
    debtorsOnly: customersDebtorsFilter,
  });

  useEffect(() => {
    // Pendant la verification de session, l'ecran affiche n'est pas encore
    // decide : reecrire l'URL ici effacerait le permalien demande.
    if (authStatus === 'loading') return;

    const path = window.location.pathname;

    // L'adresse actuelle designe deja cet ecran (ancienne adresse anglaise,
    // majuscules, slash final...) : on la normalise SANS empiler d'entree
    // d'historique, sinon le bouton Retour ramenerait sur l'ancienne adresse,
    // aussitot renormalisee, et l'utilisateur resterait bloque.
    if (canonicalPath(path) === currentPath) {
      if (path !== currentPath) {
        window.history.replaceState(null, '', currentPath);
      }
      return;
    }

    window.history.pushState(null, '', currentPath);
  }, [currentPath, authStatus]);

  // Le titre de l'onglet du navigateur suit l'adresse, en francais.
  useEffect(() => {
    document.title = titleForPath(currentPath);
  }, [currentPath]);

  // Session verifiee : un utilisateur connecte arrive sur "/" est envoye sur
  // son accueil sans passer par la presentation. A l'inverse, si l'indice
  // local mentait (session revoquee, expiree), on revient a la landing.
  useEffect(() => {
    if (authStatus === 'loading') return;
    if (bootPathWasApp.current) return;

    if (authStatus === 'authenticated' && bootHadSession.current) {
      setViewMode('app');
      setActiveTab('home');
      setActiveMoreSubTab(null);
      return;
    }
    if (authStatus === 'anonymous' && bootHadSession.current) {
      // L'indice est perime : on le laisse guider vers l'ecran de code
      // (deja fait par authInitialMode) plutot que vers la presentation.
      bootHadSession.current = false;
    }
  }, [authStatus, setActiveTab, setActiveMoreSubTab]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      const match = matchPath(path);
      if (!match) {
        // "/" comme toute adresse inconnue : retour a la landing, sauf sur les
        // adresses d'authentification qui restent dans l'app.
        if (isAuthPath(path)) {
          setAuthInitialMode(canonicalPath(path) === LOGIN_PATH ? 'login' : 'register');
          setViewMode('app');
          return;
        }
        setViewMode('landing');
        return;
      }
      setViewMode('app');
      setActiveTab(match.tab);
      setActiveMoreSubTab(match.tab === 'more' ? match.subTab : null);
      setCustomersDebtorsFilter(match.debtorsOnly);
      setIsNewSaleOpen(match.modal === 'new-sale');
      setIsNewProductOpen(match.modal === 'new-product');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    setIsNewSaleOpen,
    setIsNewProductOpen,
  ]);

  // Raccourcis clavier : Ctrl/Cmd+K (recherche) et F2 (nouvelle commande).
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

  // Pendant la verification de session d'un utilisateur qu'on sait connecte :
  // ecran d'attente neutre. Ni landing (interdite, point 3), ni ecran de
  // connexion (qui clignoterait pour rien si la session est bonne).
  if (authStatus === 'loading' && (bootHadSession.current || bootPathWasApp.current)) {
    return <AppSplash />;
  }

  // Page de presentation publique : visiteur anonyme, ou utilisateur connecte
  // qui y revient volontairement (le bouton d'entree devient alors
  // "Ouvrir mon tableau de bord", voir LandingHeader).
  if (viewMode === 'landing') {
    return (
      <div className="relative">
        <LandingPage
          onOpenApp={(mode) => {
            setAuthInitialMode(mode ?? 'register');
            setViewMode('app');
            if (authStatus === 'authenticated') {
              setActiveTab('home');
              setActiveMoreSubTab(null);
            }
          }}
        />
        <NewSaleModal />
        <InstallAppButton variant="floating" />
        <PwaUpdateToast />
      </div>
    );
  }

  if (authStatus === 'loading') {
    return <AppSplash />;
  }

  if (authStatus === 'anonymous') {
    return (
      <AuthScreen
        initialMode={authInitialMode === 'login' ? 'LOGIN' : 'REGISTER'}
        onModeChange={(mode) => setAuthInitialMode(mode === 'LOGIN' ? 'login' : 'register')}
      />
    );
  }

  // Choix "essai gratuit vs voir les formules" affiche une seule fois, juste
  // apres une inscription reussie (jamais apres une connexion existante).
  if (justRegistered) {
    return <WelcomeChoiceScreen />;
  }

  const renderActiveView = () => {
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

  const openLanding = () => {
    // Retour volontaire a la presentation depuis l'app : on quitte l'ecran
    // courant pour "/", et on ne re-declenche pas la redirection d'ouverture.
    bootHadSession.current = false;
    bootPathWasApp.current = false;
    setViewMode('landing');
  };

  return (
    <div className="min-h-screen bg-[#F4F4F8] text-slate-900 font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-900">
      <ToastNotification />

      {/* VIEWPORT MODE 1: simulation de cadre smartphone (outil de mise au point) */}
      {isMobileFrame ? (
        <div className="flex-1 flex items-center justify-center p-2 sm:p-6 bg-slate-950 min-h-screen">
          <div className="w-full max-w-[420px] h-[890px] max-h-[96vh] bg-white rounded-[44px] shadow-[0_25px_70px_rgba(0,0,0,0.8)] border-[9px] border-slate-800 overflow-hidden flex flex-col relative ring-1 ring-slate-700/50">
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5 bg-slate-900 rounded-full z-50 pointer-events-none flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-800 mr-2"></div>
              <div className="w-2 h-2 rounded-full bg-indigo-900/60"></div>
            </div>

            <div className="pt-5 shrink-0">
              <TopBar
                isMobileFrame={isMobileFrame}
                setIsMobileFrame={setIsMobileFrame}
                onOpenLanding={openLanding}
              />
              <OfflineBanner />
              <TrialBanner />
              <ReadOnlyBanner />
            </div>

            <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
              {renderActiveView()}
            </main>

            <BottomNav />
          </div>
        </div>
      ) : (
        /* VIEWPORT MODE 2: mise en page complete (mobile -> ordinateur) */
        <div className="flex-1 flex min-h-screen">
          <div className="hidden md:block shrink-0">
            <DesktopSidebar
              onOpenSearch={() => setQuickSearchOpen(true)}
              onOpenLanding={openLanding}
            />
          </div>

          <div className="flex-1 flex flex-col min-w-0 bg-[#F4F4F8]">
            <TopBar
              isMobileFrame={isMobileFrame}
              setIsMobileFrame={setIsMobileFrame}
              onOpenLanding={openLanding}
            />
            <OfflineBanner />
            <TrialBanner />
            <ReadOnlyBanner />

            <main className="flex-1 px-4 sm:px-6 pt-6 pb-28 md:pb-10 overflow-y-auto">
              <div className="max-w-[1460px] mx-auto">
                {renderActiveView()}
              </div>
            </main>

            <div className="md:hidden">
              <BottomNav />
            </div>
          </div>
        </div>
      )}

      {/* Modales globales */}
      <NewSaleModal />
      <ReceiptModal />
      <InstallAppButton variant="floating" />
      <PwaUpdateToast />
      {/* Bande basse : envois en cours, echecs a reessayer (point 1). */}
      <PendingSyncBar />
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
