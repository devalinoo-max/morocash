import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store,
  Receipt,
  Tag,
  ShoppingBag,
  Monitor,
  FolderTree,
  UserCheck,
  Check,
  AlertTriangle,
  Lock,
  Plus,
  Trash2,
  Download,
  ShieldAlert,
  Smartphone,
  LogOut,
  KeyRound,
  Printer,
  ChevronRight,
  HelpCircle,
  Eye,
  Info,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ShopLogoUploader } from './ShopLogoUploader';
import {
  ActivityType,
  ReceiptSettings,
  LabelFormat,
  LabelField,
  LabelTextSize,
  LabelCodeType,
  UserRole,
} from '../../types';
import { formatMoney, formatDate } from '../../utils/formatters';

// Timezone options
const TIMEZONES = [
  { value: 'Africa/Abidjan', label: 'Abidjan (UTC+0) — Côte d’Ivoire / Sénégal / Mali' },
  { value: 'Africa/Lagos', label: 'Lagos / Cotonou / Niamey (UTC+1)' },
  { value: 'Africa/Douala', label: 'Douala / Libreville / Yaoundé (UTC+1)' },
  { value: 'Africa/Kinshasa', label: 'Kinshasa (UTC+1)' },
  { value: 'Africa/Casablanca', label: 'Casablanca (UTC+1)' },
  { value: 'Africa/Dakar', label: 'Dakar (UTC+0)' },
  { value: 'Africa/Ouagadougou', label: 'Ouagadougou (UTC+0)' },
  { value: 'Africa/Brazzaville', label: 'Brazzaville (UTC+1)' },
];

export const SettingsPage: React.FC = () => {
  const {
    settings,
    updateSettings,
    updateCashRegisterMode,
    products,
    expenses,
    showToast,
    sales,
    customers,
    closeAccount,
    mySessions,
    fetchMySessions,
    revokeMySession,
    revokeOtherMySessions,
  } = useApp();

  const isOwner = settings.role === 'OWNER';
  const isSeller = settings.role === 'SELLER';
  const isAccountant = settings.role === 'ACCOUNTANT';

  // Navigation anchors based on user role (Section 10)
  // Propriétaire: all 7 sections
  // Vendeur: only "Mon compte"
  // Comptable: "Mon compte" and "Mes catégories"
  const allSections = [
    { id: 'boutique', label: 'Ma boutique', icon: Store, allowedRoles: ['OWNER'] },
    { id: 'recus', label: 'Mes reçus', icon: Receipt, allowedRoles: ['OWNER'] },
    { id: 'etiquettes', label: 'Mes étiquettes', icon: Tag, allowedRoles: ['OWNER'] },
    { id: 'vente', label: 'Ma façon de vendre', icon: ShoppingBag, allowedRoles: ['OWNER'] },
    { id: 'affichage', label: 'Mon affichage', icon: Monitor, allowedRoles: ['OWNER'] },
    { id: 'categories', label: 'Mes catégories', icon: FolderTree, allowedRoles: ['OWNER', 'ACCOUNTANT'] },
    { id: 'compte', label: 'Mon compte', icon: UserCheck, allowedRoles: ['OWNER', 'SELLER', 'ACCOUNTANT'] },
  ];

  const visibleSections = useMemo(() => {
    return allSections.filter((s) => s.allowedRoles.includes(settings.role));
  }, [settings.role]);

  const [activeSection, setActiveSection] = useState<string>(
    visibleSections[0]?.id || 'compte'
  );

  // Transient saved notifications per field ID (2-second timer)
  const [savedBadges, setSavedBadges] = useState<Record<string, boolean>>({});
  const timeoutRefs = useRef<Record<string, NodeJS.Timeout>>({});

  const triggerSavedFeedback = (fieldKey: string) => {
    if (timeoutRefs.current[fieldKey]) {
      clearTimeout(timeoutRefs.current[fieldKey]);
    }
    setSavedBadges((prev) => ({ ...prev, [fieldKey]: true }));
    timeoutRefs.current[fieldKey] = setTimeout(() => {
      setSavedBadges((prev) => ({ ...prev, [fieldKey]: false }));
    }, 2000);
  };

  // Generic handler for auto-saving on blur / change
  const handleFieldSave = (key: keyof typeof settings, value: any, fieldKey: string) => {
    updateSettings({ [key]: value });
    triggerSavedFeedback(fieldKey);
  };

  // Contrairement à handleFieldSave (purement local), le mode de caisse est
  // réellement persisté côté serveur (createOrder/createManualMovement en
  // dépendent) — le badge "enregistré" n'apparaît qu'après confirmation.
  const handleCashRegisterModeSave = async (mode: 'LIBRE' | 'STRICT') => {
    const success = await updateCashRegisterMode(mode);
    if (success) {
      triggerSavedFeedback('cashRegisterMode');
    }
  };

  // Nested receipt settings helper
  const handleReceiptFieldSave = (field: keyof ReceiptSettings, value: any) => {
    const current = settings.receiptSettings || {
      showLogo: true,
      showShopName: true,
      showPhone: true,
      showAddress: false,
      showSellerName: true,
      showCustomerName: true,
      showQrCode: false,
      showMessage: true,
      showWatermark: true,
      defaultFormat: 'TEXT',
      prefix: 'CMD',
    };
    const updated = { ...current, [field]: value };
    updateSettings({ receiptSettings: updated });
    triggerSavedFeedback(`receipt_${field}`);
  };

  // Nested label settings helper
  const handleLabelFieldSave = (field: string, value: any) => {
    const current = settings.labelSettings || {
      format: '24_63x34',
      champs: ['nom', 'prix', 'code', 'boutique'],
      tailleTexte: 'NORMAL',
      typeCode: 'QR',
      traitsDecoupe: true,
    };
    const updated = { ...current, [field]: value };
    updateSettings({ labelSettings: updated });
    triggerSavedFeedback(`label_${field}`);
  };

  // Activity type confirmation modal state
  const [pendingActivityType, setPendingActivityType] = useState<ActivityType | null>(null);

  // Categories management
  const [newProductCatInput, setNewProductCatInput] = useState('');
  const [newExpenseCatInput, setNewExpenseCatInput] = useState('');
  const [editingCat, setEditingCat] = useState<{ type: 'product' | 'expense'; index: number; val: string } | null>(null);

  const productCategories = settings.productCategories || [
    'Alimentation',
    'Boissons',
    'Entretien',
    'Accessoires',
    'Services',
  ];

  const expenseCategories = settings.expenseCategories || [
    'Achat marchandise',
    'Transport',
    'Publicité',
    'Loyer',
    'Facture CIE / Électricité',
    'Autre charge',
  ];

  // Count items using each category
  const getProductCategoryUsage = (catName: string) => {
    return products.filter((p) => p.category === catName).length;
  };

  const getExpenseCategoryUsage = (catName: string) => {
    return expenses.filter((e) => e.category === catName).length;
  };

  const handleAddProductCategory = () => {
    const trimmed = newProductCatInput.trim();
    if (!trimmed) return;
    if (productCategories.includes(trimmed)) {
      showToast('Cette catégorie existe déjà', 'error');
      return;
    }
    const updated = [...productCategories, trimmed];
    updateSettings({ productCategories: updated });
    setNewProductCatInput('');
    triggerSavedFeedback('product_categories');
    showToast(`Catégorie "${trimmed}" ajoutée`, 'success');
  };

  const handleAddExpenseCategory = () => {
    const trimmed = newExpenseCatInput.trim();
    if (!trimmed) return;
    if (expenseCategories.includes(trimmed)) {
      showToast('Cette catégorie existe déjà', 'error');
      return;
    }
    const updated = [...expenseCategories, trimmed];
    updateSettings({ expenseCategories: updated });
    setNewExpenseCatInput('');
    triggerSavedFeedback('expense_categories');
    showToast(`Catégorie "${trimmed}" ajoutée`, 'success');
  };

  const handleDeleteCategory = (type: 'product' | 'expense', name: string) => {
    if (type === 'expense' && name === 'Achat marchandise') {
      showToast('Cette catégorie système est protégée et ne peut pas être supprimée', 'error');
      return;
    }

    if (type === 'product') {
      const usage = getProductCategoryUsage(name);
      if (usage > 0) {
        showToast(`Impossible de supprimer : utilisée par ${usage} produit${usage > 1 ? 's' : ''}`, 'error');
        return;
      }
      const updated = productCategories.filter((c) => c !== name);
      updateSettings({ productCategories: updated });
      triggerSavedFeedback('product_categories');
      showToast(`Catégorie "${name}" supprimée`, 'info');
    } else {
      const usage = getExpenseCategoryUsage(name);
      if (usage > 0) {
        showToast(`Impossible de supprimer : utilisée par ${usage} dépense${usage > 1 ? 's' : ''}`, 'error');
        return;
      }
      const updated = expenseCategories.filter((c) => c !== name);
      updateSettings({ expenseCategories: updated });
      triggerSavedFeedback('expense_categories');
      showToast(`Catégorie "${name}" supprimée`, 'info');
    }
  };

  const handleSaveRenameCategory = () => {
    if (!editingCat) return;
    const { type, index, val } = editingCat;
    const trimmed = val.trim();
    if (!trimmed) {
      setEditingCat(null);
      return;
    }

    if (type === 'product') {
      const updated = [...productCategories];
      updated[index] = trimmed;
      updateSettings({ productCategories: updated });
      triggerSavedFeedback('product_categories');
    } else {
      const updated = [...expenseCategories];
      updated[index] = trimmed;
      updateSettings({ expenseCategories: updated });
      triggerSavedFeedback('expense_categories');
    }
    setEditingCat(null);
    showToast('Catégorie renommée', 'success');
  };

  // Mes appareils connectés — sessions réelles (voir AppContext.mySessions)
  useEffect(() => {
    fetchMySessions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const describeSession = (ua: string | null): string => {
    if (!ua) return 'Appareil inconnu';
    let os = 'Ordinateur';
    if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iPhone / iPad';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS/i.test(ua)) os = 'Mac';
    else if (/Linux/i.test(ua)) os = 'Linux';
    let browser = '';
    if (/Edg/i.test(ua)) browser = 'Edge';
    else if (/Chrome/i.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua)) browser = 'Safari';
    return browser ? `${os} · ${browser}` : os;
  };

  // PIN code change state
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSuccess, setPinSuccess] = useState(false);

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinCurrent !== settings.pinCode) {
      showToast('Ancien code secret incorrect', 'error');
      return;
    }
    if (pinNew.length !== 6) {
      showToast('Le nouveau code doit comporter exactement 6 chiffres', 'error');
      return;
    }
    if (pinNew !== pinConfirm) {
      showToast('La confirmation ne correspond pas', 'error');
      return;
    }
    updateSettings({ pinCode: pinNew });
    setPinCurrent('');
    setPinNew('');
    setPinConfirm('');
    setPinSuccess(true);
    setTimeout(() => setPinSuccess(false), 3000);
    showToast('Code secret mis à jour avec succès', 'success');
  };

  // Delete account confirmation steps
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isClosingAccount, setIsClosingAccount] = useState(false);

  const handleConfirmCloseAccount = async () => {
    setIsClosingAccount(true);
    const success = await closeAccount();
    setIsClosingAccount(false);
    if (success) {
      setDeleteStep(0);
      setDeleteConfirmationText('');
    }
  };

  // Export full data (JSON + CSV)
  const handleExportAllData = () => {
    const fullBackup = {
      exportDate: new Date().toISOString(),
      shop: settings,
      sales,
      products,
      customers,
      expenses,
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `morocash_sauvegarde_${settings.shopName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Téléchargement de la sauvegarde lancé', 'success');
  };

  // Smooth scroll to section
  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const el = document.getElementById(`section-${sectionId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Inline "Enregistré" badge component
  const SavedBadge: React.FC<{ fieldKey: string }> = ({ fieldKey }) => {
    if (!savedBadges[fieldKey]) return null;
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 animate-in fade-in zoom-in-95 duration-150 shrink-0">
        <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
        <span>Enregistré</span>
      </span>
    );
  };

  return (
    <div id="settings-page" className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>Réglages</span>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200/80 uppercase tracking-wider">
              {settings.role === 'OWNER' ? 'Propriétaire' : settings.role === 'ACCOUNTANT' ? 'Comptable' : 'Vendeur'}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Sauvegarde automatique à la sortie de chaque champ. Aucune validation manuelle requise.
          </p>
        </div>

        {/* Development reset button (Only visible if NODE_ENV !== 'production') */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="text-right">
            <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded border border-amber-200">
              Environnement de dev
            </span>
          </div>
        )}
      </div>

      {/* Main Layout: Anchors Navigation + Sections Content */}
      <div className="flex flex-col lg:flex-row items-start gap-8">
        {/* Mobile Horizontal Scrolling Tabs */}
        <div className="lg:hidden w-full overflow-x-auto pb-2 scrollbar-none flex items-center gap-2 sticky top-14 bg-slate-50/95 backdrop-blur-xs z-20 py-2 border-b border-slate-200">
          {visibleSections.map((sec) => {
            const Icon = sec.icon;
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{sec.label}</span>
              </button>
            );
          })}
        </div>

        {/* Desktop Sticky Sidebar Anchors */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-20 space-y-1">
          <div className="p-2 bg-white rounded-2xl border border-slate-200/80 shadow-2xs space-y-1">
            <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              Sections
            </div>
            {visibleSections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => scrollToSection(sec.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-left ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <span className="truncate">{sec.label}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-200' : 'text-slate-300'}`} />
                </button>
              );
            })}
          </div>
        </aside>

        {/* Sections Content Column */}
        <div className="flex-1 w-full space-y-10">
          {/* ========================================================================= */}
          {/* SECTION 1: MA BOUTIQUE (OWNER ONLY) */}
          {/* ========================================================================= */}
          {isOwner && (
            <section
              id="section-boutique"
              className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">Ma boutique</h2>
                    <p className="text-xs text-slate-400 font-medium">Identité visuelle, coordonnées et coordonnées de contact</p>
                  </div>
                </div>
              </div>

              {/* 1. Logo uploader */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">Logo de la boutique</label>
                <ShopLogoUploader
                  logoUrl={settings.logoUrl}
                  logoTransparentUrl={settings.logoTransparentUrl}
                  shopName={settings.shopName}
                  onLogoChange={(newLogoUrl, newTransparentUrl) => {
                    updateSettings({
                      logoUrl: newLogoUrl,
                      logoTransparentUrl: newTransparentUrl,
                    });
                    triggerSavedFeedback('shop_logo');
                  }}
                />
                <SavedBadge fieldKey="shop_logo" />
              </div>

              {/* 2. Nom de la boutique */}
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Nom de la boutique <span className="text-rose-500">*</span>
                  </label>
                  <SavedBadge fieldKey="shopName" />
                </div>
                <input
                  type="text"
                  defaultValue={settings.shopName}
                  onBlur={(e) => handleFieldSave('shopName', e.target.value.trim() || 'Ma Boutique', 'shopName')}
                  placeholder="Ex: Boutique Étoile d’Afrique"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                />
              </div>

              {/* 3. Type d'activité */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Type d'activité</label>
                  <SavedBadge fieldKey="activityType" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      type: 'COMMERCE' as ActivityType,
                      title: 'Commerce',
                      desc: 'Tu vends des produits que tu stockes',
                    },
                    {
                      type: 'SERVICES' as ActivityType,
                      title: 'Services',
                      desc: 'Tu vends ton travail, sans stock',
                    },
                    {
                      type: 'MIXTE' as ActivityType,
                      title: 'Les deux',
                      desc: 'Tu vends des produits et des services',
                    },
                  ].map((item) => {
                    const isSelected = settings.activityType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => {
                          if (item.type === 'SERVICES' && settings.activityType !== 'SERVICES') {
                            setPendingActivityType('SERVICES');
                          } else {
                            handleFieldSave('activityType', item.type, 'activityType');
                          }
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                            {item.title}
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 4. Ville, Téléphone, WhatsApp, Adresse */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Ville ou quartier */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Ville ou quartier</label>
                    <SavedBadge fieldKey="city" />
                  </div>
                  <input
                    type="text"
                    defaultValue={settings.city}
                    onBlur={(e) => handleFieldSave('city', e.target.value.trim(), 'city')}
                    placeholder="Ex: Abidjan (Cocody)"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                  />
                </div>

                {/* Téléphone (reçus) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Numéro de téléphone <span className="text-[10px] text-slate-400 font-normal">(sur les reçus)</span>
                    </label>
                    <SavedBadge fieldKey="telephone" />
                  </div>
                  <input
                    type="tel"
                    defaultValue={settings.telephone || settings.ownerPhone}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      handleFieldSave('telephone', val, 'telephone');
                      handleFieldSave('ownerPhone', val, 'ownerPhone');
                    }}
                    placeholder="Ex: +225 07 08 09 10 11"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Numéro WhatsApp <span className="text-[10px] text-slate-400 font-normal">(si différent)</span>
                    </label>
                    <SavedBadge fieldKey="whatsapp" />
                  </div>
                  <input
                    type="tel"
                    defaultValue={settings.whatsapp || ''}
                    onBlur={(e) => handleFieldSave('whatsapp', e.target.value.trim(), 'whatsapp')}
                    placeholder="Ex: +225 05 06 07 08 09"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                  />
                </div>

                {/* Adresse */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">
                      Adresse <span className="text-[10px] text-slate-400 font-normal">(facultatif, sur les reçus)</span>
                    </label>
                    <SavedBadge fieldKey="adresse" />
                  </div>
                  <input
                    type="text"
                    defaultValue={settings.adresse || ''}
                    onBlur={(e) => handleFieldSave('adresse', e.target.value.trim(), 'adresse')}
                    placeholder="Ex: Rue des Jardins, en face de la pharmacie"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                  />
                </div>
              </div>

              {/* 5. Devise (grisée) & Fuseau horaire */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>Devise</span>
                    <span className="text-[10px] text-slate-400 font-normal">(non modifiable)</span>
                  </label>
                  <input
                    type="text"
                    value="Franc CFA (FCFA)"
                    disabled
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm font-bold cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Fuseau horaire</label>
                    <SavedBadge fieldKey="fuseauHoraire" />
                  </div>
                  <select
                    defaultValue={settings.fuseauHoraire || 'Africa/Abidjan'}
                    onChange={(e) => handleFieldSave('fuseauHoraire', e.target.value, 'fuseauHoraire')}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* SECTION 2: MES REÇUS (OWNER ONLY) */}
          {/* ========================================================================= */}
          {isOwner && (
            <section
              id="section-recus"
              className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">Mes reçus</h2>
                    <p className="text-xs text-slate-400 font-medium">Contenu imprimé et partagé aux clients après chaque vente</p>
                  </div>
                </div>
              </div>

              {/* Message personnalisé */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Message personnalisé <span className="text-[10px] text-slate-400 font-normal">(en bas de chaque reçu)</span>
                  </label>
                  <SavedBadge fieldKey="receiptMessage" />
                </div>
                <input
                  type="text"
                  defaultValue={settings.receiptMessage}
                  onBlur={(e) => handleFieldSave('receiptMessage', e.target.value.trim(), 'receiptMessage')}
                  placeholder="Ex: Merci pour votre confiance ! À bientôt."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                />
              </div>

              {/* Ce qui apparaît sur le reçu + Aperçu en direct */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
                {/* Left: Toggles */}
                <div className="lg:col-span-7 space-y-3">
                  <label className="text-xs font-bold text-slate-700 block mb-2">
                    Éléments affichés sur le reçu
                  </label>

                  {[
                    { key: 'showLogo' as keyof ReceiptSettings, label: 'Logo de la boutique' },
                    { key: 'showShopName' as keyof ReceiptSettings, label: 'Nom de la boutique' },
                    { key: 'showPhone' as keyof ReceiptSettings, label: 'Numéro de téléphone' },
                    { key: 'showAddress' as keyof ReceiptSettings, label: 'Adresse physique' },
                    { key: 'showSellerName' as keyof ReceiptSettings, label: 'Nom du vendeur' },
                    { key: 'showCustomerName' as keyof ReceiptSettings, label: 'Nom du client' },
                    { key: 'showQrCode' as keyof ReceiptSettings, label: 'QR code du numéro de commande' },
                    { key: 'showMessage' as keyof ReceiptSettings, label: 'Message personnalisé' },
                    { key: 'showWatermark' as keyof ReceiptSettings, label: 'Mention "Reçu généré avec MoroCash"' },
                  ].map((item) => {
                    const isChecked = settings.receiptSettings ? settings.receiptSettings[item.key] !== false : true;
                    return (
                      <label
                        key={item.key}
                        className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        <span className="text-xs font-bold text-slate-800">{item.label}</span>
                        <div className="flex items-center gap-2">
                          <SavedBadge fieldKey={`receipt_${item.key}`} />
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => handleReceiptFieldSave(item.key, e.target.checked)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Right: Live mini receipt preview */}
                <div className="lg:col-span-5 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex flex-col justify-between">
                  <div className="space-y-3">
                    <span className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider block">
                      Aperçu en direct
                    </span>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs font-mono text-[11px] text-slate-800 space-y-2.5">
                      {/* Logo & header */}
                      <div className="text-center pb-2 border-b border-dashed border-slate-200">
                        {settings.receiptSettings?.showLogo !== false && (
                          <div className="w-8 h-8 mx-auto mb-1 rounded bg-slate-900 text-white flex items-center justify-center overflow-hidden">
                            {settings.logoUrl ? (
                              <img src={settings.logoUrl} alt="Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                            ) : (
                              <Store className="w-4 h-4" />
                            )}
                          </div>
                        )}
                        {settings.receiptSettings?.showShopName !== false && (
                          <div className="font-extrabold text-xs uppercase font-sans">{settings.shopName}</div>
                        )}
                        {settings.receiptSettings?.showAddress && settings.adresse && (
                          <div className="text-[10px] text-slate-400 font-sans">{settings.adresse}</div>
                        )}
                        {settings.receiptSettings?.showPhone !== false && (
                          <div className="text-[10px] text-slate-500 font-sans">
                            Tel : {settings.telephone || settings.ownerPhone}
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="space-y-1 text-[10.5px] pb-2 border-b border-dashed border-slate-200">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Réf :</span>
                          <span className="font-bold">{settings.receiptSettings?.prefix || 'CMD'}-2026-0042</span>
                        </div>
                        {settings.receiptSettings?.showCustomerName !== false && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Client :</span>
                            <span className="font-bold">Awa Diallo</span>
                          </div>
                        )}
                        {settings.receiptSettings?.showSellerName !== false && (
                          <div className="flex justify-between">
                            <span className="text-slate-400">Vendeur :</span>
                            <span>{settings.ownerName || 'Vendeur'}</span>
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div className="space-y-1 text-[10.5px] pb-2 border-b border-dashed border-slate-200">
                        <div className="flex justify-between">
                          <span>1x Riz Parfumé 5kg</span>
                          <span className="font-bold">4 500 F</span>
                        </div>
                        <div className="flex justify-between font-bold text-xs pt-1 border-t border-slate-100">
                          <span>TOTAL PAYÉ</span>
                          <span className="text-indigo-600 font-sans">4 500 FCFA</span>
                        </div>
                      </div>

                      {/* Custom msg */}
                      {settings.receiptSettings?.showMessage !== false && settings.receiptMessage && (
                        <div className="text-center italic text-[10px] text-slate-400 font-sans">
                          "{settings.receiptMessage}"
                        </div>
                      )}

                      {/* Watermark */}
                      {settings.receiptSettings?.showWatermark !== false && (
                        <div className="text-center text-[9px] text-slate-400 font-sans">
                          Reçu généré avec MoroCash
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Format d'envoi par défaut & Préfixe numérotation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
                {/* Format d'envoi */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Format d'envoi par défaut</label>
                    <SavedBadge fieldKey="receipt_defaultFormat" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
                    {(['TEXT', 'IMAGE', 'PDF'] as const).map((fmt) => {
                      const isSel = (settings.receiptSettings?.defaultFormat || 'TEXT') === fmt;
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => handleReceiptFieldSave('defaultFormat', fmt)}
                          className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isSel ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {fmt === 'TEXT' ? 'Texte' : fmt === 'IMAGE' ? 'Image' : 'PDF'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Préfixe numérotation */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Numérotation des commandes</label>
                    <SavedBadge fieldKey="receipt_prefix" />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      defaultValue={settings.receiptSettings?.prefix || 'CMD'}
                      onBlur={(e) => handleReceiptFieldSave('prefix', e.target.value.trim().toUpperCase() || 'CMD')}
                      maxLength={6}
                      className="w-28 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm font-mono font-bold uppercase focus:ring-2 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-500">
                      Prochain numéro : <strong className="text-slate-900 font-mono">{settings.receiptSettings?.prefix || 'CMD'}-2026-0043</strong>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* SECTION 3: MES ÉTIQUETTES (OWNER ONLY) */}
          {/* ========================================================================= */}
          {isOwner && (
            <section
              id="section-etiquettes"
              className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">Mes étiquettes</h2>
                    <p className="text-xs text-slate-400 font-medium">Réglages par défaut mémorisés pour l'impression de codes-barres</p>
                  </div>
                </div>
              </div>

              {/* Format de planche par défaut */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Format de planche par défaut</label>
                  <SavedBadge fieldKey="label_format" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { id: '24_63x34' as LabelFormat, name: 'A4 • 24 étiquettes (63.5 × 33.9 mm)' },
                    { id: '21_70x42' as LabelFormat, name: 'A4 • 21 étiquettes (70 × 42.4 mm)' },
                    { id: '12_105x48' as LabelFormat, name: 'A4 • 12 étiquettes (105 × 48 mm)' },
                    { id: '65_38x21' as LabelFormat, name: 'A4 • 65 petites (38 × 21.2 mm)' },
                    { id: 'thermal_58' as LabelFormat, name: 'Thermique continue (58 mm)' },
                  ].map((f) => {
                    const isSel = (settings.labelSettings?.format || '24_63x34') === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleLabelFieldSave('format', f.id)}
                        className={`p-3 rounded-xl border text-left text-xs font-bold transition-all cursor-pointer ${
                          isSel
                            ? 'border-indigo-600 bg-indigo-50/50 text-indigo-950 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        {f.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Ce qui apparaît sur l'étiquette */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Champs affichés sur les étiquettes</label>
                  <SavedBadge fieldKey="label_champs" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'nom' as LabelField, label: 'Nom produit' },
                    { id: 'prix' as LabelField, label: 'Prix de vente' },
                    { id: 'code' as LabelField, label: 'Code-barres / QR' },
                    { id: 'boutique' as LabelField, label: 'Nom boutique' },
                    { id: 'logo' as LabelField, label: 'Logo' },
                    { id: 'stock' as LabelField, label: 'Quantité stock' },
                    { id: 'unite' as LabelField, label: 'Unité (kg/pcs)' },
                    { id: 'dateImpression' as LabelField, label: 'Date impression' },
                  ].map((field) => {
                    const currentChamps = settings.labelSettings?.champs || ['nom', 'prix', 'code', 'boutique'];
                    const isChecked = currentChamps.includes(field.id);
                    return (
                      <label
                        key={field.id}
                        className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            let updated: LabelField[];
                            if (e.target.checked) {
                              updated = [...currentChamps, field.id];
                            } else {
                              updated = currentChamps.filter((c) => c !== field.id);
                            }
                            handleLabelFieldSave('champs', updated);
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <span className="text-xs font-medium text-slate-700">{field.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Taille du texte + Type de code + Traits de découpe */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                {/* Taille texte */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Taille du texte</label>
                    <SavedBadge fieldKey="label_tailleTexte" />
                  </div>
                  <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
                    {(['PETIT', 'NORMAL', 'GRAND'] as LabelTextSize[]).map((sz) => {
                      const isSel = (settings.labelSettings?.tailleTexte || 'NORMAL') === sz;
                      return (
                        <button
                          key={sz}
                          type="button"
                          onClick={() => handleLabelFieldSave('tailleTexte', sz)}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isSel ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {sz === 'PETIT' ? 'Petit' : sz === 'NORMAL' ? 'Normal' : 'Grand'}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Type de code */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">Type de code</label>
                    <SavedBadge fieldKey="label_typeCode" />
                  </div>
                  <select
                    value={settings.labelSettings?.typeCode || 'QR'}
                    onChange={(e) => handleLabelFieldSave('typeCode', e.target.value as LabelCodeType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="QR">QR MoroCash (Recommandé)</option>
                    <option value="BARCODE">Code-barres EAN / Code 128</option>
                    <option value="BOTH">Les deux</option>
                  </select>
                </div>

                {/* Traits de découpe */}
                <div className="space-y-1.5 flex flex-col justify-end">
                  <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                    <span className="text-xs font-bold text-slate-700">Traits de découpe</span>
                    <input
                      type="checkbox"
                      checked={settings.labelSettings?.traitsDecoupe !== false}
                      onChange={(e) => handleLabelFieldSave('traitsDecoupe', e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Bouton imprimer page d'essai */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    showToast("Génération d'une page d'essai d'étiquettes...", 'info');
                    window.print();
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimer une page d'essai</span>
                </button>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* SECTION 4: MA FAÇON DE VENDRE (OWNER ONLY) */}
          {/* ========================================================================= */}
          {isOwner && (
            <section
              id="section-vente"
              className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">Ma façon de vendre</h2>
                    <p className="text-xs text-slate-400 font-medium">Règles métier, plafonds vendeurs, gestion des stocks et de la caisse</p>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {/* 1. Remise maximale qu'un vendeur peut accorder */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-900">
                          Remise maximale qu'un vendeur peut accorder
                        </label>
                        <SavedBadge fieldKey="remiseMaxVendeur" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Au-delà, ton vendeur devra te demander son accord pour valider. (0 % = remises interdites aux vendeurs)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={settings.remiseMaxVendeur ?? 0}
                        onBlur={(e) => {
                          const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                          handleFieldSave('remiseMaxVendeur', val, 'remiseMaxVendeur');
                        }}
                        className="w-24 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-sm text-right focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-sm font-bold text-slate-600">%</span>
                    </div>
                  </div>
                </div>

                {/* 2. Autoriser la vente quand le stock est à zéro */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-900">
                        Autoriser la vente quand le stock est à zéro
                      </label>
                      <SavedBadge fieldKey="autoriserStockNegatif" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Recommandé. Tu vends souvent au comptoir avant d'avoir noté ton entrée de stock dans l'application.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoriserStockNegatif !== false}
                    onChange={(e) => handleFieldSave('autoriserStockNegatif', e.target.checked, 'autoriserStockNegatif')}
                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                </div>

                {/* 3. Écart de comptage qui demande une explication */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-900">
                          À partir de combien d'unités manquantes veux-tu une explication ?
                        </label>
                        <SavedBadge fieldKey="seuilEcartComptage" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Défaut : 5 unités. Lors du comptage, si l'écart dépasse ce seuil, une note explicative est demandée.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        defaultValue={settings.seuilEcartComptage ?? 5}
                        onBlur={(e) => {
                          const val = Math.max(1, parseInt(e.target.value, 10) || 5);
                          handleFieldSave('seuilEcartComptage', val, 'seuilEcartComptage');
                        }}
                        className="w-24 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-sm text-right focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-600">unités</span>
                    </div>
                  </div>
                </div>

                {/* 4. Dépense automatique à chaque réception de marchandise */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-900">
                        Créer une dépense automatique à chaque réception de marchandise
                      </label>
                      <SavedBadge fieldKey="depenseAutoReception" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Ne décoche que si tu notes tes achats de stock manuellement dans le carnet des dépenses.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.depenseAutoReception !== false}
                    onChange={(e) => handleFieldSave('depenseAutoReception', e.target.checked, 'depenseAutoReception')}
                    className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                  />
                </div>

                {/* 5. Fond de caisse habituel */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-900">
                          Fond de caisse habituel
                        </label>
                        <SavedBadge fieldKey="fondCaisseHabituel" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Montant proposé par défaut chaque matin à l'ouverture de la caisse.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        defaultValue={settings.fondCaisseHabituel ?? 10000}
                        onBlur={(e) => {
                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                          handleFieldSave('fondCaisseHabituel', val, 'fondCaisseHabituel');
                        }}
                        className="w-32 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-sm text-right focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-slate-600">FCFA</span>
                    </div>
                  </div>
                </div>

                {/* 6. Mode de caisse */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-bold text-slate-900">
                        Mode de caisse
                      </label>
                      <SavedBadge fieldKey="cashRegisterMode" />
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Libre : tu encaisses directement, sans jamais ouvrir/fermer ta caisse. Stricte : tu dois l'ouvrir le matin et la fermer le soir avant de pouvoir encaisser un paiement.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCashRegisterModeSave('LIBRE')}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-bold ${
                        (settings.cashRegisterMode ?? 'LIBRE') === 'LIBRE'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Libre (recommandé)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCashRegisterModeSave('STRICT')}
                      className={`p-3 rounded-xl border text-center transition-all cursor-pointer text-xs font-bold ${
                        settings.cashRegisterMode === 'STRICT'
                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Stricte (ouverture/fermeture)
                    </button>
                  </div>
                </div>

                {/* 7. Rappel fermeture caisse — pertinent seulement en mode Stricte */}
                {settings.cashRegisterMode === 'STRICT' && (
                  <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-900">
                          Me rappeler de fermer ma caisse le soir
                        </label>
                        <SavedBadge fieldKey="rappelFermetureCaisse" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Notification d'alerte pour clôturer les espèces avant de quitter la boutique.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="time"
                        defaultValue={settings.rappelFermetureCaisse || '20:00'}
                        onBlur={(e) => handleFieldSave('rappelFermetureCaisse', e.target.value, 'rappelFermetureCaisse')}
                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-900 font-bold text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* SECTION 5: MON AFFICHAGE (OWNER ONLY) */}
          {/* ========================================================================= */}
          {isOwner && (
            <section
              id="section-affichage"
              className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Monitor className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">Mon affichage</h2>
                    <p className="text-xs text-slate-400 font-medium">Préférences visuelles de l'accueil et du tableau de bord</p>
                  </div>
                </div>
              </div>

              {/* Mode Tableau de bord : Simple | Détaillé */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Vue du tableau de bord</label>
                  <SavedBadge fieldKey="dashboardMode" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    {
                      id: 'SIMPLE' as const,
                      title: 'Simple',
                      desc: "Juste l'essentiel : ce que tu as gagné et trois chiffres clés.",
                    },
                    {
                      id: 'DETAILED' as const,
                      title: 'Détaillé',
                      desc: 'Tout : graphiques horaires, alertes de stock et dernières commandes.',
                    },
                  ].map((mode) => {
                    const isSel = (settings.dashboardMode || 'SIMPLE') === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => handleFieldSave('dashboardMode', mode.id, 'dashboardMode')}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                          isSel
                            ? 'border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-bold ${isSel ? 'text-indigo-900' : 'text-slate-900'}`}>
                            {mode.title}
                          </span>
                          {isSel && <Check className="w-4 h-4 text-indigo-600" />}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{mode.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Période affichée par défaut */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Période affichée par défaut</label>
                  <SavedBadge fieldKey="periodeParDefaut" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-slate-100 rounded-xl">
                  {[
                    { id: 'TODAY' as const, label: "Aujourd'hui" },
                    { id: 'YESTERDAY' as const, label: 'Hier' },
                    { id: 'WEEK' as const, label: 'Cette semaine' },
                    { id: 'MONTH' as const, label: 'Ce mois' },
                  ].map((p) => {
                    const isSel = (settings.periodeParDefaut || 'TODAY') === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleFieldSave('periodeParDefaut', p.id, 'periodeParDefaut')}
                        className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSel ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Comparer avec la période précédente */}
              <div className="pt-2">
                <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Comparer automatiquement avec la période précédente
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      Affiche l'écart (en plus ou en moins) par rapport à la veille ou la semaine dernière.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <SavedBadge fieldKey="comparerParDefaut" />
                    <input
                      type="checkbox"
                      checked={settings.comparerParDefaut !== false}
                      onChange={(e) => handleFieldSave('comparerParDefaut', e.target.checked, 'comparerParDefaut')}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                  </div>
                </label>
              </div>

              {/* Langue */}
              <div className="space-y-1.5 pt-2">
                <label className="text-xs font-bold text-slate-700 block">Langue de l'application</label>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
                    Français (Actif)
                  </div>
                  <span className="text-xs text-slate-400 italic">
                    Dioula, Baoulé, Wolof et Anglais bientôt disponibles.
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* SECTION 6: MES CATÉGORIES (OWNER + ACCOUNTANT) */}
          {/* ========================================================================= */}
          {(isOwner || isAccountant) && (
            <section
              id="section-categories"
              className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <FolderTree className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-slate-900">Mes catégories</h2>
                    <p className="text-xs text-slate-400 font-medium">Organisation de vos articles et classification des dépenses</p>
                  </div>
                </div>
              </div>

              {/* Two lists side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Catégories de produits (Owner only) */}
                {isOwner && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                        Catégories de produits ({productCategories.length})
                      </h3>
                      <SavedBadge fieldKey="product_categories" />
                    </div>

                    <div className="space-y-1.5 bg-slate-50/60 p-3 rounded-2xl border border-slate-200/80 max-h-96 overflow-y-auto">
                      {productCategories.map((cat, idx) => {
                        const usage = getProductCategoryUsage(cat);
                        const isEditing = editingCat?.type === 'product' && editingCat.index === idx;

                        return (
                          <div
                            key={cat}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200/60 shadow-2xs group"
                          >
                            {isEditing ? (
                              <input
                                type="text"
                                autoFocus
                                defaultValue={editingCat.val}
                                onChange={(e) => setEditingCat({ ...editingCat, val: e.target.value })}
                                onBlur={handleSaveRenameCategory}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveRenameCategory();
                                  if (e.key === 'Escape') setEditingCat(null);
                                }}
                                className="flex-1 px-2 py-1 text-xs font-bold text-slate-900 rounded border border-indigo-400 outline-hidden"
                              />
                            ) : (
                              <div
                                onClick={() => setEditingCat({ type: 'product', index: idx, val: cat })}
                                className="flex-1 text-xs font-bold text-slate-800 cursor-pointer hover:text-indigo-600 truncate"
                                title="Cliquer pour renommer"
                              >
                                {cat}
                              </div>
                            )}

                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                                {usage} produit{usage > 1 ? 's' : ''}
                              </span>

                              <button
                                type="button"
                                disabled={usage > 0}
                                onClick={() => handleDeleteCategory('product', cat)}
                                title={usage > 0 ? `Utilisée par ${usage} produit${usage > 1 ? 's' : ''}` : 'Supprimer'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  usage > 0
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-rose-500 hover:bg-rose-50 cursor-pointer'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add category input */}
                      <div className="pt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={newProductCatInput}
                          onChange={(e) => setNewProductCatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddProductCategory()}
                          placeholder="Nouvelle catégorie..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleAddProductCategory}
                          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Catégories de dépenses (Owner + Accountant) */}
                <div className={`space-y-3 ${!isOwner ? 'md:col-span-2' : ''}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                      Catégories de dépenses ({expenseCategories.length})
                    </h3>
                    <SavedBadge fieldKey="expense_categories" />
                  </div>

                  <div className="space-y-1.5 bg-slate-50/60 p-3 rounded-2xl border border-slate-200/80 max-h-96 overflow-y-auto">
                    {expenseCategories.map((cat, idx) => {
                      const usage = getExpenseCategoryUsage(cat);
                      const isSystem = cat === 'Achat marchandise';
                      const isEditing = editingCat?.type === 'expense' && editingCat.index === idx;

                      return (
                        <div
                          key={cat}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200/60 shadow-2xs group"
                        >
                          {isEditing && !isSystem ? (
                            <input
                              type="text"
                              autoFocus
                              defaultValue={editingCat.val}
                              onChange={(e) => setEditingCat({ ...editingCat, val: e.target.value })}
                              onBlur={handleSaveRenameCategory}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveRenameCategory();
                                if (e.key === 'Escape') setEditingCat(null);
                              }}
                              className="flex-1 px-2 py-1 text-xs font-bold text-slate-900 rounded border border-indigo-400 outline-hidden"
                            />
                          ) : (
                            <div
                              onClick={() => {
                                if (!isSystem) {
                                  setEditingCat({ type: 'expense', index: idx, val: cat });
                                }
                              }}
                              className={`flex-1 text-xs font-bold truncate flex items-center gap-1.5 ${
                                isSystem ? 'text-slate-900' : 'text-slate-800 cursor-pointer hover:text-indigo-600'
                              }`}
                              title={isSystem ? 'Catégorie système verrouillée' : 'Cliquer pour renommer'}
                            >
                              <span>{cat}</span>
                              {isSystem && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
                            </div>
                          )}

                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-md">
                              {usage} dépense{usage > 1 ? 's' : ''}
                            </span>

                            {isSystem ? (
                              <span className="p-1.5 text-slate-300" title="Verrouillé par le système">
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={usage > 0}
                                onClick={() => handleDeleteCategory('expense', cat)}
                                title={usage > 0 ? `Utilisée par ${usage} dépense${usage > 1 ? 's' : ''}` : 'Supprimer'}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  usage > 0
                                    ? 'text-slate-300 cursor-not-allowed'
                                    : 'text-rose-500 hover:bg-rose-50 cursor-pointer'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Add expense category input */}
                    <div className="pt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={newExpenseCatInput}
                        onChange={(e) => setNewExpenseCatInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddExpenseCategory()}
                        placeholder="Nouvelle catégorie de charge..."
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleAddExpenseCategory}
                        className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ========================================================================= */}
          {/* SECTION 7: MON COMPTE (VISIBLE TO ALL ROLES) */}
          {/* ========================================================================= */}
          <section
            id="section-compte"
            className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-24"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900">Mon compte</h2>
                  <p className="text-xs text-slate-400 font-medium">Profil personnel, sécurité du code secret et gestion des sessions</p>
                </div>
              </div>
            </div>

            {/* Profile fields: Nom & Téléphone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Mon nom</label>
                  <SavedBadge fieldKey="ownerName" />
                </div>
                <input
                  type="text"
                  defaultValue={settings.ownerName}
                  onBlur={(e) => handleFieldSave('ownerName', e.target.value.trim(), 'ownerName')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    Mon numéro de téléphone <span className="text-[10px] text-slate-400">(utilisé pour te connecter)</span>
                  </label>
                  <SavedBadge fieldKey="ownerPhone" />
                </div>
                <input
                  type="tel"
                  defaultValue={settings.ownerPhone}
                  onBlur={(e) => handleFieldSave('ownerPhone', e.target.value.trim(), 'ownerPhone')}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium"
                />
              </div>
            </div>

            {/* Changer mon code secret */}
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-3 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-indigo-600" />
                <span>Changer mon code secret</span>
              </h3>

              <form onSubmit={handleSavePin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Ancien code</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pinCurrent}
                    onChange={(e) => setPinCurrent(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-center font-mono font-bold tracking-widest"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Nouveau code</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pinNew}
                    onChange={(e) => setPinNew(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-center font-mono font-bold tracking-widest"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-600">Confirmer</label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      maxLength={6}
                      value={pinConfirm}
                      onChange={(e) => setPinConfirm(e.target.value)}
                      placeholder="••••"
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-center font-mono font-bold tracking-widest"
                    />
                    <button
                      type="submit"
                      disabled={!pinCurrent || !pinNew || !pinConfirm}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              </form>

              {pinSuccess && (
                <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 mt-2">
                  <Check className="w-3.5 h-3.5" />
                  <span>Code secret modifié avec succès !</span>
                </p>
              )}
            </div>

            {/* Mes appareils connectés */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    Mes appareils connectés
                  </h3>
                  <p className="text-[11px] text-slate-400">Sessions ouvertes actuellement avec ce compte</p>
                </div>
                {mySessions.filter((s) => !s.isCurrent).length > 0 && (
                  <button
                    type="button"
                    onClick={() => revokeOtherMySessions()}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                  >
                    Me déconnecter partout
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {mySessions.length === 0 ? (
                  <p className="text-[11px] text-slate-400 italic">Chargement...</p>
                ) : (
                  mySessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/50"
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className={`w-4 h-4 ${s.isCurrent ? 'text-indigo-600' : 'text-slate-400'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {describeSession(s.userAgent)}
                            </span>
                            {s.isCurrent && (
                              <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                                Cet appareil
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Connecté le {formatDate(s.createdAt)}{s.ip ? ` · ${s.ip}` : ''}
                          </span>
                        </div>
                      </div>

                      {!s.isCurrent && (
                        <button
                          type="button"
                          onClick={() => revokeMySession(s.id)}
                          className="text-xs font-bold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          Déconnecter
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ZONE SÉPARÉE : Danger & Export (bordure rouge fine) */}
            <div className="pt-4 border-t-2 border-rose-200/80 rounded-2xl p-4 bg-rose-50/30 space-y-4">
              <div className="flex items-center gap-2 text-rose-800">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span className="text-xs font-extrabold uppercase tracking-wider">Données & Clôture de compte</span>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">Télécharger toutes mes données</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Télécharge un export complet (articles, ventes, clients, dépenses, historique) au format JSON & Excel.
                    Disponible en permanence même en cas de compte en lecture seule.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleExportAllData}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-2xs transition-colors cursor-pointer shrink-0"
                >
                  <Download className="w-4 h-4 text-slate-600" />
                  <span>Télécharger mes données</span>
                </button>
              </div>

              {/* Fermer mon compte — réservé au propriétaire : ça ferme toute la boutique */}
              <div className="pt-3 border-t border-rose-200/60">
                {!isOwner ? (
                  <div className="flex items-center gap-2.5 text-slate-500">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <p className="text-[11px]">
                      Seul le propriétaire de la boutique peut fermer le compte. Contacte-le si nécessaire.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-rose-700">Fermer mon compte</h4>
                        <p className="text-[11px] text-slate-500 mt-0.5 max-w-xl">
                          Tes données seront gardées pendant 90 jours. Tu pourras les récupérer pendant ce temps en te reconnectant.
                          Après 90 jours, elles seront effacées définitivement.
                        </p>
                      </div>

                      {deleteStep === 0 && (
                        <button
                          type="button"
                          onClick={() => setDeleteStep(1)}
                          className="px-4 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold transition-colors cursor-pointer shrink-0"
                        >
                          Fermer le compte...
                        </button>
                      )}
                    </div>

                    {deleteStep === 1 && (
                      <div className="mt-3 p-4 rounded-xl bg-white border border-rose-300 space-y-3 animate-in fade-in duration-200">
                        <p className="text-xs font-bold text-rose-800">
                          Étape 1 sur 2 : Es-tu sûr de vouloir fermer le compte "{settings.shopName}" ?
                        </p>
                        <p className="text-[11px] text-slate-600">
                          Pour confirmer, écris exactement le mot <strong>SUPPRIMER</strong> ci-dessous :
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={deleteConfirmationText}
                            onChange={(e) => setDeleteConfirmationText(e.target.value)}
                            placeholder="SUPPRIMER"
                            className="px-3 py-2 rounded-xl border border-rose-300 text-xs font-mono font-bold uppercase w-48"
                          />
                          <button
                            type="button"
                            disabled={deleteConfirmationText !== 'SUPPRIMER'}
                            onClick={() => {
                              setDeleteStep(2);
                            }}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                          >
                            Continuer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteStep(0);
                              setDeleteConfirmationText('');
                            }}
                            className="px-3 py-2 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}

                    {deleteStep === 2 && (
                      <div className="mt-3 p-4 rounded-xl bg-rose-600 text-white space-y-2 animate-in fade-in duration-200">
                        <p className="text-xs font-black">
                          Étape 2 sur 2 : Confirmation finale
                        </p>
                        <p className="text-[11px] text-rose-100">
                          Ton compte sera mis en sommeil pendant 90 jours. Toutes les sessions actives seront fermées.
                        </p>
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            type="button"
                            disabled={isClosingAccount}
                            onClick={handleConfirmCloseAccount}
                            className="px-4 py-2 rounded-xl bg-white text-rose-700 text-xs font-bold cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-wait"
                          >
                            {isClosingAccount ? 'Fermeture en cours...' : 'Confirmer la fermeture du compte'}
                          </button>
                          <button
                            type="button"
                            disabled={isClosingAccount}
                            onClick={() => setDeleteStep(0)}
                            className="px-3 py-2 rounded-xl text-rose-100 hover:bg-rose-700 text-xs font-bold cursor-pointer disabled:opacity-60"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Confirmation modal for switching to SERVICES mode */}
      {pendingActivityType && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-black text-slate-900">Changer de mode d'activité</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Le mode <strong>Services</strong> masque tout le stock et les alertes d'inventaire. Tes produits ne seront pas supprimés et pourront être réactivés à tout moment.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingActivityType(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  handleFieldSave('activityType', pendingActivityType, 'activityType');
                  setPendingActivityType(null);
                  showToast('Mode Services activé', 'success');
                }}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                Confirmer le changement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
