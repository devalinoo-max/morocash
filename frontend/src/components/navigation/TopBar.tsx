import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Bell, CheckCircle2, AlertTriangle, Clock, MoreHorizontal } from 'lucide-react';
import { SyncStatusBadge } from '../common/UIStates';
import { usePageMenuEntries } from '../../context/PageMenuContext';
import { avatarInitials } from '../../utils/avatar';

interface TopBarProps {
  isMobileFrame: boolean;
  setIsMobileFrame: (val: boolean) => void;
  onOpenLanding?: () => void;
}

/**
 * La barre haute, 56 px, une seule ligne.
 *
 * À gauche le nom de l'écran puis celui de la boutique ; à droite trois cibles
 * de 34 px, pas une de plus. Tout ce qui s'ajoutait ici — bouton « + Nouvelle
 * commande », gros libellés d'état — repoussait le titre jusqu'à le tronquer
 * sur un téléphone de 390 px, et le nom de la boutique passait dessous.
 */
export const TopBar: React.FC<TopBarProps> = () => {
  const {
    activeTab,
    activeMoreSubTab,
    settings,
    customers,
    products,
    setActiveTab,
    setCustomersDebtorsFilter,
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const { entries: pageMenuEntries, runAction } = usePageMenuEntries();

  // Les deux panneaux se ferment au clic ailleurs, y compris sur l'autre.
  const rightCluster = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showNotifications && !showPageMenu) return;
    const close = (e: MouseEvent) => {
      if (rightCluster.current?.contains(e.target as Node)) return;
      setShowNotifications(false);
      setShowPageMenu(false);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [showNotifications, showPageMenu]);

  // Le titre est le nom réel de la page, écrit en entier. Les anciens libellés
  // (« Mon Catalogue Produits », « Caisse du jour & Tiroir-caisse ») étaient
  // des phrases : elles ne tenaient pas, donc elles se coupaient.
  const getPageTitle = () => {
    switch (activeTab) {
      case 'sales':
        return 'Mes commandes';
      case 'receipts':
        return 'Mes reçus';
      case 'cash':
        return 'Ma caisse';
      case 'products':
        return settings.activityType === 'SERVICES' ? 'Mes prestations' : 'Mon catalogue';
      case 'movements':
        return 'Mon stock';
      case 'customers':
        return 'Mes clients';
      case 'more':
        if (activeMoreSubTab === 'expenses') return 'Mes dépenses';
        if (activeMoreSubTab === 'reports') return 'Mes chiffres';
        if (activeMoreSubTab === 'subscription') return 'Mon abonnement';
        if (activeMoreSubTab === 'settings') return 'Réglages';
        if (activeMoreSubTab === 'help') return 'Aide';
        if (activeMoreSubTab === 'export') return 'Exporter';
        if (activeMoreSubTab === 'employees') return 'Mon équipe';
        return 'Menu & options';
      case 'home':
      default:
        return 'Tableau de bord';
    }
  };

  const overdueCustomers = customers.filter((c) => c.debtAgeDays >= 30 && c.totalDebt > 0);
  const outOfStockProducts = products.filter((p) => !p.isService && p.stock <= 0);
  const totalAlerts = overdueCustomers.length + outOfStockProducts.length;

  // 34 px : la cible reste confortable au pouce sans manger la ligne du titre.
  const CIBLE =
    'w-[34px] h-[34px] shrink-0 rounded-xl flex items-center justify-center transition-all cursor-pointer';

  return (
    <header
      id="top-navigation-bar"
      className="h-[56px] bg-white border-b border-slate-200/90 px-3 sm:px-6 sticky top-0 z-30 flex items-center gap-3 shadow-xs select-none"
    >
      {/* GAUCHE : le titre de la page, puis le nom réel de la boutique.
          Le titre ne se coupe jamais — c'est lui qui dit où on est ; c'est le
          nom de la boutique, plus long et déjà connu du commerçant, qui cède
          la place en s'abrégeant. */}
      <div className="flex-1 flex flex-col justify-center min-w-0">
        <h1
          className="text-[16px] text-slate-900 tracking-tight leading-none whitespace-nowrap"
          style={{ fontWeight: 750 }}
        >
          {getPageTitle()}
        </h1>
        <p className="text-[10.5px] text-slate-500 font-medium truncate mt-[3px] leading-none">
          {settings.shopName || 'Ma boutique'}
        </p>
      </div>

      {/* DROITE : cloche, avatar, menu de la page. Rien d'autre. */}
      <div ref={rightCluster} className="flex items-center gap-[7px] shrink-0">
        {/* L'état de synchronisation n'apparaît qu'à partir de la tablette : sur
            téléphone, la bande basse et la bannière hors-ligne le disent déjà,
            et la place vaut mieux au titre. */}
        <div className="hidden sm:block">
          <SyncStatusBadge />
        </div>

        {/* Notifications : un point rouge suffit, le nombre est dans le panneau */}
        <div className="relative">
          <button
            id="btn-notifications-bell"
            onClick={(e) => {
              e.stopPropagation();
              setShowPageMenu(false);
              setShowNotifications(!showNotifications);
            }}
            className={`${CIBLE} border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 relative`}
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {totalAlerts > 0 && (
              <span className="absolute top-[7px] right-[7px] w-2 h-2 rounded-full bg-rose-600 ring-2 ring-white"></span>
            )}
          </button>

          {showNotifications && (
            <div
              className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-24px))] bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                <span className="text-xs font-extrabold text-slate-900">Notifications & Alertes</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                  {totalAlerts} urgentes
                </span>
              </div>

              <div className="space-y-2 text-xs">
                {overdueCustomers.map((cust) => (
                  <div
                    key={cust.id}
                    onClick={() => {
                      setCustomersDebtorsFilter(true);
                      setActiveTab('customers');
                      setShowNotifications(false);
                    }}
                    className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 hover:bg-rose-100/60 cursor-pointer transition-all flex items-start gap-2.5"
                  >
                    <Clock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        Dette &gt; 30 jours : {cust.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Doit {cust.totalDebt.toLocaleString()} FCFA depuis {cust.debtAgeDays} jours
                      </p>
                    </div>
                  </div>
                ))}

                {outOfStockProducts.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => {
                      setActiveTab('products');
                      setShowNotifications(false);
                    }}
                    className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-100 hover:bg-amber-100/60 cursor-pointer transition-all flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">
                        Rupture de stock : {prod.name}
                      </p>
                      <p className="text-[11px] text-slate-500">Stock épuisé (0 disponible)</p>
                    </div>
                  </div>
                ))}

                {totalAlerts === 0 && (
                  <div className="py-4 text-center text-slate-400 text-xs">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
                    Aucune alerte en attente. Tout roule !
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Avatar : deux lettres, jamais un tiret ni un caractère de remplissage */}
        <div
          title={`${settings.ownerName} (${settings.role})`}
          className={`${CIBLE} bg-gradient-to-tr from-[#4F46E5] to-purple-600 text-white font-extrabold text-[12px] shadow-xs ring-2 ring-indigo-100`}
        >
          {avatarInitials(settings.ownerName)}
        </div>

        {/* Menu de la page : n'apparaît que si la page y a déposé des actions */}
        {pageMenuEntries.length > 0 && (
          <div className="relative">
            <button
              id="btn-page-menu"
              onClick={(e) => {
                e.stopPropagation();
                setShowNotifications(false);
                setShowPageMenu(!showPageMenu);
              }}
              className={`${CIBLE} border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900`}
              aria-label="Actions de la page"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {showPageMenu && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 mt-2 w-[min(15rem,calc(100vw-24px))] bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                {pageMenuEntries.map((entry) => {
                  const Icone = entry.icon;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      disabled={entry.disabled}
                      onClick={() => {
                        setShowPageMenu(false);
                        runAction(entry.id);
                      }}
                      className="w-full px-3.5 py-2.5 flex items-center gap-2.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer text-left"
                    >
                      {Icone && <Icone className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className="truncate">{entry.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
