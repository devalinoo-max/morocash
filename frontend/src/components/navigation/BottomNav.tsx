import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Home,
  Receipt,
  Package,
  MoreHorizontal,
  Plus,
  Scissors,
} from 'lucide-react';
import { getTerminology } from '../../utils/formatters';

export const BottomNav: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    setActiveMoreSubTab,
    attemptNewSale,
    sales,
    customers,
    products,
    settings,
  } = useApp();

  const terminology = getTerminology(settings.activityType);
  const salesCount = sales.length;
  const debtorsCount = customers.filter((c) => c.totalDebt > 0).length;
  const lowStockCount = products.filter((p) => !p.isService && p.stock <= p.alertThreshold).length;

  return (
    <nav
      id="bottom-navigation-bar"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-[0_-8px_25px_rgba(0,0,0,0.06)]"
    >
      <div className="max-w-md mx-auto px-4 h-[68px] flex items-center justify-between relative">
        {/* 1. ACCUEIL */}
        <button
          id="nav-tab-home"
          onClick={() => {
            setActiveTab('home');
            setActiveMoreSubTab(null);
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 text-center transition-all cursor-pointer ${
            activeTab === 'home'
              ? 'text-[#4F46E5] font-extrabold'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'home' ? 'bg-indigo-50 text-[#4F46E5]' : ''}`}>
            <Home className="w-5 h-5" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Accueil</span>
        </button>

        {/* 2. VENTES (avec badge) */}
        <button
          id="nav-tab-sales"
          onClick={() => {
            setActiveTab('sales');
            setActiveMoreSubTab(null);
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 text-center transition-all cursor-pointer relative ${
            activeTab === 'sales'
              ? 'text-[#4F46E5] font-extrabold'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all relative ${activeTab === 'sales' ? 'bg-indigo-50 text-[#4F46E5]' : ''}`}>
            <Receipt className="w-5 h-5" />
            {salesCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#4F46E5] text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white">
                {salesCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Commandes</span>
        </button>

        {/* 3. [+] BOUTON CENTRAL EN DÉGRADÉ INDIGO→VIOLET, 56PX (BLOC 3) */}
        <div className="flex-1 flex justify-center items-center -mt-6">
          <button
            id="btn-floating-new-sale"
            onClick={attemptNewSale}
            aria-label="Nouvelle commande"
            className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#4F46E5] via-[#6366F1] to-[#9333EA] text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer ring-4 ring-white"
          >
            <Plus className="w-7 h-7 stroke-[3]" />
          </button>
        </div>

        {/* 4. PRODUITS / PRESTATIONS */}
        <button
          id="nav-tab-products"
          onClick={() => {
            setActiveTab('products');
            setActiveMoreSubTab(null);
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 text-center transition-all cursor-pointer relative ${
            activeTab === 'products'
              ? 'text-[#4F46E5] font-extrabold'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all relative ${activeTab === 'products' ? 'bg-indigo-50 text-[#4F46E5]' : ''}`}>
            {settings.activityType === 'SERVICES' ? (
              <Scissors className="w-5 h-5" />
            ) : (
              <Package className="w-5 h-5" />
            )}
            {lowStockCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white">
                {lowStockCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">{terminology.itemPlural}</span>
        </button>

        {/* 5. PLUS (contient Clients, Dépenses, Chiffres, Caisse, Abonnement, Réglages, Aide) */}
        <button
          id="nav-tab-more"
          onClick={() => {
            setActiveTab('more');
          }}
          className={`flex-1 flex flex-col items-center justify-center py-1 text-center transition-all cursor-pointer relative ${
            activeTab === 'more'
              ? 'text-[#4F46E5] font-extrabold'
              : 'text-slate-400 hover:text-slate-600 font-medium'
          }`}
        >
          <div className={`p-1.5 rounded-xl transition-all relative ${activeTab === 'more' ? 'bg-indigo-50 text-[#4F46E5]' : ''}`}>
            <MoreHorizontal className="w-5 h-5" />
            {debtorsCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center ring-2 ring-white">
                {debtorsCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight">Plus</span>
        </button>
      </div>
    </nav>
  );
};
