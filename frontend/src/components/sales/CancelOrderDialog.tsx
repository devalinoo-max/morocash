import React, { useState } from 'react';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import type { Sale } from '../../types';
import { formatMoney } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';

interface CancelOrderDialogProps {
  sale: Sale;
  onClose: () => void;
  onConfirm: (motif: string) => Promise<void> | void;
}

const MOTIFS = [
  'Erreur de saisie',
  'Le client a changé d’avis',
  'Produit indisponible',
  'Autre',
] as const;

/**
 * Annulation d'une commande, en deux temps.
 *
 * Annuler n'est pas « supprimer » : le stock revient, les paiements sont
 * invalidés, la dette du client est corrigée, et la ligne d'origine reste.
 * C'est irréversible, et ça touche quatre choses à la fois — d'où la
 * confirmation en deux écrans et le motif obligatoire, qui sera relu plus
 * tard dans l'historique de la commande.
 */
export const CancelOrderDialog: React.FC<CancelOrderDialogProps> = ({ sale, onClose, onConfirm }) => {
  const [etape, setEtape] = useState<1 | 2>(1);
  const [motif, setMotif] = useState<string>('');
  const [precision, setPrecision] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const nbArticles = sale.items.reduce((total, it) => total + it.quantity, 0);
  const motifComplet = motif === 'Autre' ? precision.trim() : [motif, precision.trim()].filter(Boolean).join(' — ');
  const peutConfirmer = motif !== '' && (motif !== 'Autre' || precision.trim().length > 0);

  const confirmer = async () => {
    if (!peutConfirmer || envoiEnCours) return;
    setEnvoiEnCours(true);
    try {
      await onConfirm(motifComplet);
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[90vh] overflow-y-auto">
        {etape === 1 ? (
          <>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Annuler la commande {sale.reference} ?
              </h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Voici ce que l’annulation va corriger :
              </p>
              <ul className="text-xs text-slate-600 mt-2 space-y-1.5 list-disc pl-4 leading-relaxed">
                <li>{countLabel(nbArticles, 'article')} {nbArticles > 1 ? 'reviennent' : 'revient'} en stock</li>
                {sale.paidAmount > 0 && (
                  <li>{formatMoney(sale.paidAmount)} déjà encaissés sont retirés de la caisse</li>
                )}
                {sale.remainingAmount > 0 && (
                  <li>{formatMoney(sale.remainingAmount)} de dette sont effacés pour {sale.customerName || 'le client'}</li>
                )}
                <li>La commande reste visible, barrée, et ne compte dans aucun chiffre</li>
              </ul>
              <p className="text-xs text-slate-500 mt-3">
                C’est définitif : une commande annulée ne se rétablit pas.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Garder la commande
              </button>
              <button
                type="button"
                onClick={() => setEtape(2)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs cursor-pointer"
              >
                Continuer
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEtape(1)}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Retour
            </button>
            <div>
              <h3 className="text-base font-black text-slate-900">Pourquoi cette annulation ?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Le motif reste dans l’historique de la commande.
              </p>
            </div>

            <div className="space-y-1.5">
              {MOTIFS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotif(m)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    motif === m
                      ? 'border-rose-300 bg-rose-50 text-rose-800'
                      : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="precision-annulation" className="text-xs font-bold text-slate-700">
                {motif === 'Autre' ? 'Précise le motif' : 'Une précision ? (facultatif)'}
              </label>
              <input
                id="precision-annulation"
                type="text"
                value={precision}
                onChange={(e) => setPrecision(e.target.value)}
                placeholder="Ex : le client a repris sa commande le lendemain"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Garder la commande
              </button>
              <button
                type="button"
                onClick={confirmer}
                disabled={!peutConfirmer || envoiEnCours}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-black shadow-xs cursor-pointer"
              >
                {envoiEnCours ? 'Annulation…' : 'Confirmer l’annulation'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
