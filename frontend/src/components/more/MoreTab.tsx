import React, { useState, useEffect } from 'react';
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
  X,
} from 'lucide-react';
import { formatMoney, formatDate, getTerminology } from '../../utils/formatters';
import { ActivityType, UserRole } from '../../types';
import { PLANS } from '../../data/plans';
import {
  PERMISSION_OPTIONS,
  ROLE_LABELS,
  defaultPermissionsForRole,
  hasPermission,
  type EmployeePermission,
} from '../../data/permissions';
import { NewExpenseModal } from '../expenses/NewExpenseModal';
import { SubscriptionView } from '../subscription/SubscriptionView';
import { SubscriptionBanner } from './SubscriptionBanner';
import { ReportsTab } from '../reports/ReportsTab';
import { SettingsPage } from '../settings/SettingsPage';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import { avatarInitials } from '../../utils/avatar';
import { PeriodFilterBar } from '../common/PeriodFilterBar';
import { EmployeesPanel } from './EmployeesPanel';
import { usePeriodFilter } from '../../hooks/usePeriodFilter';
import { isWithinPeriod } from '../../utils/periodFilter';
import { downloadExport } from '../../api/exports';

export const MoreTab: React.FC = () => {
  const {
    activeMoreSubTab,
    setActiveMoreSubTab,
    setActiveTab,
    expenses,
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
    setEmployeeCommercial,
    isWriteLocked,
    gateWrite,
    newExpenseRequested,
    clearNewExpenseRequest,
  } = useApp();

  const isOwner = settings.role === 'OWNER';

  // State for Employees (BLOC 8) — la liste vient du backend (voir fetchEmployees
  // déclenché ci-dessous quand cet onglet s'ouvre), plus de données locales figées.
  // « Renouveler » du bandeau d'abonnement : la page s'ouvre sur la feuille de prolongation.
  const [renouvelerDirect, setRenouvelerDirect] = useState(false);
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empPin, setEmpPin] = useState('');
  const [empRole, setEmpRole] = useState<'SELLER' | 'ACCOUNTANT'>('SELLER');
  // Le rôle coche ses cases tout seul : un vendeur part avec vendre, encaisser
  // et voir ses ventes ; un gestionnaire avec tout sauf les employés et
  // l'abonnement. Le propriétaire reprend ensuite ligne par ligne — partir de
  // zéro obligeait à cocher dix cases pour obtenir un gestionnaire ordinaire.
  const [empPermissions, setEmpPermissions] = useState<EmployeePermission[]>(() =>
    defaultPermissionsForRole('SELLER')
  );

  /** Changer de rôle repose les cases de ce rôle, sans garder les précédentes. */
  const choisirRole = (role: 'SELLER' | 'ACCOUNTANT') => {
    setEmpRole(role);
    setEmpPermissions(defaultPermissionsForRole(role));
  };
  // Case « Commercial » : visible seulement si le suivi par commercial est activé.
  const [empCommercial, setEmpCommercial] = useState(false);
  const suiviCommercial = !!settings.suiviCommercialActif;

  const toggleEmpPermission = (code: EmployeePermission) =>
    setEmpPermissions((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
    );
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
      showToast('Le mot de passe doit comporter 6 chiffres', 'warning');
      return;
    }
    setIsSavingEmployee(true);
    const success = await addEmployee({
      nom: empName.trim(),
      telephone: empPhone.replace(/\D/g, ''),
      pin: empPin,
      role: empRole,
      permissions: empPermissions,
      estCommercial: suiviCommercial && empCommercial,
    });
    setIsSavingEmployee(false);
    if (!success) return;
    setEmpName('');
    setEmpPhone('');
    setEmpPin('');
    setEmpPermissions([]);
    setEmpCommercial(false);
    setIsAddEmployeeOpen(false);
  };

  // Sub-Tab 1: Expenses state
  // Le filtre de période des dépenses, le même que celui des Commandes, des
  // Rapports et des Clients. Déclaré ici, au niveau du composant : les
  // sous-écrans de MoreTab sont des `return` conditionnels, et un hook appelé
  // dans l'un d'eux changerait d'ordre d'un rendu à l'autre.
  const {
    selection: depensesPeriode,
    setSelection: setDepensesPeriode,
    period: periodeDepenses,
  } = usePeriodFilter('depenses');
  const [exportDepensesEnCours, setExportDepensesEnCours] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);

  // « Créer › Nouvelle dépense » depuis la barre du bas : le formulaire
  // s'ouvre directement, sans passer par la liste.
  useEffect(() => {
    if (!newExpenseRequested) return;
    setIsAddExpenseOpen(true);
    clearNewExpenseRequest();
  }, [newExpenseRequested, clearNewExpenseRequest]);

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

  // SUB-VIEW: EMPLOYÉS — la liste, les fiches et les droits vivent dans
  // EmployeesPanel. Le formulaire d'ajout reste ici : il partage son état
  // avec le reste de MoreTab (gateWrite, quota, toast).
  if (activeMoreSubTab === 'employees') {
    return (
      <>
        <EmployeesPanel
          onBack={() => setActiveMoreSubTab(null)}
          onAdd={() => setIsAddEmployeeOpen(true)}
        />


        {/*
          Modal: Ajouter une personne (BLOC 8: nom, téléphone, code à 4 chiffres, rôle)

          La liste des droits fait dix-sept lignes. Sans hauteur plafonnée ni
          défilement, le panneau dépassait l'écran par le haut ET par le bas :
          on ne pouvait plus atteindre le bouton « Annuler », ni même le titre.
          On borne donc le panneau, seul le contenu défile, et les deux boutons
          restent collés en pied. Le fond et la croix ferment aussi : un écran
          dont on ne peut pas sortir est un écran cassé.
        */}
        {isAddEmployeeOpen && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsAddEmployeeOpen(false)}
          >
            <div
              className="bg-white max-w-sm w-full max-h-[85vh] rounded-mc shadow-2xl flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-start justify-between gap-3 p-5 pb-3">
                <h3 className="font-extrabold text-base text-mc-ink">Ajouter une personne</h3>
                <button
                  type="button"
                  onClick={() => setIsAddEmployeeOpen(false)}
                  aria-label="Fermer"
                  className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-lg text-slate-400 hover:text-mc-ink hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleAddEmployeeSubmit} className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Fatou Cissé"
                    value={empName}
                    onChange={(e) => setEmpName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-mc-line text-xs font-bold text-mc-ink"
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
                    className="w-full px-3 py-2 rounded-xl border border-mc-line text-xs text-mc-ink"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Mot de passe à 6 chiffres *
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    pattern="[0-9]{6}"
                    required
                    placeholder="123456"
                    value={empPin}
                    onChange={(e) => setEmpPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full px-3 py-2 rounded-xl border border-mc-line text-xs font-mono tracking-widest text-mc-ink"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Ce mot de passe lui permettra d'ouvrir sa caisse et d'enregistrer des commandes.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Rôle *</label>
                  <select
                    value={empRole}
                    onChange={(e) => choisirRole(e.target.value as 'SELLER' | 'ACCOUNTANT')}
                    className="w-full px-3 py-2 rounded-xl border border-mc-line text-xs font-bold text-mc-ink bg-white"
                  >
                    <option value="SELLER">Vendeur — vend et encaisse, ne voit pas tes marges</option>
                    <option value="ACCOUNTANT">Gestionnaire — gère le quotidien et voit l’argent</option>
                  </select>
                </div>

                {/*
                  Une case par droit, cochée une par une. Aucune n'est pré-cochée :
                  c'est au propriétaire de dire ce que la personne peut voir, pas
                  au logiciel de le supposer. Le serveur refuse de toute façon les
                  appels correspondants (voir requirePermission).
                */}
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-bold text-slate-700 mb-1">
                    Ce que cette personne peut faire
                  </legend>
                  {PERMISSION_OPTIONS.map((option) => {
                    const checked = empPermissions.includes(option.code);
                    return (
                      <label
                        key={option.code}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                          checked ? 'bg-mc-primary-tint border-[#DAD6FC]' : 'bg-white border-mc-line hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEmpPermission(option.code)}
                          className="mt-0.5 w-4 h-4 shrink-0 accent-[#5B4BF0] cursor-pointer"
                        />
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-mc-ink">{option.label}</span>
                          <span className="block text-[10px] text-mc-soft leading-snug">{option.aide}</span>
                        </span>
                      </label>
                    );
                  })}
                  <p className="text-[10px] text-slate-400 pt-0.5">
                    {empPermissions.length === 0
                      ? 'Aucun droit coché : cette personne pourra seulement vendre et encaisser.'
                      : `${empPermissions.length} droit${empPermissions.length > 1 ? 's' : ''} accordé${empPermissions.length > 1 ? 's' : ''}.`}
                  </p>
                </fieldset>

                {suiviCommercial && (
                  <label
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                      empCommercial ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-mc-line hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={empCommercial}
                      onChange={(e) => setEmpCommercial(e.target.checked)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-[#5B4BF0] cursor-pointer"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-mc-ink">Commercial</span>
                      <span className="block text-[10px] text-mc-soft leading-snug">
                        Ses ventes lui sont attribuées d’office ; il ne peut pas les attribuer à un collègue.
                      </span>
                    </span>
                  </label>
                )}

                </div>

                <div className="shrink-0 flex gap-2 px-5 py-4 border-t border-mc-line bg-white">
                  <button
                    type="button"
                    onClick={() => setIsAddEmployeeOpen(false)}
                    className="flex-1 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-slate-600 cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEmployee}
                    className="flex-1 py-2.5 rounded-full bg-mc-primary hover:bg-mc-primary-dark disabled:opacity-60 text-white font-bold text-xs shadow-md cursor-pointer"
                  >
                    {isSavingEmployee ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  // SUB-VIEW: PERMISSIONS (BLOC 8: phrase explicite "Tes vendeurs ne voient pas tes bénéfices", et le réglage du plafond de remise)
  if (activeMoreSubTab === 'permissions') {
    const currentMaxDiscount = settings.maxDiscountPercent ?? 10;

    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <button
          onClick={() => setActiveMoreSubTab(null)}
          className="inline-flex items-center gap-1.5 h-11 pr-4 text-[16px] md:text-[14px] font-bold text-mc-primary hover:text-mc-primary-dark cursor-pointer active:scale-[0.97]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Menu</span>
        </button>

        {/* Phrase explicite exigée par le BLOC 8 */}
        <div className="p-5 rounded-mc bg-emerald-50 border border-emerald-200 shadow-xs flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-emerald-950 tracking-tight">
              « Tes vendeurs ne voient pas tes bénéfices »
            </h2>
            <p className="text-xs text-emerald-800 mt-0.5">
              Les prix d’achat, les marges brutes et la rentabilité nette sont strictement masqués sur les sessions des vendeurs.
            </p>
          </div>
        </div>

        {/* Réglage du plafond de remise exigé par le BLOC 8 */}
        <div className="p-4 md:p-6 rounded-mc bg-white border border-mc-line shadow-mc-card space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-mc-primary" />
              <h3 className="text-xs font-extrabold text-mc-ink">Plafond de remise vendeur</h3>
            </div>
            <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-mc-primary-tint text-mc-primary-dark border border-[#DAD6FC]">
              Max {currentMaxDiscount}%
            </span>
          </div>
          <p className="text-[11px] text-mc-soft">
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
                    ? 'bg-[#5B4BF0] text-white border-[#5B4BF0] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-mc-line hover:bg-slate-100'
                }`}
              >
                {pct === 0 ? '0% (Aucune)' : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Détail des droits d'accès */}
        <div className="p-4 md:p-6 rounded-mc bg-white border border-mc-line shadow-mc-card space-y-3">
          <h3 className="text-xs font-extrabold text-mc-ink">Tableau des règles d'accès</h3>
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-mc-ink">Enregistrer une commande & encaisser</p>
                <p className="text-[11px] text-slate-400">Vente au comptoir, choix du paiement</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Autorisé
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-mc-ink">Voir les prix d’achat et la marge</p>
                <p className="text-[11px] text-slate-400">Ce que tu as gagné, coût unitaire</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                Masqué
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-mc-ink">Ouvrir et fermer la caisse</p>
                <p className="text-[11px] text-slate-400">Comptage physique du tiroir-caisse</p>
              </div>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                Autorisé
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <p className="font-bold text-mc-ink">Supprimer une commande enregistrée</p>
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
    // La liste et le total ne montrent que la période choisie : avant, l'écran
    // empilait toutes les dépenses depuis l'ouverture de la boutique, et son
    // total ne correspondait à aucun chiffre des Rapports.
    const depensesPeriodeAffichees = expenses.filter((e) => isWithinPeriod(e.date, periodeDepenses));
    const totalExp = depensesPeriodeAffichees.reduce((acc, e) => acc + e.amount, 0);

    const exporterDepenses = async () => {
      if (exportDepensesEnCours || depensesPeriodeAffichees.length === 0) return;
      setExportDepensesEnCours(true);
      try {
        await downloadExport({
          type: 'expense-lines',
          format: 'pdf',
          from: periodeDepenses.start,
          to: periodeDepenses.end,
          ids: depensesPeriodeAffichees.map((e) => e.id),
        });
      } catch (error) {
        showToast(
          error instanceof Error ? error.message : "L'export n'a pas pu être préparé.",
          'error'
        );
      } finally {
        setExportDepensesEnCours(false);
      }
    };

    return (
      <div className="space-y-4 pb-24 animate-in fade-in duration-150">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setActiveMoreSubTab(null)}
            className="inline-flex items-center gap-1.5 h-11 pr-4 text-[16px] md:text-[14px] font-bold text-mc-primary hover:text-mc-primary-dark cursor-pointer active:scale-[0.97]"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Menu</span>
          </button>
          <button
            onClick={() => gateWrite(() => setIsAddExpenseOpen(true))}
            className={`h-10 px-4 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-[14px] font-bold flex items-center gap-1.5 cursor-pointer shadow-mc-card transition-all active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <Plus className="w-4 h-4" />
            <span>Saisir une dépense</span>
          </button>
        </div>

        <PeriodFilterBar
          id="btn-expenses-period"
          selection={depensesPeriode}
          onChange={setDepensesPeriode}
          period={periodeDepenses}
          countLabel={`${depensesPeriodeAffichees.length} dépense${
            depensesPeriodeAffichees.length > 1 ? 's' : ''
          }`}
          onExport={exporterDepenses}
          exportBusy={exportDepensesEnCours}
          exportDisabled={depensesPeriodeAffichees.length === 0}
          exportTitle={`Exporter les ${depensesPeriodeAffichees.length} dépenses affichées`}
        />

        <div className="p-4 md:p-6 rounded-mc bg-mc-warning-bg">
          <span className="text-[14px] font-semibold text-[#92400E]">
            Ce que tu as dépensé · {periodeDepenses.label.toLowerCase()}
          </span>
          <div className="text-[28px] md:text-[40px] font-extrabold text-[#B45309] tabular-nums tracking-tight leading-tight">{formatMoney(totalExp)}</div>
        </div>

        <div className="space-y-2">
          {depensesPeriodeAffichees.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-mc-line text-xs">
              {expenses.length === 0
                ? 'Aucune dépense enregistrée.'
                : 'Aucune dépense sur cette période.'}
            </div>
          ) : (
            depensesPeriodeAffichees.map((exp) => (
              <div
                key={exp.id}
                className="p-3.5 rounded-2xl bg-white border border-mc-line shadow-xs flex items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-mc-ink">{exp.category}</span>
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
                  <span className="text-sm font-extrabold text-rose-600">-{formatMoney(exp.amount)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal: saisie d'une dépense — le même formulaire que dans la Caisse */}
        {isAddExpenseOpen && <NewExpenseModal onClose={() => setIsAddExpenseOpen(false)} />}
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
          className="inline-flex items-center gap-1.5 h-11 pr-4 text-[16px] md:text-[14px] font-bold text-mc-primary hover:text-mc-primary-dark cursor-pointer active:scale-[0.97]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Menu</span>
        </button>
        <SubscriptionView onBack={() => setActiveMoreSubTab(null)} openRenew={renouvelerDirect} />
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
          className="inline-flex items-center gap-1.5 h-11 pr-4 text-[16px] md:text-[14px] font-bold text-mc-primary hover:text-mc-primary-dark cursor-pointer active:scale-[0.97]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Menu</span>
        </button>

        <div className="p-4 md:p-6 rounded-mc bg-white border border-mc-line shadow-mc-card space-y-4">
          <h3 className="text-[20px] font-extrabold text-mc-ink">Exportation & Sauvegarde locale</h3>
          <p className="text-xs text-mc-soft">
            Télécharge l'intégralité de vos commandes ({sales.length}), clients ({customers.length}) et produits pour conservation ou comptabilité.
          </p>
          <button
            onClick={handleExportCSV}
            className="w-full min-h-12 px-4 py-3 rounded-full bg-mc-success hover:bg-[#15803D] text-white font-bold text-[14px] flex items-center justify-center gap-2 cursor-pointer active:scale-[0.97]"
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
          className="inline-flex items-center gap-1.5 h-11 pr-4 text-[16px] md:text-[14px] font-bold text-mc-primary hover:text-mc-primary-dark cursor-pointer active:scale-[0.97]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Menu</span>
        </button>

        <div className="p-4 md:p-6 rounded-mc bg-white border border-mc-line shadow-mc-card space-y-3">
          <h3 className="text-[20px] font-extrabold text-mc-ink">Centre d'aide rapide</h3>
          <div className="space-y-3 text-[14px] text-mc-ink/80 leading-relaxed">
            <p><strong>• Comment faire une commande ?</strong> Touche le bouton '+ Nouvelle commande' en haut ou en bas.</p>
            <p><strong>• Comment relancer un client débiteur ?</strong> Va dans l'onglet 'Clients' et clique sur 'Relancer'.</p>
            <p><strong>• Fonctionnement hors-ligne ?</strong> L'application continue d'enregistrer toutes vos commandes même sans connexion internet.</p>
          </div>
        </div>
      </div>
    );
  }

  // MENU « PLUS »
  // Rangé par fréquence d'usage : en haut, quatre grandes tuiles pour ce qu'on
  // ouvre tous les jours ; dessous, trois listes courtes pour le reste ; la
  // déconnexion tout en bas, loin du pouce, pour ne pas la toucher par erreur.
  interface Entree {
    key: string;
    id?: string;
    titre: string;
    aide: string;
    icone: React.ComponentType<{ className?: string }>;
    teinte: string;
    action: () => void;
    /** Compteur rouge : quelque chose demande un geste. */
    alerte?: number;
    /** Petit état à droite du titre (« Ouverte », « 12 »). */
    etat?: { texte: string; classe: string };
  }

  const abonnementLigne =
    settings.planStatus === 'EXPIRED'
      ? 'Abonnement expiré • Réactive ton compte'
      : settings.planStatus === 'TRIAL'
      ? `Essai — ${settings.trialDaysLeft} ${settings.trialDaysLeft > 1 ? 'jours restants' : 'jour restant'}`
      : `Formule ${settings.planStatus === 'BUSINESS' ? 'Business' : 'Solo'}${
          settings.subscriptionDaysLeft != null
            ? ` — ${settings.subscriptionDaysLeft} ${settings.subscriptionDaysLeft > 1 ? 'jours restants' : 'jour restant'}`
            : ' • Active'
        }`;

  const tuiles: Entree[] = [
    {
      key: 'cash',
      titre: 'Caisse',
      aide: 'Entrées et sorties',
      icone: WalletCards,
      teinte: 'bg-mc-success-bg text-[#15803D]',
      action: () => setActiveTab('cash'),
      etat: activeCashSession
        ? { texte: 'Ouverte', classe: 'bg-mc-success-bg text-[#15803D]' }
        : { texte: 'Fermée', classe: 'bg-mc-bg text-mc-soft' },
    },
    {
      key: 'debtors',
      titre: 'Qui me doit',
      aide: 'Dettes et relances',
      icone: Clock,
      teinte: 'bg-mc-danger-bg text-[#DC2626]',
      action: () => {
        setCustomersDebtorsFilter(true);
        setActiveTab('customers');
      },
      alerte: debtorsCount,
    },
    {
      key: 'receipts',
      id: 'more-menu-mes-recus',
      titre: 'Mes reçus',
      aide: 'Revoir et renvoyer',
      icone: FileText,
      teinte: 'bg-mc-primary-tint text-mc-primary',
      action: () => {
        setActiveTab('receipts');
        setActiveMoreSubTab(null);
      },
      etat: sales.length > 0 ? { texte: String(sales.length), classe: 'bg-mc-bg text-mc-soft' } : undefined,
    },
    {
      key: 'expenses',
      titre: 'Mes dépenses',
      aide: 'Loyer, transport…',
      icone: TrendingDown,
      teinte: 'bg-mc-warning-bg text-[#B45309]',
      action: () => setActiveMoreSubTab('expenses'),
    },
  ];

  const groupes: { titre: string; entrees: Entree[] }[] = [
    {
      titre: 'Ma boutique',
      entrees: [
        {
          key: 'customers',
          titre: 'Clients',
          aide: 'Carnet et historique',
          icone: Users,
          teinte: 'bg-[#E6F4FE] text-[#0369A1]',
          action: () => {
            setCustomersDebtorsFilter(false);
            setActiveTab('customers');
          },
        },
        ...(settings.activityType !== 'SERVICES'
          ? [
              {
                key: 'movements',
                titre: 'Mouvements de stock',
                aide: 'Réceptions, casses, inventaires',
                icone: ArrowLeftRight,
                teinte: 'bg-mc-primary-tint text-mc-primary',
                action: () => setActiveTab('movements'),
              },
              {
                key: 'low-stock',
                titre: 'Ce qui va manquer',
                aide: 'Produits bientôt en rupture',
                icone: AlertTriangle,
                teinte: 'bg-mc-danger-bg text-[#DC2626]',
                action: () => setActiveTab('products'),
                alerte: lowStockCount,
              },
            ]
          : []),
        {
          key: 'reports',
          titre: 'Mes chiffres',
          aide: 'Ventes, bénéfices, rentabilité',
          icone: BarChart3,
          teinte: 'bg-mc-primary-tint text-mc-primary',
          action: () => setActiveMoreSubTab('reports'),
        },
      ],
    },
    {
      titre: 'Mon équipe',
      entrees: [
        {
          key: 'employees',
          titre: 'Employés',
          aide: 'Ajouter une personne, son rôle',
          icone: UserCheck,
          teinte: 'bg-[#F3E8FF] text-[#7E22CE]',
          action: () => setActiveMoreSubTab('employees'),
        },
        {
          key: 'permissions',
          titre: 'Qui peut voir quoi',
          aide: 'Bénéfices cachés, remise maximale',
          icone: ShieldCheck,
          teinte: 'bg-mc-success-bg text-[#15803D]',
          action: () => setActiveMoreSubTab('permissions'),
        },
      ],
    },
    {
      titre: 'Mon compte',
      entrees: [
        {
          key: 'subscription',
          titre: 'Mon abonnement',
          aide: abonnementLigne,
          icone: Crown,
          teinte: 'bg-mc-warning-bg text-[#B45309]',
          action: () => setActiveMoreSubTab('subscription'),
        },
        {
          key: 'settings',
          titre: 'Réglages',
          aide: 'Boutique, reçus, mot de passe',
          icone: Settings,
          teinte: 'bg-mc-bg text-mc-ink',
          action: () => setActiveMoreSubTab('settings'),
        },
        {
          key: 'export',
          titre: 'Sauvegarde & Export',
          aide: 'Télécharger mes données',
          icone: Download,
          teinte: 'bg-mc-success-bg text-[#15803D]',
          action: () => setActiveMoreSubTab('export'),
        },
        {
          key: 'help',
          titre: 'Aide',
          aide: 'Guide et support',
          icone: HelpCircle,
          teinte: 'bg-[#E6F4FE] text-[#0369A1]',
          action: () => setActiveMoreSubTab('help'),
        },
      ],
    },
  ];

  /**
   * Le droit qu'exige chaque entrée du menu.
   *
   * Une entrée sans droit requis est ouverte à tous. Les autres DISPARAISSENT
   * quand la personne n'a pas le droit : un vendeur ne doit jamais voir une
   * tuile « Mes chiffres » sur laquelle appuyer pour se faire refuser. Le
   * serveur refuse de toute façon les appels correspondants — cacher ici est
   * une politesse, pas la sécurité.
   */
  const DROIT_PAR_ENTREE: Partial<Record<string, EmployeePermission>> = {
    debtors: 'VOIR_DETTES_CLIENTS',
    expenses: 'VOIR_DEPENSES',
    movements: 'GERER_STOCK',
    reports: 'VOIR_RAPPORTS',
    employees: 'GERER_EMPLOYES',
    permissions: 'GERER_EMPLOYES',
    subscription: 'GERER_ABONNEMENT',
    export: 'VOIR_RAPPORTS',
  };

  const entreeAutorisee = (entree: Entree): boolean => {
    const droit = DROIT_PAR_ENTREE[entree.key];
    return !droit || hasPermission(settings, droit);
  };

  const tuilesVisibles = tuiles.filter(entreeAutorisee);
  // Un groupe dont toutes les entrées sont cachées disparaît avec elles :
  // un titre « Mon équipe » seul sur l'écran n'apprend rien à personne.
  const groupesVisibles = groupes
    .map((g) => ({ ...g, entrees: g.entrees.filter(entreeAutorisee) }))
    .filter((g) => g.entrees.length > 0);

  const nomUtilisateur = currentUser?.nom ?? 'Utilisateur';
  const roleLisible =
    ROLE_LABELS[settings.role] ?? 'Vendeur';

  return (
    <div id="more-tab-content" className="font-jakarta text-mc-ink space-y-6 pb-24 max-w-2xl mx-auto">
      {/* QUI EST CONNECTÉ — et où en est l'abonnement, d'un coup d'œil */}
      <div className="mc-gradient text-white rounded-mc shadow-mc-card p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-[16px] font-extrabold shrink-0">
          {avatarInitials(nomUtilisateur)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold truncate">{nomUtilisateur}</p>
          <p className="text-[12px] text-white/75 truncate">
            {currentBusiness?.nom ? `${currentBusiness.nom} · ` : ''}
            {roleLisible}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveMoreSubTab('subscription')}
          className="shrink-0 h-8 px-3 rounded-full bg-white/20 hover:bg-white/30 text-[12px] font-bold whitespace-nowrap cursor-pointer transition-colors active:scale-[0.97]"
        >
          {settings.planStatus === 'EXPIRED'
            ? 'Expiré'
            : settings.planStatus === 'TRIAL'
            ? `Essai · ${settings.trialDaysLeft} j`
            : settings.planStatus === 'BUSINESS'
            ? 'Business'
            : 'Solo'}
        </button>
      </div>

      {/* OÙ EN EST L'ABONNEMENT — jours restants et date de fin, essai compris */}
      <SubscriptionBanner
        onOpen={() => {
          setRenouvelerDirect(false);
          setActiveMoreSubTab('subscription');
        }}
        onRenew={() => {
          setRenouvelerDirect(true);
          setActiveMoreSubTab('subscription');
        }}
      />

      {/* TOUS LES JOURS — quatre grandes tuiles, faciles au pouce */}
      <section className="space-y-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-mc-soft px-1">Tous les jours</h2>
        <div className="grid grid-cols-2 gap-3">
          {tuilesVisibles.map((t) => {
            const Icone = t.icone;
            return (
              <button
                key={t.key}
                id={t.id}
                type="button"
                onClick={t.action}
                className="mc-lift relative min-h-[112px] p-4 rounded-mc bg-white border border-mc-line shadow-mc-card text-left cursor-pointer flex flex-col justify-between gap-3 active:scale-[0.97]"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${t.teinte}`}>
                    <Icone className="w-5 h-5" />
                  </span>
                  {t.alerte != null && t.alerte > 0 ? (
                    <span className="min-w-[24px] h-6 px-2 rounded-full bg-mc-danger text-white text-[12px] font-bold flex items-center justify-center tabular-nums">
                      {t.alerte}
                    </span>
                  ) : (
                    t.etat && (
                      <span className={`h-6 px-2.5 rounded-full text-[12px] font-bold flex items-center tabular-nums ${t.etat.classe}`}>
                        {t.etat.texte}
                      </span>
                    )
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[16px] font-bold leading-tight">{t.titre}</span>
                  <span className="block text-[12px] text-mc-soft mt-0.5 truncate">{t.aide}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* LE RESTE — une carte par groupe, une ligne par écran */}
      {groupesVisibles.map((g) => (
        <section key={g.titre} className="space-y-2">
          <h2 className="text-[12px] font-bold uppercase tracking-wider text-mc-soft px-1">{g.titre}</h2>
          <div className="bg-white rounded-mc border border-mc-line shadow-mc-card overflow-hidden divide-y divide-mc-line">
            {g.entrees.map((e) => {
              const Icone = e.icone;
              return (
                <button
                  key={e.key}
                  // Repère stable pour la visite guidée : sur téléphone,
                  // « Mes chiffres » n'est atteignable que par cette liste.
                  id={`btn-more-${e.key}`}
                  type="button"
                  onClick={e.action}
                  className="w-full min-h-[64px] px-4 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-mc-bg/60 active:bg-mc-bg transition-colors"
                >
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${e.teinte}`}>
                    <Icone className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] font-bold leading-tight truncate">{e.titre}</span>
                    <span className="block text-[12px] text-mc-soft mt-0.5 truncate">{e.aide}</span>
                  </span>
                  {e.alerte != null && e.alerte > 0 && (
                    <span className="min-w-[24px] h-6 px-2 rounded-full bg-mc-danger text-white text-[12px] font-bold flex items-center justify-center tabular-nums shrink-0">
                      {e.alerte}
                    </span>
                  )}
                  <ChevronRight className="w-5 h-5 text-mc-soft shrink-0" />
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* DÉCONNEXION — tout en bas, jamais sous le pouce par accident */}
      <button
        type="button"
        onClick={() => logoutUser()}
        className="w-full h-12 rounded-full border border-[#FBCACA] bg-white text-[#DC2626] text-[16px] font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-mc-danger-bg transition-colors active:scale-[0.97]"
      >
        <LogOut className="w-5 h-5" />
        Déconnexion
      </button>
    </div>
  );
};
