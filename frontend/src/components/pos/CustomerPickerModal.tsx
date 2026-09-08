import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Customer } from '../../types';
import { Search, UserPlus, X, Check, Phone, User, ArrowLeft } from 'lucide-react';
import { formatMoney } from '../../utils/currency';

interface CustomerPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomerId?: string;
  onSelectCustomer: (customer: Customer) => void;
}

export const CustomerPickerModal: React.FC<CustomerPickerModalProps> = ({
  isOpen,
  onClose,
  selectedCustomerId,
  onSelectCustomer,
}) => {
  const { customers, addCustomer, showToast } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // New customer inputs
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q))
    );
  });

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Le nom du client est obligatoire', 'warning');
      return;
    }

    const created = await addCustomer({
      name: name.trim(),
      phone: phone.trim() || 'Non renseigné',
      totalDebt: 0,
      notes: notes.trim() || 'Créé pendant la vente',
    });
    if (!created) return;

    showToast(`Client "${created.name}" créé avec succès`, 'success');
    onSelectCustomer(created);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-[480px] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
              <User className="w-4 h-4 text-indigo-300" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold">
                {isCreating ? 'Nouveau client' : 'Choisir un client'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {isCreating
                  ? 'Création rapide en 10 secondes'
                  : 'Obligatoire pour enregistrer la vente'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {isCreating ? (
            /* Inline creation form */
            <form onSubmit={handleCreateCustomer} className="space-y-3 animate-in fade-in">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-xs font-bold text-[#4F46E5] hover:underline flex items-center gap-1 mb-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Retour à la liste des clients</span>
              </button>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nom ou surnom du client *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Maman Sarah, Le Menuisier, M. Kouamé..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Numéro de téléphone (optionnel)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ex: 07 01 02 03 04"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Note / description (optionnel)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Habite en face de la pharmacie"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  id="btn-save-new-customer-pos"
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-md cursor-pointer"
                >
                  Créer et associer
                </button>
              </div>
            </form>
          ) : (
            /* Picker List */
            <>
              {/* Button + Nouveau client tout en haut */}
              <button
                id="btn-open-create-customer-pos"
                type="button"
                onClick={() => setIsCreating(true)}
                className="w-full py-2.5 px-4 rounded-xl border-2 border-dashed border-[#4F46E5]/40 hover:border-[#4F46E5] bg-indigo-50/50 hover:bg-indigo-50 text-[#4F46E5] font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <UserPlus className="w-4 h-4" />
                <span>+ Nouveau client (en 10 secondes)</span>
              </button>

              {/* Search input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par nom ou numéro..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Customer List */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {filteredCustomers.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 space-y-2">
                    <p className="text-xs">Aucun client ne correspond à "{searchQuery}".</p>
                    <button
                      type="button"
                      onClick={() => {
                        setName(searchQuery);
                        setIsCreating(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-50 text-[#4F46E5] font-bold text-xs hover:bg-indigo-100 cursor-pointer"
                    >
                      + Créer le client "{searchQuery}"
                    </button>
                  </div>
                ) : (
                  filteredCustomers.map((cust) => {
                    const isSelected = cust.id === selectedCustomerId;
                    const hasDebt = (cust.totalDebt || 0) > 0;

                    return (
                      <div
                        key={cust.id}
                        id={`customer-item-${cust.id}`}
                        onClick={() => {
                          onSelectCustomer(cust);
                          onClose();
                        }}
                        className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-50/80 border-[#4F46E5] ring-1 ring-[#4F46E5]'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {cust.name}
                          </p>
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{cust.phone || 'Pas de numéro'}</span>
                          </p>
                        </div>

                        {/* Debt status requirement:
                            "ex: 'Dette : 12 000 F' en rouge, ou 'À jour' en vert" */}
                        <div className="text-right shrink-0 flex items-center gap-2">
                          {hasDebt ? (
                            <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                              Dette : {formatMoney(cust.totalDebt)}
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                              À jour
                            </span>
                          )}

                          {isSelected && <Check className="w-4 h-4 text-[#4F46E5]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
