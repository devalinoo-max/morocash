import React from 'react';
import { motion, MotionConfig } from 'motion/react';
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
  type LucideIcon,
} from 'lucide-react';

import { NavigationTab } from '../../types';
import type { MoreSubTab } from '../../utils/routes';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import { avatarInitials } from '../../utils/avatar';

interface DesktopSidebarProps {
  onOpenSearch?: () => void;
  onOpenLanding?: () => void;
}

interface NavItem {
  key: string;
  id?: string;
  label: string;
  icon: LucideIcon;
  /** Teinte de l'icône au repos ; l'item actif passe tout en blanc. */
  iconClass?: string;
  onClick: () => void;
  active?: boolean;
  /** Compteur neutre, ou rouge quand il demande un geste. */
  count?: number;
  countTone?: 'neutral' | 'danger';
  /** Contenu libre à droite (raccourci clavier, état de la caisse). */
  trailing?: React.ReactNode;
  className?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const MC_EASE = [0.22, 1, 0.36, 1] as const;

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ onOpenSearch, onOpenLanding }) => {
  const {
    activeTab,
    setActiveTab,
    activeMoreSubTab,
    setActiveMoreSubTab,
    attemptNewSale,
    isWriteLocked,
    products,
    customers,
    activeCashSession,
    settings,
    logoutUser,
    customersDebtorsFilter,
    setCustomersDebtorsFilter,
  } = useApp();

  // Calculated badge counts
  const lowStockCount = products.filter(
    (p) => !p.isService && p.stock <= p.alertThreshold
  ).length;
  const debtorsCount = customers.filter((c) => c.totalDebt > 0).length;

  const navigateTo = (tab: NavigationTab, subTab: MoreSubTab | null = null) => {
    setActiveTab(tab);
    setActiveMoreSubTab(subTab);
  };

  const isCurrentActive = (tab: NavigationTab, subTab: string | null = null) => {
    if (activeTab !== tab) return false;
    if (tab === 'more') {
      return activeMoreSubTab === subTab;
    }
    return activeMoreSubTab === null || activeMoreSubTab === subTab;
  };

  // Plan badge computation according to planStatus
  const getPlanBadge = () => {
    if (settings.planStatus === 'TRIAL') {
      return { label: 'Essai', className: 'bg-amber-400/20 text-amber-300' };
    }
    if (settings.planStatus === 'SOLO') {
      return { label: 'Solo', className: 'bg-sky-400/20 text-sky-300' };
    }
    if (settings.planStatus === 'EXPIRED') {
      return { label: 'Expiré', className: 'bg-rose-400/20 text-rose-300' };
    }
    return { label: 'Business', className: 'bg-white/15 text-white' };
  };
  const planBadge = getPlanBadge();

  const groups: NavGroup[] = [
    {
      title: 'Tableau de bord',
      items: [
        {
          key: 'home',
          label: 'Accueil',
          icon: LayoutDashboard,
          onClick: () => navigateTo('home'),
          active: isCurrentActive('home'),
        },
      ],
    },
    {
      title: 'Vendre',
      items: [
        {
          key: 'new-sale',
          label: 'Nouvelle commande',
          icon: PlusCircle,
          iconClass: 'text-[#A79DFF]',
          onClick: attemptNewSale,
          className: isWriteLocked ? LOCKED_BTN_CLASS : '',
          trailing: (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-[#C6C2E4]">
              F2
            </span>
          ),
        },
        {
          key: 'sales',
          label: 'Mes commandes',
          icon: Receipt,
          onClick: () => navigateTo('sales'),
          active: isCurrentActive('sales'),
        },
        {
          key: 'receipts',
          id: 'nav-mes-recus',
          label: 'Mes reçus',
          icon: FileText,
          onClick: () => navigateTo('receipts'),
          active: isCurrentActive('receipts'),
        },
      ],
    },
    {
      title: 'Mon stock',
      items: [
        {
          key: 'products',
          label: 'Produits',
          icon: Package,
          onClick: () => navigateTo('products'),
          active: isCurrentActive('products'),
          count: products.length,
        },
        {
          key: 'movements',
          label: 'Mouvements',
          icon: ArrowLeftRight,
          onClick: () => navigateTo('movements'),
          active: isCurrentActive('movements'),
        },
        {
          key: 'low-stock',
          label: 'Ce qui va manquer',
          icon: AlertTriangle,
          iconClass: 'text-rose-400',
          onClick: () => navigateTo('products'),
          count: lowStockCount,
          countTone: 'danger',
        },
      ],
    },
    {
      title: 'Mes clients',
      items: [
        {
          key: 'customers',
          label: 'Clients',
          icon: Users,
          onClick: () => {
            setCustomersDebtorsFilter(false);
            navigateTo('customers');
          },
          active: isCurrentActive('customers') && !customersDebtorsFilter,
          count: customers.length,
        },
        {
          key: 'debtors',
          label: 'Qui me doit',
          icon: Clock,
          iconClass: 'text-amber-400',
          onClick: () => {
            setCustomersDebtorsFilter(true);
            navigateTo('customers');
          },
          active: isCurrentActive('customers') && customersDebtorsFilter,
          count: debtorsCount,
          countTone: 'danger',
        },
      ],
    },
    {
      title: 'Mon argent',
      items: [
        {
          key: 'cash',
          label: 'Caisse',
          icon: WalletCards,
          onClick: () => navigateTo('cash'),
          active: isCurrentActive('cash'),
          trailing: (
            <span
              className={`flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                activeCashSession ? 'text-emerald-300 bg-emerald-400/15' : 'text-[#9D99C9] bg-white/10'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  activeCashSession ? 'bg-emerald-400 animate-pulse' : 'bg-[#75709F]'
                }`}
              />
              <span>{activeCashSession ? 'Ouverte' : 'Fermée'}</span>
            </span>
          ),
        },
        {
          key: 'expenses',
          label: 'Ce que je dépense',
          icon: TrendingDown,
          iconClass: 'text-amber-400',
          onClick: () => navigateTo('more', 'expenses'),
          active: isCurrentActive('more', 'expenses'),
        },
        {
          key: 'reports',
          label: 'Mes chiffres',
          icon: BarChart3,
          iconClass: 'text-[#A79DFF]',
          onClick: () => navigateTo('more', 'reports'),
          active: isCurrentActive('more', 'reports'),
        },
      ],
    },
    {
      title: 'Mon équipe',
      items: [
        {
          key: 'employees',
          label: 'Employés',
          icon: UserCheck,
          onClick: () => navigateTo('more', 'employees'),
          active: isCurrentActive('more', 'employees'),
        },
        {
          key: 'permissions',
          label: 'Qui peut voir quoi',
          icon: ShieldCheck,
          iconClass: 'text-emerald-400',
          onClick: () => navigateTo('more', 'permissions'),
          active: isCurrentActive('more', 'permissions'),
        },
      ],
    },
    {
      title: 'Mon compte',
      items: [
        {
          key: 'subscription',
          label: 'Mon abonnement',
          icon: Crown,
          iconClass: 'text-amber-400',
          onClick: () => navigateTo('more', 'subscription'),
          active: isCurrentActive('more', 'subscription'),
        },
        {
          key: 'settings',
          label: 'Réglages',
          icon: Settings,
          onClick: () => navigateTo('more', 'settings'),
          active: isCurrentActive('more', 'settings'),
        },
        {
          key: 'export',
          label: 'Sauvegarde & Export',
          icon: Download,
          iconClass: 'text-emerald-400',
          onClick: () => navigateTo('more', 'export'),
          active: isCurrentActive('more', 'export'),
        },
        {
          key: 'help',
          label: 'Aide',
          icon: HelpCircle,
          onClick: () => navigateTo('more', 'help'),
          active: isCurrentActive('more', 'help'),
        },
        ...(onOpenLanding
          ? [
              {
                key: 'landing',
                label: 'Site / Landing Page',
                icon: Sparkles,
                iconClass: 'text-emerald-400',
                onClick: onOpenLanding,
                className: 'text-emerald-300 hover:text-emerald-200',
              } satisfies NavItem,
            ]
          : []),
        // Déconnexion aussi dans la liste, et pas seulement tout en bas :
        // c'est ici, sous « Mon compte », qu'on vient la chercher — et cette
        // liste défile, donc elle reste atteignable même sur un écran court
        // où le bas de la barre est coupé.
        {
          key: 'logout',
          label: 'Déconnexion',
          icon: LogOut,
          onClick: () => logoutUser(),
          className: 'hover:!bg-rose-600 hover:!text-white',
        },
      ],
    },
  ];

  const trialTotal = settings.trialDays ?? 14;

  return (
    <aside
      id="desktop-sidebar"
      className="w-[232px] lg:w-[258px] shrink-0 h-screen sticky top-0 p-3 pr-0 select-none z-30 font-jakarta"
    >
      <div className="h-full bg-mc-sidebar text-[#C6C2E4] rounded-[24px] flex flex-col overflow-hidden shadow-mc-card">
        {/* 1. En-tête : Logo MoroCash + Nom boutique */}
        <div className="px-4 pt-4 pb-3 flex items-center gap-3 shrink-0 min-w-0">
          <div className="w-10 h-10 rounded-2xl mc-gradient flex items-center justify-center text-white shrink-0 overflow-hidden">
            {settings.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={settings.shopName}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <Store className="w-5 h-5 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-white text-[14px] tracking-tight">MoroCash</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${planBadge.className}`}>
                {planBadge.label}
              </span>
            </div>
            <p className="text-[12px] text-[#9D99C9] font-medium truncate">
              {settings.shopName || 'Ma boutique'}
            </p>
          </div>
        </div>

        {/* 2. Recherche rapide en pilule */}
        <div className="px-3 pb-1 shrink-0">
          <button
            onClick={onOpenSearch}
            title="Rechercher (⌘K)"
            className="w-full h-10 flex items-center justify-between px-3.5 rounded-full bg-white/[0.07] hover:bg-white/[0.12] text-[#9D99C9] hover:text-white text-[14px] transition-colors cursor-pointer active:scale-[0.97]"
          >
            <span className="flex items-center gap-2">
              <Search className="w-4 h-4 shrink-0" />
              <span>Rechercher…</span>
            </span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-black/25 text-[#9D99C9] rounded-md">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* 3. Navigation groupée par DOMAINE avec défilement interne.
            La pastille de l'item actif glisse d'un item à l'autre. */}
        <MotionConfig reducedMotion="user">
          <motion.nav
            layoutScroll
            className="flex-1 min-h-0 overflow-y-auto px-3 pb-2 scrollbar-none"
          >
            {groups.map((group) => (
              <div key={group.title}>
                <div className="text-[11px] font-semibold text-[#75709F] uppercase tracking-wider px-3 pt-4 pb-1.5">
                  {group.title}
                </div>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icone = item.icon;
                    return (
                      <button
                        key={item.key}
                        id={item.id}
                        onClick={item.onClick}
                        title={item.label}
                        aria-current={item.active ? 'page' : undefined}
                        className={`relative w-full h-10 px-3 rounded-xl flex items-center justify-between gap-2 text-[14px] transition-colors duration-200 cursor-pointer active:scale-[0.97] ${
                          item.active
                            ? 'text-white font-semibold'
                            : 'text-[#C6C2E4] hover:bg-white/[0.07] hover:text-white'
                        } ${item.className ?? ''}`}
                      >
                        {item.active && (
                          <motion.span
                            layoutId="sidebar-pastille"
                            transition={{ duration: 0.4, ease: MC_EASE }}
                            className="absolute inset-0 rounded-xl bg-mc-primary shadow-[0_6px_16px_rgba(91,75,240,0.45)]"
                          />
                        )}
                        <span className="relative z-10 flex items-center gap-3 min-w-0">
                          <Icone
                            className={`w-5 h-5 shrink-0 ${item.active ? 'text-white' : (item.iconClass ?? '')}`}
                          />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {item.trailing && <span className="relative z-10 shrink-0">{item.trailing}</span>}
                        {item.count != null && item.count > 0 && (
                          <span
                            className={`relative z-10 shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold tabular-nums flex items-center justify-center ${
                              item.active
                                ? 'bg-white/25 text-white'
                                : item.countTone === 'danger'
                                  ? 'bg-mc-danger text-white'
                                  : 'bg-white/10 text-[#C6C2E4]'
                            }`}
                          >
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.nav>
        </MotionConfig>

        {/* 4. Carte du bas : statut d'abonnement + bouton Voir mon abonnement */}
        <div className="px-3 pt-2 shrink-0">
          <div
            className={`p-3 rounded-2xl space-y-2.5 ${
              settings.planStatus === 'TRIAL' ? 'mc-gradient' : 'bg-white/[0.07]'
            }`}
          >
            {settings.planStatus === 'EXPIRED' ? (
              <span className="text-[12px] font-bold text-white flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-rose-400" />
                <span>Abonnement expiré</span>
              </span>
            ) : settings.planStatus === 'TRIAL' ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Essai</span>
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white tabular-nums">
                    {settings.trialDaysLeft} jours restants
                  </span>
                </div>
                <div className="w-full bg-black/25 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-white h-full rounded-full"
                    style={{ width: `${Math.min(100, (settings.trialDaysLeft / trialTotal) * 100)}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <span>Formule {settings.planStatus === 'BUSINESS' ? 'Business' : 'Solo'}</span>
                  </span>
                  {/* Un abonné payant voyait « Active » sans aucune échéance : il
                      découvrait la coupure le matin même. Le compte à rebours se
                      lit maintenant ici, comme pendant l'essai. */}
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums ${
                      settings.subscriptionDaysLeft != null && settings.subscriptionDaysLeft <= 7
                        ? 'bg-amber-400/20 text-amber-300'
                        : 'bg-emerald-400/20 text-emerald-300'
                    }`}
                  >
                    {settings.subscriptionDaysLeft == null
                      ? 'Active'
                      : `${settings.subscriptionDaysLeft} j restants`}
                  </span>
                </div>
                {settings.subscriptionDaysLeft != null && settings.subscriptionDaysLeft <= 30 && (
                  <div className="w-full bg-black/25 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        settings.subscriptionDaysLeft <= 7
                          ? 'bg-gradient-to-r from-rose-500 to-amber-400'
                          : 'bg-gradient-to-r from-emerald-400 to-[#5B4BF0]'
                      }`}
                      style={{ width: `${Math.min(100, (settings.subscriptionDaysLeft / 30) * 100)}%` }}
                    />
                  </div>
                )}
              </>
            )}
            <button
              onClick={() => navigateTo('more', 'subscription')}
              className={`w-full h-8 rounded-full text-[12px] font-bold transition-all cursor-pointer block text-center active:scale-[0.97] ${
                settings.planStatus === 'EXPIRED'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : settings.planStatus === 'TRIAL'
                    ? 'bg-white text-mc-primary-dark hover:bg-white/90'
                    : 'bg-mc-primary hover:bg-[#6C5CFF] text-white'
              }`}
            >
              {settings.planStatus === 'EXPIRED' ? 'Réactiver mon compte' : 'Voir mon abonnement'}
            </button>
          </div>
        </div>

        {/* 5. Ligne identité utilisateur / rôle + déconnexion.
            La déconnexion n'était qu'une icône grise de 32 px sans libellé, dans
            le coin : elle marchait, mais on ne la trouvait pas — sur téléphone,
            l'onglet « Plus » a toujours eu un vrai bouton écrit. */}
        <div className="p-3 shrink-0 space-y-2">
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-9 h-9 rounded-full mc-gradient text-white font-bold text-[12px] flex items-center justify-center shrink-0">
              {avatarInitials(settings.ownerName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-white truncate leading-tight">
                {settings.ownerName}
              </p>
              <p className="text-[11px] text-[#9D99C9] truncate">
                {settings.role === 'OWNER' ? 'Propriétaire' : settings.role === 'ACCOUNTANT' ? 'Comptable' : 'Vendeur'} • {settings.city}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => logoutUser()}
            title="Déconnexion"
            aria-label="Déconnexion"
            className="w-full h-9 rounded-full flex items-center justify-center gap-1.5 text-[12px] font-bold text-[#C6C2E4] bg-white/[0.07] hover:bg-rose-600 hover:text-white transition-colors cursor-pointer active:scale-[0.97]"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
