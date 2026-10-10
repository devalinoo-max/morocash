import React, { useState } from 'react';
import { CheckCircle2, Receipt, Share2, X } from 'lucide-react';
import { useApp, type DebtPaymentResult } from '../../context/AppContext';
import type { Customer, PaymentMethod, Versement } from '../../types';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import { PAYMENT_METHODS, paymentMethodColors } from '../../utils/paymentMethods';
import { orderLabel, versementLabel } from '../../utils/versements';
import { MoneyInput } from '../common/UIStates';
import { VersementReceiptModal, shareVersementsOnWhatsApp } from '../payments/VersementReceiptModal';

interface CollectDebtSheetProps {
  customer: Customer;
  onClose: () => void;
}

/**
 * « Encaisser » depuis « Qui me doit ».
 *
 * Deux temps dans la même feuille : la saisie, puis la confirmation. La
 * confirmation ne s'affiche qu'une fois le serveur relu partout — et tout ce
 * qu'elle dit (reste dû, versements créés) vient de sa réponse.
 */
export const CollectDebtSheet: React.FC<CollectDebtSheetProps> = ({ customer, onClose }) => {
  const { recordDebtPayment, settings } = useApp();

  // La dette affichée est celle du moment où la feuille s'est ouverte : après
  // l'encaissement, la liste derrière a déjà la nouvelle.
  const [dette] = useState(customer.totalDebt);
  const [montant, setMontant] = useState<number>(customer.totalDebt);
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [resultat, setResultat] = useState<DebtPaymentResult | null>(null);
  const [recuOuvert, setRecuOuvert] = useState<Versement | null>(null);

  const depasse = montant > dette;
  const valide = montant > 0 && !depasse;

  const valider = async () => {
    // Le bouton se désactive dès le premier tap : pas de double encaissement.
    if (!valide || envoiEnCours) return;
    setEnvoiEnCours(true);
    const res = await recordDebtPayment(customer.id, montant, methode);
    if (res) setResultat(res);
    else setEnvoiEnCours(false);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-black text-slate-900">
              {resultat ? 'Paiement enregistré' : 'Encaisser'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{customer.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-12 h-12 -mt-2 -mr-2 shrink-0 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {resultat ? (
          <>
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-emerald-900 leading-snug">
                  {formatMoney(resultat.amount)} encaissés de {resultat.customerName}.{' '}
                  {resultat.remainingDebt > 0
                    ? `Il lui reste ${formatMoney(resultat.remainingDebt)}.`
                    : 'Il ne te doit plus rien.'}
                </p>
                {resultat.pending && (
                  <p className="mt-1.5 text-[11.5px] font-semibold text-amber-900">
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 font-extrabold">En attente d’envoi</span>{' '}
                    Gardé sur ce téléphone. Le montant restant est provisoire jusqu’au retour du réseau.
                  </p>
                )}
              </div>
            </div>

            {resultat.versements.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-[11.5px] font-bold text-slate-600">
                  Réparti sur {resultat.versements.length} commandes, de la plus ancienne à la plus récente :
                </p>
                {resultat.versements.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setRecuOuvert(v)}
                    className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block text-[12px] font-bold text-slate-900 truncate">{orderLabel(v)}</span>
                      <span className="block text-[11px] text-slate-500">{versementLabel(v.numero)} · voir le reçu</span>
                    </span>
                    <span className="text-[13px] font-black text-slate-900 tabular-nums shrink-0">
                      {formatMoney(v.amount)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {resultat.versements.length === 1 && (
                <button
                  type="button"
                  onClick={() => setRecuOuvert(resultat.versements[0])}
                  className="w-full h-[52px] rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Receipt className="w-[18px] h-[18px]" />
                  Voir le reçu
                </button>
              )}
              <button
                type="button"
                onClick={() => shareVersementsOnWhatsApp(resultat.versements, settings)}
                className="w-full h-[52px] rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-black flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 className="w-[18px] h-[18px]" />
                Envoyer sur WhatsApp
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-2xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-[#FEF2F2] border border-[#FECACA] p-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-[#991B1B]">
                Il te doit{customer.debtProvisional ? ' (provisoire)' : ''}
              </span>
              <span className="text-[19px] font-extrabold text-[#DC2626] tabular-nums">{formatMoney(dette)}</span>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="input-collect-amount" className="text-xs font-bold text-slate-700">
                Montant reçu
              </label>
              <MoneyInput id="input-collect-amount" value={montant} onChange={setMontant} />
              {depasse && (
                <p role="alert" className="text-[12px] font-bold text-[#DC2626]">
                  Le montant dépasse ce que {customer.name} te doit ({formatMoney(dette)}).
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Mode de paiement</span>
              <div className="grid grid-cols-3 gap-1.5">
                {PAYMENT_METHODS.map((m) => {
                  const actif = methode === m;
                  const couleurs = paymentMethodColors(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethode(m)}
                      aria-pressed={actif}
                      className={`min-h-[48px] px-1 rounded-xl text-[11.5px] font-bold border transition-all cursor-pointer ${
                        actif ? 'border-transparent' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
              id="btn-validate-collect"
              type="button"
              onClick={valider}
              disabled={!valide || envoiEnCours}
              className="w-full h-[52px] rounded-2xl bg-[#4F46E5] hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-black shadow-md shadow-indigo-600/20 cursor-pointer"
            >
              {envoiEnCours ? 'Enregistrement…' : 'Valider le paiement'}
            </button>
          </>
        )}
      </div>

      {recuOuvert && <VersementReceiptModal versement={recuOuvert} onClose={() => setRecuOuvert(null)} />}
    </div>
  );
};
