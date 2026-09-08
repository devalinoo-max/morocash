import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, PaymentMethod } from '../../types';
import {
  X,
  Search,
  Plus,
  Minus,
  Trash2,
  Check,
  CreditCard,
  Banknote,
  Smartphone,
  User,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Scan,
  RotateCw,
  SlidersHorizontal,
  PlusCircle,
  WifiOff,
  ShoppingBag,
  MessageSquare,
  Receipt,
  Tag,
  Pencil,
  Wrench,
} from 'lucide-react';
import { formatMoney } from '../../utils/currency';
import { MoneyInput } from '../common/UIStates';
import { WhatsAppOrderModal } from './WhatsAppOrderModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ProductFormModal } from '../products/ProductFormModal';
import { DiscountModal } from './DiscountModal';
import { ServiceModal } from './ServiceModal';
import { CustomerPickerModal } from './CustomerPickerModal';

type SaleStep = 'PRODUCTS' | 'PAYMENT';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-emerald-600',
  'bg-indigo-600',
  'bg-violet-600',
  'bg-sky-600',
  'bg-teal-600',
  'bg-amber-600',
  'bg-rose-600',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || fullName;
}

export const NewSaleModal: React.FC = () => {
  const {
    isNewSaleOpen,
    setIsNewSaleOpen,
    products,
    customers,
    sales,
    cart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    cartTotal,
    cartItemCount,
    completeSale,
    settings,
    uiState,
    setSelectedSaleForReceipt,
    showToast,
  } = useApp();

  // Navigation state
  const [step, setStep] = useState<SaleStep>('PRODUCTS');

  // Search & Filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('TOUS');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Discount state
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountMode, setDiscountMode] = useState<'PERCENTAGE' | 'AMOUNT'>('AMOUNT');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');

  // Payment State
  const [paymentType, setPaymentType] = useState<'FULL' | 'PARTIAL' | 'CREDIT'>('FULL');
  const [customPaidAmount, setCustomPaidAmount] = useState<number>(0);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('CASH');

  // Customer State (Mandatory)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');

  // Auxiliary Modals State
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isProductFormOpen, setIsProductFormOpen] = useState(false);
  const [scannerPreBarcode, setScannerPreBarcode] = useState<string>('');
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);

  // Compute 4 recent customers for quick access pills
  const recentCustomers = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof customers = [];
    if (sales) {
      for (const sale of sales) {
        if (sale.customerId && !seen.has(sale.customerId)) {
          const cust = customers.find((c) => c.id === sale.customerId);
          if (cust) {
            seen.add(sale.customerId);
            list.push(cust);
          }
        }
        if (list.length >= 4) break;
      }
    }
    if (list.length < 4 && customers) {
      for (const cust of customers) {
        if (!seen.has(cust.id)) {
          seen.add(cust.id);
          list.push(cust);
        }
        if (list.length >= 4) break;
      }
    }
    return list.slice(0, 4);
  }, [sales, customers]);

  // Auto-focus search on open
  useEffect(() => {
    if (isNewSaleOpen && step === 'PRODUCTS') {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [isNewSaleOpen, step]);

  // Categories list
  const categories = useMemo(() => {
    return ['TOUS', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];
  }, [products]);

  // POINT 1: SINGLE UNIFIED PRODUCT LIST
  // Default: sorted by most sold first (salesCount descending)
  const displayProducts = useMemo(() => {
    let list = [...products];
    const q = searchQuery.toLowerCase().trim();

    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.internalCode && p.internalCode.toLowerCase().includes(q)) ||
          (p.productCodes && p.productCodes.some((c) => c.code.toLowerCase().includes(q))) ||
          (p.category && p.category.toLowerCase().includes(q))
      );
    } else if (selectedCategory !== 'TOUS') {
      list = list.filter((p) => p.category === selectedCategory);
    } else {
      // Sort by "les plus vendus" by default
      list.sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0));
    }
    return list;
  }, [products, searchQuery, selectedCategory]);

  // Calculations
  const finalTotal = Math.max(0, cartTotal - discountAmount);

  // Calculate remaining debt
  const actualPaid =
    paymentType === 'FULL'
      ? finalTotal
      : paymentType === 'CREDIT'
      ? 0
      : Math.min(finalTotal, customPaidAmount);

  const remainingDebt = Math.max(0, finalTotal - actualPaid);

  // Synchronize customPaidAmount when total changes and payment is full
  useEffect(() => {
    if (paymentType === 'FULL') {
      setCustomPaidAmount(finalTotal);
    }
  }, [finalTotal, paymentType]);

  if (!isNewSaleOpen) return null;

  // Selected customer object
  const selectedCustomerObj = customers.find((c) => c.id === selectedCustomerId);
  const futureDebt = (selectedCustomerObj?.totalDebt || 0) + remainingDebt;
  const isOffline = settings.isOfflineMode || uiState === 'OFFLINE';

  // Effective discount percentage
  const discountPercent =
    cartTotal > 0 && discountAmount > 0
      ? Math.round((discountAmount / cartTotal) * 100)
      : 0;

  // Handler: Validate and finalize sale
  const handleValidateSale = async () => {
    if (cart.length === 0) {
      showToast('Le panier est vide', 'warning');
      return;
    }

    // Strict validation: customer is mandatory (Point 6)
    if (!selectedCustomerId) {
      showToast('Sélectionne un client pour cette vente !', 'error');
      setIsCustomerPickerOpen(true);
      return;
    }

    const createdSale = await completeSale({
      paidAmount: actualPaid,
      paymentMethod: selectedPaymentMethod,
      discount: discountAmount,
      discountMode,
      discountValue,
      customerId: selectedCustomerId,
      customerName: selectedCustomerObj?.name,
      customerPhone: selectedCustomerObj?.phone,
      notes: discountReason ? `Remise: ${discountReason}` : undefined,
    });

    if (createdSale) {
      setIsNewSaleOpen(false);
      setSelectedSaleForReceipt(createdSale);

      // Reset modal state
      setStep('PRODUCTS');
      setDiscountAmount(0);
      setDiscountMode('AMOUNT');
      setDiscountValue(0);
      setDiscountReason('');
      setSelectedCustomerId('');
      setPaymentType('FULL');
      setCustomPaidAmount(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 animate-in fade-in duration-150">
      <div
        id="new-sale-modal-container"
        className="bg-white w-full sm:max-w-6xl h-[94vh] sm:h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      >
        {/* ========================================================================= */}
        {/* TOP HEADER & STEPPER */}
        {/* ========================================================================= */}
        <div className="px-4 sm:px-6 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between gap-2">
            {/* Left: App/Shop Title */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-[#4F46E5] text-xs">
                MC
              </div>
              <div>
                <h2 className="text-xs font-black text-slate-900 leading-none">Nouvelle commande</h2>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {settings.shopName || 'Boutique'}
                </p>
              </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center gap-1 sm:gap-2 select-none">
              {/* Step 1: Produits */}
              <button
                type="button"
                onClick={() => setStep('PRODUCTS')}
                className={`flex items-center gap-1.5 sm:gap-2 cursor-pointer transition-all ${
                  step === 'PRODUCTS'
                    ? 'text-slate-900 font-black'
                    : 'text-indigo-600 font-bold hover:opacity-80'
                }`}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                    step === 'PRODUCTS'
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'bg-indigo-50 text-[#4F46E5]'
                  }`}
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] sm:text-xs">1. Produits</span>
              </button>

              <div className="w-4 sm:w-8 h-[1.5px] bg-slate-200" />

              {/* Step 2: Paiement */}
              <button
                type="button"
                disabled={cart.length === 0 || !selectedCustomerId}
                onClick={() => setStep('PAYMENT')}
                className={`flex items-center gap-1.5 sm:gap-2 transition-all ${
                  cart.length === 0 || !selectedCustomerId
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer'
                } ${
                  step === 'PAYMENT'
                    ? 'text-slate-900 font-black'
                    : 'text-slate-400 font-medium'
                }`}
              >
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                    step === 'PAYMENT'
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] sm:text-xs">2. Paiement</span>
              </button>
            </div>

            {/* Right: Close button */}
            <button
              id="btn-close-sale-modal"
              type="button"
              onClick={() => setIsNewSaleOpen(false)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Offline notice */}
          {isOffline && (
            <div className="mt-2 py-1 px-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold flex items-center gap-1.5 animate-in fade-in">
              <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>
                <strong>Mode hors-ligne :</strong> Cette commande sera sauvegardée localement (réf. LOC-...) et synchronisée dès la reconnexion.
              </span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* STEP 1 : PRODUITS (GRILLE UNIQUE + PANIER FIXE 400PX) */}
        {/* ========================================================================= */}
        {step === 'PRODUCTS' && (
          <div className="flex-1 flex flex-col md:flex-row min-h-0 bg-slate-50/50">
            {/* GAUCHE : CATALOGUE PRODUITS (flex-1) */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0 bg-white border-r border-slate-200/80">
              {/* BARRE D'OUTILS */}
              <div className="p-3 border-b border-slate-100 bg-white space-y-2 shrink-0">
                <div className="flex items-center gap-2">
                  {/* Champ de recherche */}
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="input-sale-search-product"
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Rechercher un produit..."
                      className="w-full h-11 pl-10 pr-9 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:bg-white transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* POINT 3 : LE BOUTON + SERVICE EN PILULE PLEINE #EEF2FF TEXTE #4F46E5 */}
                  <button
                    id="btn-add-service-pos"
                    type="button"
                    onClick={() => setIsServiceModalOpen(true)}
                    title="Ajouter un service ou une prestation"
                    className="h-10 px-3.5 rounded-full bg-[#EEF2FF] hover:bg-indigo-100 text-[#4F46E5] font-bold text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>+ Service</span>
                  </button>

                  {/* POINT 5: LE BOUTON [+] AVEC ICÔNE ET TEXTE DIRECTEMENT À DROITE */}
                  <button
                    id="btn-add-product-pos"
                    type="button"
                    onClick={() => {
                      setScannerPreBarcode('');
                      setIsProductFormOpen(true);
                    }}
                    title="Ajouter un nouveau produit au catalogue"
                    className="h-11 px-3.5 sm:px-4 rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-xs transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Ajouter un produit</span>
                  </button>

                  {/* Filtre catégorie [ ▽ ] */}
                  <div className="relative">
                    <button
                      id="btn-filter-category"
                      type="button"
                      onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                      title="Filtrer par catégorie"
                      className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all cursor-pointer relative shrink-0 ${
                        selectedCategory !== 'TOUS'
                          ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-xs'
                          : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <SlidersHorizontal className="w-4 h-4" />
                      {selectedCategory !== 'TOUS' && (
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 absolute top-1.5 right-1.5 ring-2 ring-white" />
                      )}
                    </button>

                    {isCategoryDropdownOpen && (
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 p-1.5 animate-in fade-in slide-in-from-top-2">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider px-2.5 py-1 block">
                          Catégories
                        </span>
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              selectedCategory === cat
                                ? 'bg-indigo-50 text-[#4F46E5]'
                                : 'text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bouton Recharger [ ⟳ ] */}
                  <button
                    id="btn-reload-catalog"
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('TOUS');
                      showToast('Catalogue actualisé', 'info');
                    }}
                    title="Recharger le catalogue"
                    className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-all cursor-pointer shrink-0"
                  >
                    <RotateCw className="w-4 h-4" />
                  </button>

                  {/* Bouton Scanner [ ⛶ ] */}
                  <button
                    id="btn-open-scanner"
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    title="Scanner un code-barres"
                    className="w-11 h-11 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    <Scan className="w-4 h-4 text-indigo-300" />
                  </button>

                  {/* Bouton Commande WhatsApp [ ✆ ] */}
                  <button
                    id="btn-open-whatsapp-order"
                    type="button"
                    onClick={() => setIsWhatsAppOpen(true)}
                    title="Commande reçue par WhatsApp"
                    className="w-11 h-11 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] text-white flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>

                {/* Categories Scrollable Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 pt-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-[#4F46E5] text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* POINT 1 & 2 : GRILLE UNIQUE À 3 COLONNES — MODÈLE DE CARTE STANDARD 88PX */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                {displayProducts.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 space-y-2">
                    <p className="text-sm font-semibold text-slate-600">Aucun produit trouvé</p>
                    <p className="text-xs">Essaie un autre terme ou ajoute le produit au catalogue.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setScannerPreBarcode('');
                        setIsProductFormOpen(true);
                      }}
                      className="px-4 py-2 bg-indigo-50 text-[#4F46E5] hover:bg-indigo-100 rounded-xl text-xs font-bold cursor-pointer transition-colors mt-2 inline-block"
                    >
                      + Ajouter ce produit maintenant
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {displayProducts.map((prod, index) => {
                      const inCart = cart.find((ci) => ci.product.id === prod.id);
                      const isStockNeg = !prod.isService && prod.stock < 0;
                      const isStockZero = !prod.isService && prod.stock === 0;
                      const isStockLow = !prod.isService && prod.stock >= 1 && prod.stock <= 3;
                      const isStockNormal = !prod.isService && prod.stock > 3;

                      const showSeparator =
                        index === 8 &&
                        !searchQuery.trim() &&
                        selectedCategory === 'TOUS' &&
                        displayProducts.length > 8;

                      return (
                        <React.Fragment key={prod.id}>
                          {showSeparator && (
                            <div className="col-span-full py-2.5 text-center text-xs font-semibold text-slate-400 select-none">
                              ── Le reste du catalogue ──
                            </div>
                          )}

                          {/* STANDARD PRODUCT CARD (POINT 2) */}
                          <div
                            id={`pos-prod-card-${prod.id}`}
                            onClick={() => addToCart(prod)}
                            className="h-[88px] p-3 rounded-[14px] border border-[#E2E8F0] bg-white flex flex-col justify-between transition-all hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:scale-[0.98] cursor-pointer relative text-left select-none shadow-xs group"
                          >
                            {/* In-cart badge in top-right */}
                            {inCart && (
                              <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-[#EEF2FF] text-[#4F46E5] shadow-2xs">
                                ×{inCart.quantity}
                              </span>
                            )}

                            {/* Ligne 1 : Nom du produit en gras (14px), 1 seule ligne, tronqué */}
                            <div className="pr-8">
                              <span className="text-sm font-bold text-slate-900 truncate block leading-snug">
                                {prod.name}
                              </span>
                            </div>

                            {/* Ligne 2 : Prix de vente en gras (15px) */}
                            <div>
                              <span className="text-[15px] font-bold text-slate-900 leading-tight block">
                                {formatMoney(prod.salePrice)}
                              </span>
                            </div>

                            {/* Ligne 3 : Stock restant en petit (11px) selon vocabulaire strict */}
                            <div className="leading-none">
                              {prod.isService ? (
                                <span className="text-[11px] font-medium text-[#2563EB]">
                                  Prestation
                                </span>
                              ) : isStockNeg ? (
                                <span className="text-[11px] font-bold text-[#DC2626]">
                                  Stock négatif ({prod.stock})
                                </span>
                              ) : isStockZero ? (
                                <span className="text-[11px] font-medium text-[#DC2626]">
                                  Rupture
                                </span>
                              ) : isStockLow ? (
                                <span className="text-[11px] font-bold text-[#D97706]">
                                  Il ne te reste que {prod.stock}
                                </span>
                              ) : isStockNormal ? (
                                <span className="text-[11px] text-[#64748B]">
                                  Il te reste {prod.stock}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </React.Fragment>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* DROITE : COLONNE DE COMMANDE (LARGEUR FIXE 400PX) */}
            <div className="w-full md:w-[400px] shrink-0 flex flex-col bg-white border-t md:border-t-0 md:border-l border-slate-200">
              {/* POINT 1 : BLOC CLIENT MIS EN ÉVIDENCE EN HAUT DE LA COLONNE */}
              <div className="p-3 border-b border-slate-100 shrink-0">
                {!selectedCustomerObj ? (
                  /* ÉTAT AUCUN CLIENT : carte 84px, fond #FFFBEB, bordure gauche 4px #F59E0B avec pulsation lente, rayon 14px */
                  <div>
                    <div className="h-[84px] min-h-[84px] rounded-[14px] bg-[#FFFBEB] border-l-4 border-l-[#F59E0B] pulse-border-amber border-y border-r border-amber-200/70 p-3 flex items-center justify-between gap-2.5 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-[34px] h-[34px] min-w-[34px] rounded-full bg-[#F59E0B] flex items-center justify-center text-white shadow-2xs">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-[650] text-slate-900 leading-tight">
                            À qui est cette commande ?
                          </h4>
                          <p className="text-xs text-amber-900/80 font-medium mt-0.5">
                            Obligatoire pour valider
                          </p>
                        </div>
                      </div>
                      <button
                        id="btn-choose-customer-pos"
                        type="button"
                        onClick={() => setIsCustomerPickerOpen(true)}
                        className="shrink-0 px-3.5 py-2 rounded-xl bg-[#F59E0B] hover:bg-amber-600 text-white font-bold text-xs shadow-xs cursor-pointer transition-colors"
                      >
                        Choisir un client
                      </button>
                    </div>

                    {/* ACCÈS RAPIDE : 4 derniers clients saisis */}
                    {recentCustomers.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5">
                        <span className="text-[11px] font-bold text-slate-400 shrink-0">
                          Derniers clients :
                        </span>
                        {recentCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelectedCustomerId(c.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-[#4F46E5] text-slate-700 text-xs font-semibold shrink-0 transition-colors cursor-pointer border border-slate-200/60"
                          >
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white ${getAvatarColor(
                                c.name
                              )}`}
                            >
                              {getInitials(c.name)}
                            </span>
                            <span>{getFirstName(c.name)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* ÉTAT CLIENT CHOISI : carte 84px, fond #F0FDF4, bordure gauche 4px #16A34A (sans pulsation), rayon 14px */
                  <div className="h-[84px] min-h-[84px] rounded-[14px] bg-[#F0FDF4] border-l-4 border-l-[#16A34A] border-y border-r border-emerald-200/70 p-3 flex items-center justify-between gap-2.5 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 min-w-10 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-2xs ${getAvatarColor(
                          selectedCustomerObj.name
                        )}`}
                      >
                        {getInitials(selectedCustomerObj.name)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-[650] text-slate-900 truncate leading-snug">
                          {selectedCustomerObj.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {selectedCustomerObj.phone && selectedCustomerObj.phone !== 'Non renseigné' && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              {selectedCustomerObj.phone}
                            </span>
                          )}
                          {selectedCustomerObj.totalDebt > 0 ? (
                            <span className="text-[10px] font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded-md">
                              te doit déjà {formatMoney(selectedCustomerObj.totalDebt)}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                              à jour
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      id="btn-change-customer-pos"
                      type="button"
                      onClick={() => setIsCustomerPickerOpen(true)}
                      className="shrink-0 text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer px-1 py-1"
                    >
                      Changer
                    </button>
                  </div>
                )}
              </div>

              {/* POINT 6.2 : HEADER COMMANDE EN COURS */}
              <div className="px-3.5 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-black text-slate-900 tracking-tight">
                    Commande en cours
                  </h3>
                  <span className="text-[11px] font-medium text-slate-500">
                    • {cartItemCount} article{cartItemCount > 1 ? 's' : ''}
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    id="btn-clear-cart"
                    type="button"
                    onClick={clearCart}
                    className="text-[11px] font-bold text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Tout vider</span>
                  </button>
                )}
              </div>

              {/* POINT 6.3 : LIGNES DU PANIER OU ÉTAT VIDE */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[140px]">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                      <ShoppingBag className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-semibold text-slate-500">Ton panier est vide</p>
                    <p className="text-[11px] text-slate-400">
                      Touche un article dans le catalogue pour l'ajouter
                    </p>
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-2.5"
                    >
                      {/* Left: Name and Unit price */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate leading-snug">
                            {item.product.name}
                          </p>
                          {item.product.isService && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-700 shrink-0">
                              Service
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatMoney(item.unitPrice)}
                        </p>
                      </div>

                      {/* Right: Controls [-] QTY [+] and Line Total */}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.product.id, -1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-700 hover:bg-slate-100 font-bold cursor-pointer transition-colors"
                            title="Diminuer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-black px-2 text-slate-900 min-w-[20px] text-center">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.product.id, 1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#4F46E5] hover:bg-indigo-50 font-bold cursor-pointer transition-colors"
                            title="Augmenter"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Total de la ligne en gras */}
                        <span className="text-sm font-bold text-slate-900 min-w-[65px] text-right">
                          {formatMoney(item.unitPrice * item.quantity)}
                        </span>

                        {/* Bouton supprimer */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center cursor-pointer transition-colors"
                          title="Supprimer la ligne"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* FOOTER : SOUS-TOTAL, REMISE TOUJOURS VISIBLE, TOTAL 31PX, BOUTON ENCAISSER */}
              <div className="p-4 bg-white border-t border-slate-200 space-y-3 shadow-lg shrink-0">
                {/* POINT 6.4 : SOUS-TOTAL */}
                <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
                  <span>Sous-total</span>
                  <div className="flex items-center gap-1.5">
                    {discountAmount > 0 && (
                      <span className="line-through text-slate-400 font-semibold text-xs">
                        {formatMoney(cartTotal)}
                      </span>
                    )}
                    <span className="font-bold text-slate-900">{formatMoney(cartTotal)}</span>
                  </div>
                </div>

                {/* POINT 2 & 6.5 : LIGNE REMISE (TOUJOURS VISIBLE, MÊME PANIER VIDE) */}
                {discountAmount > 0 ? (
                  /* AVEC REMISE : fond #FEF2F2, hauteur 48px, rayon 11px */
                  <div className="h-[48px] px-3 rounded-[11px] bg-[#FEF2F2] border border-rose-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#DC2626]" />
                      <span className="text-[13.5px] font-[600] text-rose-950">
                        {discountMode === 'PERCENTAGE' && discountValue > 0
                          ? `Remise (${discountValue} %)`
                          : `Remise (${discountPercent} %)`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[14px] font-[750] text-[#DC2626] mr-1">
                        − {formatMoney(discountAmount)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsDiscountModalOpen(true)}
                        className="w-7 h-7 rounded-lg text-slate-500 hover:text-[#4F46E5] hover:bg-white flex items-center justify-center cursor-pointer transition-colors"
                        title="Modifier la remise"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDiscountAmount(0);
                          setDiscountMode('AMOUNT');
                          setDiscountValue(0);
                          setDiscountReason('');
                        }}
                        className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white flex items-center justify-center cursor-pointer transition-colors"
                        title="Retirer la remise"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  /* SANS REMISE : fond #F8FAFC, hauteur 48px, rayon 11px */
                  <div className="h-[48px] px-3 rounded-[11px] bg-[#F8FAFC] border border-slate-200/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[#4F46E5]" />
                      <span className="text-[13.5px] font-[600] text-slate-800">Remise</span>
                    </div>
                    <button
                      type="button"
                      disabled={cartTotal === 0}
                      onClick={() => cartTotal > 0 && setIsDiscountModalOpen(true)}
                      className="h-[34px] px-3 rounded-[9px] bg-[#EEF2FF] hover:bg-indigo-100 disabled:opacity-40 disabled:pointer-events-none text-[#4F46E5] font-[650] text-xs flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Ajouter une remise</span>
                    </button>
                  </div>
                )}

                {/* POINT 6.6 : TOTAL EN 31PX (HAUTEUR IMPORTANTE, POIDS MAXIMUM) */}
                <div className="pt-2 border-t border-slate-200 flex items-baseline justify-between">
                  <div>
                    <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block">
                      Total
                    </span>
                    {discountAmount > 0 && (
                      <span className="text-xs text-slate-400 line-through font-semibold">
                        {formatMoney(cartTotal)}
                      </span>
                    )}
                  </div>
                  <span className="text-[31px] font-black text-slate-900 tracking-tight leading-none">
                    {formatMoney(finalTotal)}
                  </span>
                </div>

                {/* POINT 6.7 : BOUTON ENCAISSER (HAUTEUR 52PX) */}
                <div>
                  <button
                    id="btn-pos-checkout"
                    type="button"
                    disabled={cart.length === 0 || !selectedCustomerId}
                    onClick={() => {
                      setCustomPaidAmount(finalTotal);
                      setPaymentType('FULL');
                      setStep('PAYMENT');
                    }}
                    className={`w-full h-[52px] rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                      cart.length === 0 || !selectedCustomerId
                        ? 'bg-[#94A3B8] text-white cursor-not-allowed opacity-100'
                        : 'bg-[#4F46E5] hover:bg-indigo-700 active:scale-[0.98] text-white shadow-md cursor-pointer'
                    }`}
                  >
                    <span>Encaisser {formatMoney(finalTotal)}</span>
                  </button>
                  {!selectedCustomerId && (
                    <p className="text-center text-xs font-semibold text-amber-700 mt-1.5">
                      Choisis d'abord un client
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2 : PAIEMENT */}
        {/* ========================================================================= */}
        {step === 'PAYMENT' && (
          <div className="flex-1 flex flex-col min-h-0 bg-slate-50 overflow-y-auto">
            <div className="p-4 sm:p-6 max-w-2xl mx-auto w-full space-y-5">
              {/* Carte Client en lecture seule avec bouton Changer */}
              {selectedCustomerObj && (
                <div className="h-[84px] min-h-[84px] rounded-[14px] bg-[#F0FDF4] border-l-4 border-l-[#16A34A] border-y border-r border-emerald-200/70 p-3 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 min-w-10 rounded-full flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-2xs ${getAvatarColor(
                        selectedCustomerObj.name
                      )}`}
                    >
                      {getInitials(selectedCustomerObj.name)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-[650] text-slate-900 truncate leading-snug">
                        {selectedCustomerObj.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {selectedCustomerObj.phone && selectedCustomerObj.phone !== 'Non renseigné' && (
                          <span className="text-[11px] text-slate-500 font-medium">
                            {selectedCustomerObj.phone}
                          </span>
                        )}
                        {selectedCustomerObj.totalDebt > 0 ? (
                          <span className="text-[10px] font-bold text-rose-700 bg-rose-100/90 px-2 py-0.5 rounded-md">
                            te doit déjà {formatMoney(selectedCustomerObj.totalDebt)}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                            à jour
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    id="btn-change-customer-step2"
                    type="button"
                    onClick={() => setIsCustomerPickerOpen(true)}
                    className="shrink-0 text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer px-2 py-1"
                  >
                    Changer
                  </button>
                </div>
              )}

              {/* Header Title & Total */}
              <div className="text-center space-y-1">
                <h3 className="text-lg sm:text-xl font-black text-slate-900">
                  Comment il paie ?
                </h3>
                <p className="text-xs font-semibold text-slate-500">
                  Total à encaisser :{' '}
                  <strong className="text-[#4F46E5] text-base">{formatMoney(finalTotal)}</strong>
                </p>
              </div>

              {/* 3 grands choix en boutons interactifs */}
              <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
                {/* 1. Il paie tout */}
                <button
                  id="btn-pay-full"
                  type="button"
                  onClick={() => {
                    setPaymentType('FULL');
                    setCustomPaidAmount(finalTotal);
                  }}
                  className={`py-4 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    paymentType === 'FULL'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-600/25 scale-[1.02]'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Check className="w-5 h-5" />
                  <span className="text-xs sm:text-sm font-black">Il paie tout</span>
                  <span className="text-[10px] opacity-80">(100% encaissé)</span>
                </button>

                {/* 2. Il paie une partie */}
                <button
                  id="btn-pay-partial"
                  type="button"
                  onClick={() => {
                    setPaymentType('PARTIAL');
                    setCustomPaidAmount(Math.round(finalTotal / 2));
                  }}
                  className={`py-4 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    paymentType === 'PARTIAL'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-lg shadow-amber-500/25 scale-[1.02]'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-xs sm:text-sm font-black">Il paie une partie</span>
                  <span className="text-[10px] opacity-80">(Acompte reçu)</span>
                </button>

                {/* 3. Il paie plus tard (Crédit) */}
                <button
                  id="btn-pay-later"
                  type="button"
                  onClick={() => {
                    setPaymentType('CREDIT');
                    setCustomPaidAmount(0);
                  }}
                  className={`py-4 px-2 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    paymentType === 'CREDIT'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-lg shadow-rose-600/25 scale-[1.02]'
                      : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <User className="w-5 h-5" />
                  <span className="text-xs sm:text-sm font-black">Il paie plus tard</span>
                  <span className="text-[10px] opacity-80">(0 F reçu)</span>
                </button>
              </div>

              {/* Saisie montant acompte si "Il paie une partie" */}
              {paymentType === 'PARTIAL' && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-amber-950">
                      Combien il te donne maintenant ?
                    </label>
                    <span className="text-xs font-bold text-amber-800">
                      Reste à régler : {formatMoney(remainingDebt)}
                    </span>
                  </div>

                  <MoneyInput
                    id="input-partial-paid"
                    value={customPaidAmount}
                    onChange={(val) => setCustomPaidAmount(val)}
                    placeholder="0"
                    autoFocus
                  />

                  <div className="flex gap-2">
                    {[500, 1000, 2000, 5000, 10000].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setCustomPaidAmount((prev) => Math.min(finalTotal, prev + q))}
                        className="flex-1 py-1.5 rounded-xl bg-white border border-amber-200 text-amber-900 text-xs font-bold hover:bg-amber-100 cursor-pointer"
                      >
                        +{q} F
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* RÉCAPITULATIF PERMANENT (avec possibilité de modifier la remise) */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-2.5 shadow-xs">
                <div className="flex justify-between items-center text-xs text-slate-500 font-medium">
                  <span>Sous-total articles</span>
                  <span className="font-semibold text-slate-700">{formatMoney(cartTotal)}</span>
                </div>

                {/* Remise récap */}
                <div className="flex justify-between items-center text-xs">
                  <span className={discountAmount > 0 ? 'font-bold text-rose-600' : 'text-slate-500'}>
                    {discountAmount > 0
                      ? `Remise (${discountMode === 'PERCENTAGE' && discountValue > 0 ? discountValue + ' %' : discountPercent + ' %'})`
                      : 'Remise'}
                  </span>
                  <div className="flex items-center gap-2">
                    {discountAmount > 0 && (
                      <span className="font-bold text-rose-600">− {formatMoney(discountAmount)}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsDiscountModalOpen(true)}
                      className="text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer"
                    >
                      {discountAmount > 0 ? 'Modifier' : '+ Ajouter'}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>Total final</span>
                  <span className="text-base text-[#4F46E5]">{formatMoney(finalTotal)}</span>
                </div>

                <div className="flex justify-between text-xs font-bold text-slate-800">
                  <span>Ce qu'il te donne maintenant</span>
                  <span className="text-emerald-600">{formatMoney(actualPaid)}</span>
                </div>

                {remainingDebt > 0 && (
                  <div className="pt-2 border-t border-rose-100 flex items-center justify-between text-rose-600 animate-in fade-in">
                    <span className="text-xs font-extrabold uppercase tracking-wide">
                      IL TE DEVRA ENCORE :
                    </span>
                    <span className="text-xl sm:text-2xl font-black text-rose-600">
                      {formatMoney(remainingDebt)}
                    </span>
                  </div>
                )}
              </div>

              {/* MOYEN DE PAIEMENT */}
              {paymentType !== 'CREDIT' && (
                <div className="space-y-2">
                  <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider block">
                    Mode d'encaissement
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'CASH', label: 'Espèces', icon: <Banknote className="w-4 h-4" /> },
                      { id: 'WAVE', label: 'Wave', icon: <Smartphone className="w-4 h-4 text-sky-400" /> },
                      { id: 'ORANGE_MONEY', label: 'Orange M.', icon: <Smartphone className="w-4 h-4 text-orange-500" /> },
                      { id: 'MTN', label: 'MTN MoMo', icon: <Smartphone className="w-4 h-4 text-yellow-500" /> },
                      { id: 'MOOV', label: 'Moov Money', icon: <Smartphone className="w-4 h-4 text-blue-500" /> },
                      { id: 'VIREMENT', label: 'Virement', icon: <CreditCard className="w-4 h-4" /> },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedPaymentMethod(m.id as PaymentMethod)}
                        className={`p-3 rounded-2xl border text-center transition-all cursor-pointer text-xs font-bold flex items-center justify-center gap-2 ${
                          selectedPaymentMethod === m.id
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs scale-[1.02]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {m.icon}
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Step Actions */}
            <div className="p-4 bg-white border-t border-slate-200 mt-auto flex items-center justify-between gap-3 shrink-0">
              <button
                id="btn-back-to-products"
                type="button"
                onClick={() => setStep('PRODUCTS')}
                className="py-3.5 px-4 rounded-2xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Modifier le panier</span>
              </button>

              <button
                id="btn-confirm-and-make-receipt"
                type="button"
                onClick={handleValidateSale}
                className="flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95 active:scale-[0.98] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-700/25 cursor-pointer transition-all"
              >
                <Receipt className="w-5 h-5" />
                <span>Valider la commande et faire le reçu</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* AUXILIARY MODALS */}
      {/* ========================================================================= */}
      {/* 1. WhatsApp Order Import Parser */}
      <WhatsAppOrderModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
        onApplyItems={(items) => {
          items.forEach((it) => {
            for (let i = 0; i < it.quantity; i++) {
              addToCart(it.product);
            }
          });
        }}
      />

      {/* 2. Barcode Scanner Viewfinder */}
      <BarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onProductScanned={(p) => addToCart(p)}
        onOpenQuickProductWithBarcode={(code) => {
          setScannerPreBarcode(code);
          setIsProductFormOpen(true);
        }}
      />

      {/* 3. POINT 5: SHARED PRODUCT CREATION FORM (Exact same component as Products page) */}
      <ProductFormModal
        isOpen={isProductFormOpen}
        initialBarcode={scannerPreBarcode}
        submitLabel="Créer et ajouter à la commande"
        onClose={() => setIsProductFormOpen(false)}
        onProductSaved={(p) => {
          addToCart(p);
          setIsProductFormOpen(false);
        }}
      />

      {/* 4. POINT 4: DISCOUNT MODAL (460px width, % or fixed, real-time math, chips) */}
      <DiscountModal
        isOpen={isDiscountModalOpen}
        subtotal={cartTotal}
        currentDiscount={discountAmount}
        initialMode={discountMode}
        initialPercent={discountValue}
        onClose={() => setIsDiscountModalOpen(false)}
        onApplyDiscount={(amount, mode, value, reason) => {
          setDiscountAmount(amount);
          setDiscountMode(mode);
          setDiscountValue(value);
          setDiscountReason(reason || '');
        }}
      />

      {/* 5. Service Modal */}
      <ServiceModal
        isOpen={isServiceModalOpen}
        onClose={() => setIsServiceModalOpen(false)}
        onAddService={(prod) => addToCart(prod)}
      />

      {/* 6. POINT 6: MANDATORY CUSTOMER PICKER MODAL */}
      <CustomerPickerModal
        isOpen={isCustomerPickerOpen}
        selectedCustomerId={selectedCustomerId}
        onClose={() => setIsCustomerPickerOpen(false)}
        onSelectCustomer={(cust) => {
          setSelectedCustomerId(cust.id);
        }}
      />
    </div>
  );
};
