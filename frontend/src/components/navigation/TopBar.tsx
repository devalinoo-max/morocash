import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Bell,
  Plus,
  Smartphone,
  Monitor,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  Shield,
  UserCheck,
} from 'lucide-react';
import { SyncStatusBadge } from '../common/UIStates';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';

interface TopBarProps {
  isMobileFrame: boolean;
  setIsMobileFrame: (val: boolean) => void;
  onOpenLanding?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ isMobileFrame, setIsMobileFrame, onOpenLanding }) => {
  const {
    activeTab,
    activeMoreSubTab,
    settings,
    attemptNewSale,
    isWriteLocked,
    customers,
    products,
    setActiveTab,
    setCustomersDebtorsFilter,
  } = useApp();

  const [showNotifications, setShowNotifications] = useState(false);

  // Compute active page title for header
  const getPageTitle = () => {
    switch (activeTab) {
      case 'sales':
        return 'Mes Commandes';
      case 'cash':
        return 'Caisse du jour & Tiroir-caisse';
      case 'products':
        return settings.activityType === 'SERVICES' ? 'Mes Prestations' : 'Mon Catalogue Produits';
      case 'customers':
        return 'Clients & Dettes';
      case 'more':
        if (activeMoreSubTab === 'expenses') return 'Dépenses du jour';
        if (activeMoreSubTab === 'reports') return 'Mes Chiffres & Rentabilité';
        if (activeMoreSubTab === 'subscription') return 'Mon Abonnement';
        if (activeMoreSubTab === 'settings') return 'Réglages de la boutique';
        if (activeMoreSubTab === 'help') return 'Aide & Tutoriels';
        return 'Menu & Outils';
      case 'home':
      default:
        return 'Tableau de bord';
    }
  };

  const overdueCustomers = customers.filter((c) => c.debtAgeDays >= 30 && c.totalDebt > 0);
  const outOfStockProducts = products.filter((p) => !p.isService && p.stock <= 0);
  const totalAlerts = overdueCustomers.length + outOfStockProducts.length;

  return (
    <header
      id="top-navigation-bar"
      className="h-[62px] bg-white border-b border-slate-200/90 px-4 sm:px-6 sticky top-0 z-30 flex items-center justify-between shadow-xs select-none"
    >
      {/* GAUCHE : Titre de la page + ligne Prénom Nom · Rôle · Nom de la boutique (BLOC 3) */}
      <div className="flex flex-col justify-center min-w-0">
        <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate leading-none">
          {getPageTitle()}
        </h1>
        <p className="text-[11px] text-slate-500 font-medium truncate mt-1 flex items-center gap-1.5">
          <span className="font-semibold text-slate-700">{settings.ownerName}</span>
          <span className="text-slate-300">•</span>
          <span className="text-indigo-600 font-medium">
            {settings.role === 'OWNER' ? 'Propriétaire' : settings.role === 'ACCOUNTANT' ? 'Comptable' : 'Vendeur'}
          </span>
          <span className="text-slate-300">•</span>
          <span className="truncate">{settings.shopName || 'Boutique Étoile d’Afrique'}</span>
        </p>
      </div>

      {/* DROITE : Pastille sync, cloche notif point rouge, avatar initiales, bouton plein + Nouvelle vente */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Sync Status Badge */}
        <SyncStatusBadge />

        {/* Notifications Bell with Red Indicator and dropdown */}
        <div className="relative">
          <button
            id="btn-notifications-bell"
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 hover:text-slate-900 relative transition-all cursor-pointer"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {totalAlerts > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-rose-600 ring-2 ring-white"></span>
            )}
          </button>

          {/* Notifications Dropdown Modal */}
          {showNotifications && (
            <div
              className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 animate-in fade-in zoom-in-95 duration-150"
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
                    <div>
                      <p className="font-bold text-slate-900">Dette &gt; 30 jours : {cust.name}</p>
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
                    <div>
                      <p className="font-bold text-slate-900">Rupture de stock : {prod.name}</p>
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

        {/* Avatar initiales */}
        <div
          title={`${settings.ownerName} (${settings.role})`}
          className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#4F46E5] to-purple-600 text-white font-extrabold text-xs flex items-center justify-center shadow-xs ring-2 ring-indigo-100 shrink-0"
        >
          {settings.ownerName
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'MK'}
        </div>

        {/* Bouton plein "+ Nouvelle commande" (BLOC 4: obligatoire sur la barre haute) */}
        <button
          id="btn-topbar-new-sale"
          onClick={attemptNewSale}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-extrabold shadow-md shadow-indigo-600/20 transition-all cursor-pointer ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Nouvelle commande</span>
        </button>
      </div>
    </header>
  );
};
