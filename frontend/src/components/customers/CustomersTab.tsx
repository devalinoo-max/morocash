import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  Search,
  Plus,
  Phone,
  MessageCircle,
  CreditCard,
  History,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  X,
  Send,
} from 'lucide-react';
import { formatMoney, formatDate } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { Customer, PaymentMethod } from '../../types';
import { MoneyInput } from '../common/UIStates';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';

export const CustomersTab: React.FC = () => {
  const {
    customers,
    addCustomer,
    recordDebtPayment,
    sales,
    settings,
    showToast,
    customersDebtorsFilter: filterDebtorsOnly,
    setCustomersDebtorsFilter: setFilterDebtorsOnly,
    isWriteLocked,
    gateWrite,
    customerToFocus,
    clearCustomerFocus,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');

  // Arrive du detail d'une commande : on cadre la liste sur ce client-la, en
  // passant par la recherche pour que le commercant voie pourquoi la liste est
  // reduite et puisse l'elargir d'un geste.
  useEffect(() => {
    if (!customerToFocus) return;
    const cible = customers.find((c) => c.id === customerToFocus);
    if (cible) {
      setSearchQuery(cible.name);
      setFilterDebtorsOnly(false);
    }
    clearCustomerFocus();
  }, [customerToFocus, customers, clearCustomerFocus, setFilterDebtorsOnly]);

  // New Customer Modal
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCity, setNewCustCity] = useState(settings.city || 'Abidjan');
  const [newCustNotes, setNewCustNotes] = useState('');

  // Payment Recording Modal
  const [repayingCustomer, setRepayingCustomer] = useState<Customer | null>(null);
  const [repayAmount, setRepayAmount] = useState<number>(0);
  const [repayMethod, setRepayMethod] = useState<PaymentMethod>('CASH');

  // WhatsApp Reminder Modal (§11: Relance préremplie mais modifiable)
  const [reminderCustomer, setReminderCustomer] = useState<Customer | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');

  const totalDebts = customers.reduce((acc, c) => acc + c.totalDebt, 0);
  const debtorCount = customers.filter((c) => c.totalDebt > 0).length;

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.notes && c.notes.toLowerCase().includes(q));

      const matchesDebtor = !filterDebtorsOnly || c.totalDebt > 0;
      return matchesSearch && matchesDebtor;
    });
  }, [customers, searchQuery, filterDebtorsOnly]);

  const handleOpenReminder = (cust: Customer) => {
    setReminderCustomer(cust);
    const msg = `Bonjour ${cust.name}, sauf erreur de notre part, vous avez un solde restant de ${formatMoney(
      cust.totalDebt
    )} auprès de la boutique ${settings.shopName}. Merci de bien vouloir passer régulariser ou effectuer un virement Wave/Orange Money au ${
      settings.ownerPhone
    }. Bonne journée !`;
    setReminderMessage(msg);
  };

  const handleSendReminder = () => {
    if (!reminderCustomer) return;
    const cleanPhone = reminderCustomer.phone.replace(/\D/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(reminderMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(reminderMessage)}`;
    window.open(url, '_blank');
    showToast('Relance WhatsApp ouverte', 'success');
    setReminderCustomer(null);
  };

  const handleConfirmRepayment = async () => {
    if (!repayingCustomer || repayAmount <= 0) {
      showToast('Montant de remboursement invalide', 'warning');
      return;
    }
    await recordDebtPayment(repayingCustomer.id, repayAmount, repayMethod);
    setRepayingCustomer(null);
    setRepayAmount(0);
  };

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) {
      showToast('Nom et téléphone obligatoires', 'warning');
      return;
    }
    const created = await addCustomer({
      name: newCustName.trim(),
      phone: newCustPhone.trim(),
      city: newCustCity.trim(),
      totalDebt: 0,
      notes: newCustNotes.trim() || undefined,
    });
    if (!created) return;
    setNewCustName('');
    setNewCustPhone('');
    setNewCustNotes('');
    setIsAddCustomerOpen(false);
  };

  return (
    <div id="customers-tab-content" className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Header with Debt Summary */}
      <div className="mx-4 sm:mx-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Clients & Dettes (Carnet de crédit)
          </h2>
          <p className="text-xs text-slate-500">
            {customers.length} clients enregistrés • {debtorCount} avec dette en cours
          </p>
        </div>
        <button
          id="btn-open-add-customer"
          onClick={() => gateWrite(() => setIsAddCustomerOpen(true))}
          className={`px-4 py-2.5 rounded-2xl bg-[#5B4DFB] hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-indigo-500/20 transition-all cursor-pointer self-start sm:self-auto ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
        >
          <Plus className="w-4 h-4" />
          <span>Ajouter un client</span>
        </button>
      </div>

      {/* Debt KPI Card */}
      <div className="mx-4 sm:mx-0 p-4 rounded-3xl bg-rose-50 border border-rose-200 flex items-center justify-between shadow-xs">
        <div>
          <span className="text-xs font-extrabold text-rose-800 uppercase tracking-wider">
            Total Dettes à recouvrer
          </span>
          <div className="text-xl sm:text-2xl font-black text-rose-700 mt-0.5">
            {formatMoney(totalDebts)}
          </div>
          <p className="text-xs text-rose-600 font-medium">
            Réparti sur {countLabel(debtorCount, 'client')}
          </p>
        </div>
        <button
          id="btn-filter-debtors"
          onClick={() => setFilterDebtorsOnly(!filterDebtorsOnly)}
          className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            filterDebtorsOnly
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-100/50'
          }`}
        >
          {filterDebtorsOnly ? '✓ Voir tous' : 'Voir uniquement débiteurs'}
        </button>
      </div>

      {/* Search Bar */}
      <div className="mx-4 sm:mx-0">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-customers"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher par nom, téléphone, quartier..."
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#5B4DFB] transition-all shadow-xs"
          />
        </div>
      </div>

      {/* Customer List (§11: Objectif mesurable : identifier une dette en < 5s) */}
      <div className="mx-4 sm:mx-0">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 space-y-2">
            <Users className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
            <p className="text-sm font-semibold text-slate-600">Aucun client trouvé</p>
            <p className="text-xs">Ajoute un client pour suivre ses achats et ses crédits.</p>
          </div>
        ) : (
          <>
            {/* DESKTOP TABLE (BLOC 3: VRAIS TABLEAUX, hauteur de ligne 46px) */}
            <div className="hidden lg:block bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4">Téléphone</th>
                    <th className="py-3 px-4">Ville</th>
                    <th className="py-3 px-4 text-right">Dette totale</th>
                    <th className="py-3 px-4 text-center">Ancienneté dette</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.map((cust) => {
                    const hasDebt = cust.totalDebt > 0;
                    const initials = cust.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase();

                    return (
                      <tr
                        key={cust.id}
                        className="h-[46px] hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-indigo-100 text-[#4F46E5] font-bold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </div>
                            <div>
                              <span className="font-extrabold text-slate-900 block">
                                {cust.name}
                              </span>
                              {cust.notes && (
                                <span className="text-[10px] text-slate-400 block truncate max-w-[160px]">
                                  {cust.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                          {cust.phone}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                          {cust.city || '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`font-black text-sm ${
                              hasDebt ? 'text-[#DC2626]' : 'text-[#059669]'
                            }`}
                          >
                            {hasDebt ? formatMoney(cust.totalDebt) : 'À jour (0 F)'}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center whitespace-nowrap">
                          {hasDebt ? (
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                cust.debtAgeDays >= 30
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {cust.debtAgeDays} jours
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <a
                              href={`tel:${cust.phone}`}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                              title="Appeler"
                            >
                              <Phone className="w-3.5 h-3.5" />
                            </a>
                            {hasDebt && (
                              <button
                                onClick={() => handleOpenReminder(cust)}
                                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                                title="Relance WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span>WhatsApp</span>
                              </button>
                            )}
                            {hasDebt && (
                              <button
                                onClick={() => gateWrite(() => {
                                  setRepayingCustomer(cust);
                                  setRepayAmount(cust.totalDebt);
                                })}
                                className={`px-2.5 py-1 rounded-lg bg-[#4F46E5] hover:bg-indigo-700 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-xs ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
                              >
                                Encaisser
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS (< 1024px) */}
            <div className="lg:hidden space-y-2.5">
              {filteredCustomers.map((cust) => {
                const hasDebt = cust.totalDebt > 0;
                return (
                  <div
                    key={cust.id}
                    id={`customer-card-${cust.id}`}
                    className={`p-4 rounded-3xl bg-white border transition-all shadow-xs ${
                      hasDebt
                        ? 'border-rose-300 bg-rose-50/10 hover:border-rose-400'
                        : 'border-slate-200/80 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Customer Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 truncate">
                            {cust.name}
                          </h3>
                          {cust.city && (
                            <span className="text-[10px] text-slate-500 font-semibold px-2 py-0.5 rounded-full bg-slate-100">
                              {cust.city}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-600 mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {cust.phone}
                        </p>
                        {cust.notes && (
                          <p className="text-[11px] text-slate-400 italic mt-1 line-clamp-1">
                            "{cust.notes}"
                          </p>
                        )}
                      </div>

                      {/* Right: Huge Debt Highlight (< 5 seconds goal) */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                          {hasDebt ? 'Montant dû' : 'Solde'}
                        </span>
                        <div
                          className={`text-base sm:text-lg font-black tracking-tight ${
                            hasDebt ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {hasDebt ? formatMoney(cust.totalDebt) : 'À jour (0 F)'}
                        </div>
                        {hasDebt && (
                          <span className="inline-block text-[10px] font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded-md mt-0.5">
                            Dette depuis {countLabel(cust.debtAgeDays, 'jour')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick Action Buttons (§11: Appeler · WhatsApp · Enregistrer un remboursement) */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <a
                          id={`btn-call-${cust.id}`}
                          href={`tel:${cust.phone}`}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-all"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Appeler</span>
                        </a>

                        {hasDebt && (
                          <button
                            id={`btn-remind-wa-${cust.id}`}
                            onClick={() => handleOpenReminder(cust)}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Relance WhatsApp</span>
                          </button>
                        )}
                      </div>

                      {hasDebt && (
                        <button
                          id={`btn-repay-${cust.id}`}
                          onClick={() => gateWrite(() => {
                            setRepayingCustomer(cust);
                            setRepayAmount(cust.totalDebt);
                          })}
                          className={`px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold flex items-center gap-1 shadow-sm transition-all cursor-pointer ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Encaisser remboursement</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* MODAL: CREATE CUSTOMER */}
      {isAddCustomerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl p-5 space-y-4 border border-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900">Nouveau client</h3>
              <button
                onClick={() => setIsAddCustomerOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet *</label>
                <input
                  id="input-cust-name"
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Ex: Mme Fatou Diop"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-[#5B4DFB]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Numéro Téléphone / WhatsApp *</label>
                <input
                  id="input-cust-phone"
                  type="tel"
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="+225 07 00 00 00 00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-[#5B4DFB]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Ville / Quartier</label>
                <input
                  type="text"
                  value={newCustCity}
                  onChange={(e) => setNewCustCity(e.target.value)}
                  placeholder="Ex: Abidjan Cocody"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Repères</label>
                <textarea
                  rows={2}
                  value={newCustNotes}
                  onChange={(e) => setNewCustNotes(e.target.value)}
                  placeholder="Habite près du carrefour..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddCustomerOpen(false)}
                  className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-2xl bg-[#5B4DFB] text-white text-xs font-bold shadow-md hover:bg-indigo-700"
                >
                  Enregistrer client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RECORD DEBT REPAYMENT */}
      {repayingCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl p-5 space-y-4 border border-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-extrabold text-base text-slate-900">
                Règlement de dette
              </h3>
              <button
                onClick={() => setRepayingCustomer(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-600">
                Client : <strong>{repayingCustomer.name}</strong>
              </p>
              <p className="text-xs text-rose-600 font-bold mt-0.5">
                Dette totale due : {formatMoney(repayingCustomer.totalDebt)}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Montant versé aujourd'hui (FCFA) :
              </label>
              <MoneyInput
                id="input-repay-amount"
                value={repayAmount}
                onChange={(val) => setRepayAmount(val)}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRepayAmount(repayingCustomer.totalDebt)}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold hover:bg-emerald-100"
              >
                Solde total ({formatMoney(repayingCustomer.totalDebt)})
              </button>
              {repayingCustomer.totalDebt > 5000 && (
                <button
                  type="button"
                  onClick={() => setRepayAmount(Math.round(repayingCustomer.totalDebt / 2))}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  50%
                </button>
              )}
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Mode de règlement :</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['CASH', 'WAVE', 'ORANGE_MONEY'] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRepayMethod(m)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border ${
                      repayMethod === m
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {m === 'CASH' ? 'Espèces' : m === 'WAVE' ? 'Wave' : 'Orange M.'}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setRepayingCustomer(null)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmRepayment}
                className="flex-1 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md"
              >
                Valider et Reçu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: WHATSAPP REMINDER TEMPLATE (§11: Relance préremplie mais modifiable) */}
      {reminderCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl p-5 space-y-4 border border-slate-100">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                <h3 className="font-extrabold text-base text-slate-900">Relance de dette WhatsApp</h3>
              </div>
              <button
                onClick={() => setReminderCustomer(null)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-600">
                Destinataire : <strong>{reminderCustomer.name}</strong> ({reminderCustomer.phone})
              </p>
              <p className="text-xs text-rose-600 font-bold mt-0.5">
                Montant dû : {formatMoney(reminderCustomer.totalDebt)}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Message (modifie-le à ta convenance avant envoi) :
              </label>
              <textarea
                rows={5}
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                className="w-full p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
              />
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setReminderCustomer(null)}
                className="flex-1 py-3 rounded-2xl border border-slate-200 text-xs font-bold text-slate-600"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSendReminder}
                className="flex-1 py-3 rounded-2xl bg-[#25D366] hover:bg-[#20ba59] text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Envoyer sur WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
