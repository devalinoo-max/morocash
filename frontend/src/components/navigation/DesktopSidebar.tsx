import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Store,
  LayoutDashboard,
  PlusCircle,
  Receipt,
  FileText,
  Package,
  ArrowLeftRight,
  AlertTriangle,
  Users,
  Clock,
  WalletCards,
  TrendingDown,
  BarChart3,
  UserCheck,
  ShieldCheck,
  Crown,
  Settings,
  HelpCircle,
  Search,
  Sparkles,
  LogOut,
  Download,
  Lock,
} from 'lucide-react';

import { NavigationTab } from '../../types';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';

interface DesktopSidebarProps {
  onOpenSearch?: () => void;
  onOpenLanding?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ onOpenSearch, onOpenLanding }) => {
  const {
    activeTab,
    setActiveTab,
    activeMoreSubTab,
    setActiveMoreSubTab,
    attemptNewSale,
    isWriteLocked,
    setSelectedSaleForReceipt,
    products,
    customers,
    sales,
    activeCashSession,
    settings,
    logoutUser,
    setCustomersDebtorsFilter,
  } = useApp();

  // Calculated badge counts
  const salesCount = sales.length;
  const lowStockCount = products.filter(
    (p) => !p.isService && p.stock <= p.alertThreshold
  ).length;
  const debtorsCount = customers.filter((c) => c.totalDebt > 0).length;

  const navigateTo = (
    tab: NavigationTab,
    subTab:
      | 'expenses'
      | 'reports'
      | 'subscription'
      | 'settings'
      | 'help'
      | 'export'
      | 'employees'
      | 'permissions'
      | null = null
  ) => {
    setActiveTab(tab);
    setActiveMoreSubTab(subTab);
  };

  const isCurrentActive = (
    tab: NavigationTab,
    subTab: string | null = null
  ) => {
    if (activeTab !== tab) return false;
    if (tab === 'more') {
      return activeMoreSubTab === subTab;
    }
    return activeMoreSubTab === null || activeMoreSubTab === subTab;
  };

  // Plan badge computation according to planStatus
  const getPlanBadge = () => {
    if (settings.planStatus === 'TRIAL') {
      return {
        label: 'Essai',
        className: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      };
    }
    if (settings.planStatus === 'SOLO') {
      return {
        label: 'Solo',
        className: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
      };
    }
    if (settings.planStatus === 'EXPIRED') {
      return {
        label: 'Expiré',
        className: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      };
    }
    return {
      label: 'Business',
      className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    };
  };
  const planBadge = getPlanBadge();

  return (
    <aside
      id="desktop-sidebar"
      className="w-[220px] lg:w-[246px] bg-[#17162B] text-[#C6C2E4] border-r border-[#2F2C50] flex flex-col shrink-0 h-screen sticky top-0 select-none z-30 font-sans"
    >
      {/* 1. En-tête : Logo MoroCash + Nom boutique */}
      <div className="p-3 lg:p-4 border-b border-[#2F2C50] flex items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 lg:w-9 lg:h-9 rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#4338CA] flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-900/50 shrink-0 overflow-hidden">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.shopName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Store className="w-4 h-4 lg:w-5 lg:h-5 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-xs lg:text-sm tracking-tight">MoroCash</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${planBadge.className}`}>
                {planBadge.label}
              </span>
            </div>
            <p className="text-[10.5px] text-slate-400 font-medium truncate">
              {settings.shopName || 'Boutique Étoile d’Afrique'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Recherche rapide en pilule */}
      <div className="px-2.5 lg:px-3 pt-2.5 pb-1 shrink-0">
        <button
          onClick={onOpenSearch}
          title="Rechercher (⌘K)"
          className="w-full flex items-center justify-between px-3 py-1.5 lg:py-2 rounded-xl bg-[#232141] hover:bg-[#2A274E] text-[#C6C2E4] hover:text-white border border-[#2F2C50] text-xs transition-colors cursor-pointer group"
        >
          <span className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-400 shrink-0" />
            <span className="text-slate-400 group-hover:text-slate-200 text-xs">Rechercher...</span>
          </span>
          <kbd className="px-1.5 py-0.5 text-[9.5px] font-mono bg-[#17162B] text-slate-400 rounded border border-[#2F2C50]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* 3. Navigation groupée par DOMAINE avec défilement interne */}
      <nav className="flex-1 overflow-y-auto px-2 lg:px-2.5 py-1.5 space-y-1 scrollbar-thin scrollbar-thumb-[#2F2C50] scrollbar-track-transparent">
        {/* GROUPE 1 : TABLEAU DE BORD */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            TABLEAU DE BORD
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => navigateTo('home')}
              title="Accueil"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('home')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-[17px] h-[17px] shrink-0" />
              <span className="truncate">Accueil</span>
            </button>
          </div>
        </div>

        {/* GROUPE 2 : VENDRE */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            VENDRE
          </div>
          <div className="space-y-0.5">
            <button
              onClick={attemptNewSale}
              title="Nouvelle commande"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] text-[#C6C2E4] hover:bg-[#232141] hover:text-white transition-all cursor-pointer group ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <span className="flex items-center gap-[10px] truncate">
                <PlusCircle className="w-[17px] h-[17px] text-indigo-400 group-hover:scale-110 transition-transform shrink-0" />
                <span className="truncate">Nouvelle commande</span>
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 shrink-0">
                F2
              </span>
            </button>

            <button
              onClick={() => navigateTo('sales')}
              title="Mes commandes"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] transition-all cursor-pointer ${
                isCurrentActive('sales')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-[10px] truncate">
                <Receipt className="w-[17px] h-[17px] shrink-0" />
                <span className="truncate">Mes commandes</span>
              </span>
              {salesCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                    isCurrentActive('sales')
                      ? 'bg-white/20 text-white'
                      : 'bg-[#232141] text-slate-300'
                  }`}
                >
                  {salesCount}
                </span>
              )}
            </button>

            <button
              id="nav-mes-recus"
              onClick={() => navigateTo('receipts')}
              title="Mes reçus"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] transition-all cursor-pointer ${
                isCurrentActive('receipts')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-[10px] truncate">
                <FileText className="w-[17px] h-[17px] shrink-0" />
                <span className="truncate">Mes reçus</span>
              </span>
              {salesCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 ${
                    isCurrentActive('receipts')
                      ? 'bg-white/20 text-white'
                      : 'bg-[#232141] text-slate-300'
                  }`}
                >
                  {salesCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* GROUPE 3 : MON STOCK */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            MON STOCK
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => navigateTo('products')}
              title="Produits"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] transition-all cursor-pointer ${
                isCurrentActive('products')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-[10px] truncate">
                <Package className="w-[17px] h-[17px] shrink-0" />
                <span className="truncate">Produits</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal shrink-0">
                {products.length}
              </span>
            </button>

            <button
              onClick={() => navigateTo('movements')}
              title="Mouvements"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('movements')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <ArrowLeftRight className="w-[17px] h-[17px] shrink-0" />
              <span className="truncate">Mouvements</span>
            </button>

            <button
              onClick={() => navigateTo('products')}
              title="Ce qui va manquer"
              className="w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] text-[#C6C2E4] hover:bg-[#232141] hover:text-white transition-all cursor-pointer"
            >
              <span className="flex items-center gap-[10px] truncate">
                <AlertTriangle className="w-[17px] h-[17px] text-rose-400 shrink-0" />
                <span className="truncate">Ce qui va manquer</span>
              </span>
              {lowStockCount > 0 && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#DC2626] text-white shrink-0">
                  {lowStockCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* GROUPE 4 : MES CLIENTS */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            MES CLIENTS
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => {
                setCustomersDebtorsFilter(false);
                navigateTo('customers');
              }}
              title="Clients"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] transition-all cursor-pointer ${
                isCurrentActive('customers')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-[10px] truncate">
                <Users className="w-[17px] h-[17px] shrink-0" />
                <span className="truncate">Clients</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal shrink-0">
                {customers.length}
              </span>
            </button>

            <button
              onClick={() => {
                setCustomersDebtorsFilter(true);
                navigateTo('customers');
              }}
              title="Qui me doit"
              className="w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] text-[#C6C2E4] hover:bg-[#232141] hover:text-white transition-all cursor-pointer"
            >
              <span className="flex items-center gap-[10px] truncate">
                <Clock className="w-[17px] h-[17px] text-amber-400 shrink-0" />
                <span className="truncate">Qui me doit</span>
              </span>
              {debtorsCount > 0 && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#DC2626] text-white shrink-0">
                  {debtorsCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* GROUPE 5 : MON ARGENT */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            MON ARGENT
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => navigateTo('cash')}
              title="Caisse"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center justify-between text-[13px] transition-all cursor-pointer ${
                isCurrentActive('cash')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-[10px] truncate">
                <WalletCards className="w-[17px] h-[17px] shrink-0" />
                <span className="truncate">Caisse</span>
              </span>
              <span
                className={`flex items-center gap-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                  activeCashSession
                    ? 'text-emerald-400 bg-emerald-950/60 border-emerald-800/60'
                    : 'text-slate-400 bg-slate-800/60 border-slate-700/60'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    activeCashSession ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                  }`}
                />
                <span>{activeCashSession ? 'Ouverte' : 'Fermée'}</span>
              </span>
            </button>

            <button
              onClick={() => navigateTo('more', 'expenses')}
              title="Ce que je dépense"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'expenses')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <TrendingDown className="w-[17px] h-[17px] text-amber-400 shrink-0" />
              <span className="truncate">Ce que je dépense</span>
            </button>

            <button
              onClick={() => navigateTo('more', 'reports')}
              title="Mes chiffres"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'reports')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <BarChart3 className="w-[17px] h-[17px] text-indigo-400 shrink-0" />
              <span className="truncate">Mes chiffres</span>
            </button>
          </div>
        </div>

        {/* GROUPE 6 : MON ÉQUIPE */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            MON ÉQUIPE
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => navigateTo('more', 'employees')}
              title="Employés"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'employees')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <UserCheck className="w-[17px] h-[17px] shrink-0" />
              <span className="truncate">Employés</span>
            </button>

            <button
              onClick={() => navigateTo('more', 'permissions')}
              title="Qui peut voir quoi"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'permissions')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <ShieldCheck className="w-[17px] h-[17px] text-emerald-400 shrink-0" />
              <span className="truncate">Qui peut voir quoi</span>
            </button>
          </div>
        </div>

        {/* GROUPE 7 : MON COMPTE */}
        <div>
          <div className="text-[10.5px] font-semibold text-[#75709F] uppercase tracking-wider px-[17px] pt-[16px] pb-[6px]">
            MON COMPTE
          </div>
          <div className="space-y-0.5">
            <button
              onClick={() => navigateTo('more', 'subscription')}
              title="Mon abonnement"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'subscription')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <Crown className="w-[17px] h-[17px] text-amber-400 shrink-0" />
              <span className="truncate">Mon abonnement</span>
            </button>

            <button
              onClick={() => navigateTo('more', 'settings')}
              title="Réglages"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'settings')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <Settings className="w-[17px] h-[17px] shrink-0" />
              <span className="truncate">Réglages</span>
            </button>

            <button
              onClick={() => navigateTo('more', 'export')}
              title="Sauvegarde & Export"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'export')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <Download className="w-[17px] h-[17px] text-emerald-400 shrink-0" />
              <span className="truncate">Sauvegarde & Export</span>
            </button>

            <button
              onClick={() => navigateTo('more', 'help')}
              title="Aide"
              className={`w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] transition-all cursor-pointer ${
                isCurrentActive('more', 'help')
                  ? 'bg-[#4F46E5] text-white font-semibold shadow-xs'
                  : 'text-[#C6C2E4] hover:bg-[#232141] hover:text-white'
              }`}
            >
              <HelpCircle className="w-[17px] h-[17px] shrink-0" />
              <span className="truncate">Aide</span>
            </button>

            {onOpenLanding && (
              <button
                onClick={onOpenLanding}
                title="Voir la Landing Page"
                className="w-full h-[38px] px-[11px] py-[9px] rounded-[9px] flex items-center gap-[10px] text-[13px] text-emerald-300 hover:bg-emerald-950/40 hover:text-emerald-200 border border-emerald-500/20 transition-all cursor-pointer mt-1"
              >
                <Sparkles className="w-[17px] h-[17px] text-emerald-400 shrink-0" />
                <span className="truncate font-semibold">Site / Landing Page</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* 4. Carte du bas : statut d'abonnement + bouton Voir mon abonnement */}
      <div className="p-2 lg:p-2.5 border-t border-[#2F2C50] shrink-0">
        <div className="p-2.5 rounded-2xl bg-[#232141] border border-[#2F2C50] space-y-2">
          {settings.planStatus === 'EXPIRED' ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-rose-400" />
                <span>Abonnement expiré</span>
              </span>
            </div>
          ) : settings.planStatus === 'TRIAL' ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Essai</span>
                </span>
                <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                  {settings.trialDaysLeft} jours restants
                </span>
              </div>
              <div className="w-full bg-[#17162B] h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-400 to-[#4F46E5] h-full rounded-full"
                  style={{ width: `${Math.min(100, (settings.trialDaysLeft / 14) * 100)}%` }}
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Formule {settings.planStatus === 'BUSINESS' ? 'Business' : 'Solo'}</span>
              </span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                Active
              </span>
            </div>
          )}
          <button
            onClick={() => navigateTo('more', 'subscription')}
            className={`w-full py-1.5 rounded-xl text-white text-[11px] font-bold transition-all cursor-pointer shadow-xs block text-center ${
              settings.planStatus === 'EXPIRED' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-[#4F46E5] hover:bg-indigo-500'
            }`}
          >
            {settings.planStatus === 'EXPIRED' ? 'Réactiver mon compte' : 'Voir mon abonnement'}
          </button>
        </div>
      </div>

      {/* 5. Ligne identité utilisateur / rôle */}
      <div className="p-2.5 lg:p-3 border-t border-[#2F2C50] flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#4F46E5] to-purple-600 text-white font-bold text-xs flex items-center justify-center shrink-0 ring-2 ring-[#2F2C50]">
          {settings.ownerName
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'MK'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-white truncate leading-tight">
            {settings.ownerName}
          </p>
          <p className="text-[10px] text-slate-400 truncate">
            {settings.role === 'OWNER' ? 'Propriétaire' : settings.role === 'ACCOUNTANT' ? 'Comptable' : 'Vendeur'} • {settings.city}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logoutUser()}
          title="Déconnexion"
          aria-label="Déconnexion"
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-slate-400 hover:text-white hover:bg-rose-600/80 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
