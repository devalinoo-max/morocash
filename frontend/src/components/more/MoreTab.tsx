import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Wallet,
  BarChart3,
  Crown,
  Settings,
  HelpCircle,
  Download,
  ChevronRight,
  ArrowLeft,
  ArrowLeftRight,
  Package,
  Plus,
  Trash2,
  Lock,
  Sparkles,
  Shield,
  ShieldCheck,
  UserCheck,
  Users,
  Clock,
  CheckCircle2,
  FileText,
  PieChart as PieIcon,
  Layers,
  RefreshCw,
  WalletCards,
  TrendingDown,
  UserPlus,
  Phone,
  KeyRound,
  Percent,
  LogOut,
  AlertTriangle,
} from 'lucide-react';
import { formatMoney, formatDate, getTerminology } from '../../utils/formatters';
import { ActivityType, Expense, PaymentMethod, UserRole } from '../../types';
import { PLANS } from '../../data/plans';
import { MoneyInput } from '../common/UIStates';
import { SubscriptionView } from '../subscription/SubscriptionView';
import { ReportsTab } from '../reports/ReportsTab';
import { SettingsPage } from '../settings/SettingsPage';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';

export const MoreTab: React.FC = () => {
  const {
    activeMoreSubTab,
    setActiveMoreSubTab,
    setActiveTab,
    expenses,
    addExpense,
    sales,
    customers,
    products,
    settings,
    updateSettings,
    showToast,
    activeCashSession,
    currentUser,
    currentBusiness,
    logoutUser,
    setCustomersDebtorsFilter,
    employees,
    fetchEmployees,
    addEmployee,
    setEmployeeActive,
    isWriteLocked,
    gateWrite,
  } = useApp();

  const isOwner = settings.role === 'OWNER';

  // State for Employees (BLOC 8) — la liste vient du backend (voir fetchEmployees
  // déclenché ci-dessous quand cet onglet s'ouvre), plus de données locales figées.
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empPin, setEmpPin] = useState('');
  const [empRole, setEmpRole] = useState<'SELLER' | 'ACCOUNTANT'>('SELLER');
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);

  React.useEffect(() => {
    if (activeMoreSubTab === 'employees') {
      fetchEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMoreSubTab]);

  const handleAddEmployeeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim() || !empPhone.trim()) {
      showToast('Veuillez renseigner le nom et le téléphone', 'warning');
      return;
    }
    if (empPin.length !== 6) {
      showToast('Le code PIN doit comporter 6 chiffres', 'warning');
      return;
    }
    setIsSavingEmployee(true);
    const success = await addEmployee({
      nom: empName.trim(),
      telephone: empPhone.replace(/\D/g, ''),
      pin: empPin,
      role: empRole,
    });
    setIsSavingEmployee(false);
    if (!success) return;
    setEmpName('');
    setEmpPhone('');
    setEmpPin('');
    setIsAddEmployeeOpen(false);
  };

  // Sub-Tab 1: Expenses state
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expCategory, setExpCategory] = useState('Factures & Charges');
  const [expNote, setExpNote] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<PaymentMethod>('CASH');

  const handleAddExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expAmount <= 0) {
      showToast('Saisis un montant valide pour la dépense', 'warning');
      return;
    }
    const created = await addExpense({
      amount: expAmount,
      category: expCategory,
      note: expNote.trim() || undefined,
      date: new Date().toISOString(),
      paymentMethod: expPaymentMethod,
      isAuto: false,
    });
    if (!created) return;
    setExpAmount(0);
    setExpNote('');
    setIsAddExpenseOpen(false);
  };

  // Sub-Tab 2: Export Data
  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Reference;Date;Total;Paye;Reste;Statut;Client\n' +
      sales
        .map(
          (s) =>
            `${s.reference};${s.createdAt};${s.totalAmount};${s.paidAmount};${s.remainingAmount};${s.paymentStatus};"${s.customerName || ''}"`
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `morocash_commandes_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Export CSV téléchargé', 'success');
  };

  // Badges counts
  const debtorsCount = customers.filter((c) => c.totalDebt > 0).length;
  const lowStockCount = products.filter((p) => !p.isService && p.stock <= p.alertThreshold).length;

  // SUB-VIEW: EMPLOYEES (BLOC 8)
  if (activeMoreSubTab === 'employees') {
    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActiveMoreSubTab(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour menu</span>
          </button>
          {isOwner && (
            <button
              onClick={() => gateWrite(() => setIsAddEmployeeOpen(true))}
              className={`px-3.5 py-2 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Ajouter une personne</span>
            </button>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-indigo-950">Gestion de l’équipe</h3>
            <p className="text-[11px] text-indigo-700">
              Chaque vendeur se connecte avec son code PIN à 6 chiffres pour enregistrer ses commandes.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {employees
            .filter((emp) => emp.actif)
            .map((emp) => (
              <div
                key={emp.id}
                className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 font-extrabold text-xs text-slate-700 flex items-center justify-center">
                    {emp.nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{emp.nom}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                          emp.role === 'OWNER'
                            ? 'bg-amber-100 text-amber-800'
                            : emp.role === 'ACCOUNTANT'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {emp.role === 'OWNER'
                          ? 'Propriétaire'
                          : emp.role === 'ACCOUNTANT'
                          ? 'Gestionnaire'
                          : 'Vendeur'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{emp.telephone}</span>
                      <span>•</span>
                      <span className="text-slate-400">PIN : ••••</span>
                    </p>
                  </div>
                </div>

                {isOwner && emp.role !== 'OWNER' && (
                  <button
                    onClick={() => setEmployeeActive(emp.id, false)}
                    className="text-slate-300 hover:text-rose-500 p-2 cursor-pointer transition-colors"
                    title="Retirer l'employé"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
        </div>

        {/* Modal: Ajouter une personne (BLOC 8: nom, téléphone, code à 4 chiffres, rôle) */}
        {isAddEmployeeOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-sm w-full rounded-3xl p-5 space-y-4 shadow-2xl">
              <h3 className="font-extrabold text-base text-slate-900">Ajouter une personne</h3>
              <form onSubmit={handleAddEmployeeSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Fatou Cissé"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Téléphone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="Ex: +225 07 12 34 56"
                    value={empPhone}
                    onChange={(e) => setEmpPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Code à 6 chiffres (PIN de connexion) *
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    placeholder="123456"
                    value={empPin}
                    onChange={(e) => setEmpPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono tracking-widest text-slate-900"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Ce code lui permettra d'ouvrir sa caisse et d'enregistrer des commandes.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Rôle *</label>
                  <select
                    value={empRole}
                    onChange={(e) => setEmpRole(e.target.value as 'SELLER' | 'ACCOUNTANT')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-white"
                  >
                    <option value="SELLER">Vendeur (Commandes, encaissement, stock)</option>
                    <option value="ACCOUNTANT">Gestionnaire (Ajout produits, validation)</option>
                  </select>
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddEmployeeOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEmployee}
                    className="flex-1 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs shadow-md cursor-pointer"
                  >
                    {isSavingEmployee ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SUB-VIEW: PERMISSIONS (BLOC 8: phrase explicite "Tes vendeurs ne voient pas tes bénéfices", et le réglage du plafond de remise)
  if (activeMoreSubTab === 'permissions') {
    const currentMaxDiscount = settings.maxDiscountPercent ?? 10;

    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <button
          onClick={() => setActiveMoreSubTab(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour menu</span>
        </button>

        {/* Phrase explicite exigée par le BLOC 8 */}
        <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-emerald-950 tracking-tight">
              « Tes vendeurs ne voient pas tes bénéfices »
            </h2>
            <p className="text-xs text-emerald-800 mt-0.5">
              Les prix d’achat, les marges brutes et la rentabilité nette sont strictement masqués sur les sessions des vendeurs.
            </p>
          </div>
        </div>

        {/* Réglage du plafond de remise exigé par le BLOC 8 */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-indigo-600" />
              <h3 className="text-xs font-extrabold text-slate-900">Plafond de remise vendeur</h3>
            </div>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
              Max {currentMaxDiscount}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Fixe le pourcentage maximal de remise qu'un vendeur peut appliquer sans demander l'autorisation du propriétaire.
          </p>
          <div className="grid grid-cols-4 gap-2 pt-1">
            {[0, 5, 10, 20].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  updateSettings({ maxDiscountPercent: pct });
                  showToast(`Plafond de remise fixé à ${pct}%`, 'success');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                  currentMaxDiscount === pct
                    ? 'bg-[#4F46E5] text-white border-[#4F46E5] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {pct === 0 ? '0% (Aucune)' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Détail des droits d'accès */}
        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="text-xs font-extrabold text-slate-900">Tableau des règles d'accès</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Enregistrer une commande & encaisser</p>
                <p className="text-[11px] text-slate-400">Vente au comptoir, choix du paiement</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Autorisé
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Voir les prix d’achat et la marge</p>
                <p className="text-[11px] text-slate-400">Ce que tu as gagné, coût unitaire</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                Masqué
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Ouvrir et fermer la caisse</p>
                <p className="text-[11px] text-slate-400">Comptage physique du tiroir-caisse</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Autorisé
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-slate-900">Supprimer une commande enregistrée</p>
                <p className="text-[11px] text-slate-400">Annulation définitive d'une transaction</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                Propriétaire seul
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // SUB-VIEW: EXPENSES
  if (activeMoreSubTab === 'expenses') {
    const totalExp = expenses.reduce((acc, e) => acc + e.amount, 0);
    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActiveMoreSubTab(null)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Retour menu</span>
          </button>
          <button
            onClick={() => gateWrite(() => setIsAddExpenseOpen(true))}
            className={`px-3.5 py-2 rounded-xl bg-[#4F46E5] text-white text-xs font-bold flex items-center gap-1 cursor-pointer ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <Plus className="w-4 h-4" />
            <span>Saisir une dépense</span>
          </button>
        </div>

        <div className="p-4 rounded-3xl bg-amber-50 border border-amber-200">
          <span className="text-xs font-bold text-amber-800 uppercase">Ce que tu as dépensé</span>
          <div className="text-2xl font-black text-amber-950 mt-0.5">{formatMoney(totalExp)}</div>
        </div>

        <div className="space-y-2">
          {expenses.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 text-xs">
              Aucune dépense enregistrée.
            </div>
          ) : (
            expenses.map((exp) => (
              <div
                key={exp.id}
                className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{exp.category}</span>
                    {exp.isAuto && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-800">
                        Auto (Achat Stock)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {exp.note || 'Frais de fonctionnement'} • {formatDate(exp.date)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-rose-600">-{formatMoney(exp.amount)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal: Quick 2-step Expense */}
        {isAddExpenseOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-sm w-full rounded-3xl p-5 space-y-4 shadow-2xl">
              <h3 className="font-extrabold text-base text-slate-900">Enregistrer une dépense</h3>
              <form onSubmit={handleAddExpenseSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    1. Montant dépensé (FCFA) *
                  </label>
                  <MoneyInput
                    id="input-exp-amount"
                    value={expAmount}
                    onChange={(val) => setExpAmount(val)}
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    2. Catégorie de la charge *
                  </label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-white"
                  >
                    <option value="Factures & Charges">Facture CIE / Eau / Internet</option>
                    <option value="Transport & Livraisons">Transport & Déplacement</option>
                    <option value="Loyer boutique">Loyer boutique / Emplacement</option>
                    <option value="Salaires & Aides">Salaires & Commissions</option>
                    <option value="Autre dépense">Autre charge diverse</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Note / Détail (Facultatif)</label>
                  <input
                    type="text"
                    value={expNote}
                    onChange={(e) => setExpNote(e.target.value)}
                    placeholder="Ex: Taxi retour grossiste"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                  />
                </div>

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddExpenseOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shadow-md"
                  >
                    Valider dépense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // SUB-VIEW: REPORTS & ANALYTICS (PAGE "MES CHIFFRES")
  if (activeMoreSubTab === 'reports') {
    return <ReportsTab onBack={() => setActiveMoreSubTab(null)} />;
  }

  // SUB-VIEW: SUBSCRIPTION
  if (activeMoreSubTab === 'subscription') {
    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <button
          onClick={() => setActiveMoreSubTab(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour menu</span>
        </button>
        <SubscriptionView onBack={() => setActiveMoreSubTab(null)} />
      </div>
    );
  }

  // SUB-VIEW: SETTINGS (7 SECTIONS, AUTO-SAVE, ROLE-BASED)
  if (activeMoreSubTab === 'settings') {
    return (
      <div className="pb-24 animate-in fade-in duration-150">
        <SettingsPage />
      </div>
    );
  }

  // SUB-VIEW: EXPORT
  if (activeMoreSubTab === 'export') {
    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <button
          onClick={() => setActiveMoreSubTab(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour menu</span>
        </button>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900">Exportation & Sauvegarde locale</h3>
          <p className="text-xs text-slate-500">
            Télécharge l'intégralité de vos commandes ({sales.length}), clients ({customers.length}) et produits pour conservation ou comptabilité.
          </p>
          <button
            onClick={handleExportCSV}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Télécharger le fichier CSV des commandes</span>
          </button>
        </div>
      </div>
    );
  }

  // SUB-VIEW: HELP
  if (activeMoreSubTab === 'help') {
    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <button
          onClick={() => setActiveMoreSubTab(null)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Retour menu</span>
        </button>

        <div className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-3">
          <h3 className="font-extrabold text-sm text-slate-900">Centre d'aide rapide</h3>
          <div className="space-y-2 text-xs text-slate-600">
            <p><strong>• Comment faire une commande ?</strong> Touche le bouton '+ Nouvelle commande' en haut ou en bas.</p>
            <p><strong>• Comment relancer un client débiteur ?</strong> Va dans l'onglet 'Clients' et clique sur 'Relancer'.</p>
            <p><strong>• Fonctionnement hors-ligne ?</strong> L'application continue d'enregistrer toutes vos commandes même sans connexion internet.</p>
          </div>
        </div>
      </div>
    );
  }

  // DEFAULT MENU LIST: EXACT GROUPS FROM BLOC 4
  return (
    <div id="more-tab-content" className="space-y-5 pb-24 animate-in fade-in duration-200">
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Plus</h2>
        <p className="text-xs text-slate-500">
          Caisse, Clients, Dépenses, Mes chiffres, Employés, Abonnement et Réglages
        </p>
      </div>

      {/* COMPTE — session réelle (étape 13) */}
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
            {currentUser?.nom ?? 'Utilisateur'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {currentBusiness?.nom ?? ''} — {currentUser?.role ?? ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => logoutUser()}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 hover:bg-rose-50 hover:text-rose-600 text-slate-600 text-xs font-bold cursor-pointer transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Déconnexion
        </button>
      </div>

      {/* GROUPE VENDRE — même catégorie que la barre latérale desktop
          (Nouvelle commande/Mes commandes sont déjà des onglets directs en bas) */}
      <div className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Vendre
        </div>
        <div className="space-y-2">
          {/* Mes reçus */}
          <div
            id="more-menu-mes-recus"
            onClick={() => {
              setActiveTab('receipts');
              setActiveMoreSubTab(null);
            }}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Mes reçus</h3>
                  <span className="text-[10px] font-bold px-2 py-0.2 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {sales.length}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Historique, réémission et partage WhatsApp
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* GROUPE STOCK (Si commerce physique) — même ordre que la barre latérale desktop */}
      {settings.activityType !== 'SERVICES' && (
        <div className="space-y-2">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
            Mon Stock
          </div>
          <div className="space-y-2">
            <div
              onClick={() => setActiveTab('movements')}
              className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Mouvements de stock</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Réceptions, casses, pertes, inventaires et journal complet
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {/* Ce qui va manquer — même raccourci que la barre latérale desktop */}
            <div
              onClick={() => setActiveTab('products')}
              className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Ce qui va manquer</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Produits en rupture ou proches du seuil d'alerte
                  </p>
                </div>
              </div>
              {lowStockCount > 0 && (
                <span className="text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-rose-600 text-white shrink-0">
                  {lowStockCount}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GROUPE 2 : MES CLIENTS (BLOC 4 mandate) */}
      <div className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Mes Clients
        </div>
        <div className="space-y-2">
          {/* Clients */}
          <div
            onClick={() => {
              setCustomersDebtorsFilter(false);
              setActiveTab('customers');
            }}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Clients</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Répertoire et historique des transactions
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Qui me doit */}
          <div
            onClick={() => {
              setCustomersDebtorsFilter(true);
              setActiveTab('customers');
            }}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Qui me doit</h3>
                  {debtorsCount > 0 && (
                    <span className="text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-rose-600 text-white">
                      {debtorsCount}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Dettes en cours et relance WhatsApp
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* GROUPE 1 : MON ARGENT (BLOC 4 mandate) */}
      <div className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Mon Argent
        </div>
        <div className="space-y-2">
          {/* Caisse */}
          <div
            onClick={() => setActiveTab('cash')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <WalletCards className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Caisse</h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                      activeCashSession
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    {activeCashSession ? 'Ouverte' : 'Fermée'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Comptage physique, fond de départ et réconciliation
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Ce que je dépense */}
          <div
            onClick={() => setActiveMoreSubTab('expenses')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                <TrendingDown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Ce que je dépense</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Factures boutique, transport, loyer et charges
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Mes chiffres */}
          <div
            onClick={() => setActiveMoreSubTab('reports')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Mes chiffres</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Répartition des commandes, bénéfices et rentabilité
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* GROUPE 3 : MON ÉQUIPE (BLOC 4 mandate) */}
      <div className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Mon Équipe
        </div>
        <div className="space-y-2">
          {/* Employés */}
          <div
            onClick={() => setActiveMoreSubTab('employees')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Employés</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ajouter une personne, code PIN et attribution des rôles
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Qui peut voir quoi */}
          <div
            onClick={() => setActiveMoreSubTab('permissions')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Qui peut voir quoi</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Masquage des bénéfices et plafond de remise vendeur
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>

      {/* GROUPE 4 : MON COMPTE (BLOC 4 mandate) */}
      <div className="space-y-2">
        <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 px-1">
          Mon Compte
        </div>
        <div className="space-y-2">
          {/* Mon abonnement */}
          <div
            onClick={() => setActiveMoreSubTab('subscription')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Mon abonnement</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Essai {settings.trialDaysLeft} jours restants • Formule Pro
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Réglages */}
          <div
            onClick={() => setActiveMoreSubTab('settings')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Réglages</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Nom boutique, ville, reçu WhatsApp et type d'activité
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Sauvegarde / Export CSV */}
          <div
            onClick={() => setActiveMoreSubTab('export')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Sauvegarde & Export</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Télécharger les données au format Excel / CSV
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          {/* Aide */}
          <div
            onClick={() => setActiveMoreSubTab('help')}
            className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-xs hover:border-[#4F46E5] transition-all flex items-center justify-between gap-3 cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center shrink-0">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900">Aide</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Guide d'utilisation et support direct
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
};
