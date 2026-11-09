import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MoneyInput } from '../common/UIStates';

/**
 * Saisie d'une dépense, en trois champs : montant, catégorie, note.
 *
 * Un seul formulaire pour tout le logiciel : l'écran « Dépenses » et la Caisse
 * l'ouvrent tous les deux. Une dépense notée d'ici ou de là passe par la même
 * fonction (`addExpense`), donc compte une seule fois et pour le même montant
 * à l'accueil, dans les rapports et dans les sorties de la caisse.
 */
interface NewExpenseModalProps {
  onClose: () => void;
}

const CATEGORIES = [
  { value: 'Factures & Charges', label: 'Facture CIE / Eau / Internet' },
  { value: 'Transport & Livraisons', label: 'Transport & Déplacement' },
  { value: 'Loyer boutique', label: 'Loyer boutique / Emplacement' },
  { value: 'Salaires & Aides', label: 'Salaires & Commissions' },
  { value: 'Autre dépense', label: 'Autre charge diverse' },
];

export const NewExpenseModal: React.FC<NewExpenseModalProps> = ({ onClose }) => {
  const { addExpense, showToast } = useApp();
  const [amount, setAmount] = useState<number>(0);
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (amount <= 0) {
      showToast('Saisis un montant valide pour la dépense', 'warning');
      return;
    }
    setSaving(true);
    try {
      const created = await addExpense({
        amount,
        category,
        note: note.trim() || undefined,
        date: new Date().toISOString(),
        paymentMethod: 'CASH',
        isAuto: false,
      });
      // Échec : addExpense a déjà affiché son message, on laisse le formulaire
      // ouvert pour que la saisie ne soit pas perdue.
      if (created) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white max-w-sm w-full max-h-[85vh] overflow-y-auto rounded-mc p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-extrabold text-base text-mc-ink">Enregistrer une dépense</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-lg text-slate-400 hover:text-mc-ink hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">1. Montant dépensé (FCFA) *</label>
            <MoneyInput id="input-exp-amount" value={amount} onChange={(val) => setAmount(val)} />
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">2. Catégorie de la charge *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-mc-ink bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Note / Détail (Facultatif)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex: Taxi retour grossiste"
              className="w-full px-3 py-2 rounded-xl border border-mc-line text-xs text-mc-ink"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-slate-600 cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow-md cursor-pointer"
            >
              {saving ? 'Enregistrement…' : 'Valider dépense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
