import React, { useMemo, useState } from 'react';
import { CheckCircle2, Receipt, Share2, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { PaymentMethod, Sale, Versement } from '../../types';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import { PAYMENT_METHODS, paymentMethodColors } from '../../utils/paymentMethods';
import { newVersementOfSale } from '../../utils/versements';
import { VersementReceiptModal, shareVersementsOnWhatsApp } from '../payments/VersementReceiptModal';

interface CollectRemainingModalProps {
  sale: Sale;
  onClose: () => void;
  onCollect: (amount: number, method: PaymentMethod) => Promise<boolean>;
}

/**
 * Encaisser ce qui reste dû sur une commande.
 *
 * Le montant est pré-rempli au reste entier, parce que c'est le cas le plus
 * fréquent : le client vient solder. Il reste modifiable pour un acompte,
 * mais jamais au-delà du reste — on n'encaisse pas plus que ce qui est dû.
 *
 * Une fois l'argent encaissé, la fenêtre reste ouverte sur la confirmation :
 * le reçu du versement se voit, s'imprime ou s'envoie tout de suite.
 */
export const CollectRemainingModal: React.FC<CollectRemainingModalProps> = ({
  sale,
  onClose,
  onCollect,
}) => {
  const { sales, settings } = useApp();
  const [montant, setMontant] = useState<number>(sale.remainingAmount);
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  // Après l'encaissement : le montant, et les paiements qui existaient avant,
  // pour reconnaître celui que le serveur vient d'ajouter.
  const [encaisse, setEncaisse] = useState<{ montant: number; idsAvant: Set<string> } | null>(null);
  const [recuOuvert, setRecuOuvert] = useState<Versement | null>(null);

  const valide = montant > 0 && montant <= sale.remainingAmount;

  // La commande relue du serveur après l'encaissement : son reste et son
  // nouveau versement viennent de là, pas d'un calcul fait ici.
  const commandeRelue = useMemo(() => sales.find((s) => s.id === sale.id), [sales, sale.id]);
  const nouveauVersement = useMemo(
    () => (encaisse ? newVersementOfSale(commandeRelue, encaisse.idsAvant) : null),
    [encaisse, commandeRelue]
  );

  const encaisser = async () => {
    if (!valide || envoiEnCours) return;
    setEnvoiEnCours(true);
    const idsAvant = new Set((sale.payments ?? []).map((p) => p.id));
    const ok = await onCollect(montant, methode);
    setEnvoiEnCours(false);
    if (ok) setEncaisse({ montant, idsAvant });
  };

  if (encaisse) {
    const reste = commandeRelue?.remainingAmount ?? Math.max(0, sale.remainingAmount - encaisse.montant);
    return (
      <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-mc border border-mc-line p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-mc-ink">Paiement enregistré</h3>
              <p className="text-xs text-mc-soft mt-0.5 truncate">
                {sale.customerName || 'Client'} · {sale.reference}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-mc-soft cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <p className="text-sm font-extrabold text-emerald-900 leading-snug">
              {formatMoney(encaisse.montant)} encaissés.{' '}
              {reste > 0 ? `Il reste ${formatMoney(reste)} sur cette commande.` : 'Cette commande est soldée.'}
            </p>
          </div>

          <div className="space-y-2">
            {nouveauVersement && (
              <>
                <button
                  id="btn-collect-view-receipt"
                  type="button"
                  onClick={() => setRecuOuvert(nouveauVersement)}
                  className="w-full h-[52px] rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Receipt className="w-[18px] h-[18px]" />
                  Voir et imprimer le reçu
                </button>
                <button
                  type="button"
                  onClick={() => shareVersementsOnWhatsApp([nouveauVersement], settings)}
                  className="w-full h-[52px] rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Share2 className="w-[18px] h-[18px]" />
                  Envoyer sur WhatsApp
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-2xl border border-mc-line text-slate-600 text-sm font-bold hover:bg-slate-50 cursor-pointer"
            >
              Fermer
            </button>
          </div>
        </div>

        {recuOuvert && <VersementReceiptModal versement={recuOuvert} onClose={() => setRecuOuvert(null)} />}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-mc border border-mc-line p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-mc-ink">Encaisser le reste</h3>
            <p className="text-xs text-mc-soft mt-0.5 truncate">
              {sale.customerName || 'Client'} · {sale.reference}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-mc-soft cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3 flex items-center justify-between">
          <span className="text-xs font-bold text-[#991B1B]">Reste à payer</span>
          <span className="text-[19px] font-extrabold text-[#DC2626] tabular-nums">
            {formatMoney(sale.remainingAmount)}
          </span>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="montant-encaisse" className="text-xs font-bold text-slate-700">
            Montant reçu
          </label>
          <input
            id="montant-encaisse"
            type="number"
            inputMode="numeric"
            value={montant || ''}
            min={1}
            max={sale.remainingAmount}
            onChange={(e) => setMontant(Number(e.target.value))}
            className="w-full px-3.5 py-3 rounded-xl bg-slate-50 border border-mc-line text-lg font-extrabold tabular-nums text-mc-ink focus:outline-none focus:ring-2 focus:ring-[#5B4BF0] focus:bg-white"
          />
          {montant > sale.remainingAmount && (
            <p className="text-[11px] font-bold text-[#DC2626]">
              Il ne reste que {formatMoney(sale.remainingAmount)} à payer sur cette commande.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-700">Payé par</span>
          <div className="grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.map((m) => {
              const actif = methode === m;
              const couleurs = paymentMethodColors(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethode(m)}
                  className={`py-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                    actif ? 'border-transparent' : 'border-mc-line bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                  style={actif ? { backgroundColor: couleurs.bg, color: couleurs.fg } : undefined}
                >
                  {formatPaymentMethod(m)}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={encaisser}
          disabled={!valide || envoiEnCours}
          className="w-full h-[50px] rounded-full bg-mc-primary hover:bg-mc-primary-dark disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-extrabold shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          {envoiEnCours ? 'Encaissement…' : `Encaisser ${formatMoney(montant || 0)}`}
        </button>
      </div>
    </div>
  );
};
