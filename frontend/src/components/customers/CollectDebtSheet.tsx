import React, { useMemo, useState } from 'react';
import { CheckCircle2, Receipt, Share2, X } from 'lucide-react';
import { useApp, type DebtPaymentResult } from '../../context/AppContext';
import type { Customer, PaymentMethod, Versement } from '../../types';
import { formatMoney, formatPaymentMethod } from '../../utils/formatters';
import { PAYMENT_METHODS, paymentMethodColors } from '../../utils/paymentMethods';
import { dayMonth, newVersementOfSale, orderLabel, shortOrderNumber, versementLabel } from '../../utils/versements';
import { MoneyInput } from '../common/UIStates';
import { VersementReceiptModal, shareVersementsOnWhatsApp } from '../payments/VersementReceiptModal';

interface CollectDebtSheetProps {
  customer: Customer;
  onClose: () => void;
}

/** Toute la dette, répartie par le serveur de la plus ancienne commande à la plus récente. */
const TOUTE_LA_DETTE = 'ALL';

/**
 * « Encaisser » depuis « Qui me doit ».
 *
 * Deux temps dans la même feuille : la saisie, puis la confirmation. La
 * confirmation ne s'affiche qu'une fois le serveur relu partout — et tout ce
 * qu'elle dit (reste dû, versements créés) vient de sa réponse.
 *
 * Quand le client doit sur plusieurs commandes, on peut en choisir une : le
 * paiement va alors sur elle seule, par le même chemin que « Encaisser » dans
 * la commande. Sans choix, la répartition automatique reste la règle.
 */
export const CollectDebtSheet: React.FC<CollectDebtSheetProps> = ({ customer, onClose }) => {
  const { recordDebtPayment, collectSalePayment, sales, customers, settings } = useApp();

  // La dette affichée est celle du moment où la feuille s'est ouverte : après
  // l'encaissement, la liste derrière a déjà la nouvelle.
  const [dette] = useState(customer.totalDebt);
  const [montant, setMontant] = useState<number>(customer.totalDebt);
  const [methode, setMethode] = useState<PaymentMethod>('CASH');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [resultatAuto, setResultatAuto] = useState<DebtPaymentResult | null>(null);
  const [recuOuvert, setRecuOuvert] = useState<Versement | null>(null);

  // Ses commandes impayées, figées à l'ouverture comme la dette.
  const [impayees] = useState(() =>
    sales
      .filter((s) => s.customerId === customer.id && !s.isCancelled && s.remainingAmount > 0)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  );
  const [cible, setCible] = useState<string>(TOUTE_LA_DETTE);
  const commandeCible = impayees.find((s) => s.id === cible);
  const plafond = commandeCible ? commandeCible.remainingAmount : dette;
  const choisirCible = (id: string) => {
    setCible(id);
    setMontant(impayees.find((s) => s.id === id)?.remainingAmount ?? dette);
  };

  // Encaissement sur une seule commande : le versement créé et la dette
  // restante sont relus dans les données rechargées du serveur.
  const [encaisseSur, setEncaisseSur] = useState<{
    saleId: string;
    montant: number;
    idsAvant: Set<string>;
  } | null>(null);
  const resultat = useMemo<DebtPaymentResult | null>(() => {
    if (resultatAuto) return resultatAuto;
    if (!encaisseSur) return null;
    const nouveau = newVersementOfSale(
      sales.find((s) => s.id === encaisseSur.saleId),
      encaisseSur.idsAvant
    );
    return {
      customerName: customer.name,
      amount: encaisseSur.montant,
      remainingDebt: customers.find((c) => c.id === customer.id)?.totalDebt ?? Math.max(0, dette - encaisseSur.montant),
      versements: nouveau ? [nouveau] : [],
      pending: false,
    };
  }, [resultatAuto, encaisseSur, sales, customers, customer.id, customer.name, dette]);

  const depasse = montant > plafond;
  const valide = montant > 0 && !depasse;

  const valider = async () => {
    // Le bouton se désactive dès le premier tap : pas de double encaissement.
    if (!valide || envoiEnCours) return;
    setEnvoiEnCours(true);
    if (commandeCible) {
      const idsAvant = new Set((commandeCible.payments ?? []).map((p) => p.id));
      const ok = await collectSalePayment(commandeCible.id, montant, methode);
      if (ok) setEncaisseSur({ saleId: commandeCible.id, montant, idsAvant });
      else setEnvoiEnCours(false);
      return;
    }
    const res = await recordDebtPayment(customer.id, montant, methode);
    if (res) setResultatAuto(res);
    else setEnvoiEnCours(false);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-mc border border-mc-line p-5 sm:p-6 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold text-mc-ink">
              {resultat ? 'Paiement enregistré' : 'Encaisser'}
            </h3>
            <p className="text-xs text-mc-soft mt-0.5 truncate">{customer.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="w-12 h-12 -mt-2 -mr-2 shrink-0 rounded-full hover:bg-slate-100 flex items-center justify-center text-mc-soft cursor-pointer"
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
                    className="w-full min-h-[48px] px-3 py-2 rounded-xl border border-mc-line hover:bg-slate-50 flex items-center justify-between gap-3 text-left cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block text-[12px] font-bold text-mc-ink truncate">{orderLabel(v)}</span>
                      <span className="block text-[11px] text-mc-soft">{versementLabel(v.numero)} · voir le reçu</span>
                    </span>
                    <span className="text-[13px] font-extrabold text-mc-ink tabular-nums shrink-0">
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
                  className="w-full h-[52px] rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Receipt className="w-[18px] h-[18px]" />
                  Voir le reçu
                </button>
              )}
              <button
                type="button"
                onClick={() => shareVersementsOnWhatsApp(resultat.versements, settings)}
                className="w-full h-[52px] rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-extrabold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 className="w-[18px] h-[18px]" />
                Envoyer sur WhatsApp
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-2xl border border-mc-line text-slate-600 text-sm font-bold hover:bg-slate-50 cursor-pointer"
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

            {/* Plusieurs commandes impayées : on peut dire laquelle il paie. */}
            {impayees.length > 1 && (
              <div className="space-y-1.5" role="radiogroup" aria-label="Ce qu’il paie">
                <span className="text-xs font-bold text-slate-700">Il paie quoi ?</span>
                {[
                  {
                    id: TOUTE_LA_DETTE,
                    titre: 'Toute sa dette',
                    detail: 'Réparti tout seul, de la plus ancienne commande à la plus récente',
                    reste: dette,
                  },
                  ...impayees.map((s) => ({
                    id: s.id,
                    titre: `Commande ${shortOrderNumber(s.reference)} du ${dayMonth(s.createdAt)}`,
                    detail: s.items
                      .map((it) => it.name)
                      .slice(0, 2)
                      .join(', ') + (s.items.length > 2 ? '…' : ''),
                    reste: s.remainingAmount,
                  })),
                ].map((choix) => {
                  const actif = cible === choix.id;
                  return (
                    <button
                      key={choix.id}
                      type="button"
                      role="radio"
                      aria-checked={actif}
                      onClick={() => choisirCible(choix.id)}
                      className={`w-full min-h-[52px] px-3 py-2 rounded-xl border flex items-center gap-3 text-left cursor-pointer transition-colors ${
                        actif ? 'border-mc-primary bg-mc-primary-tint' : 'border-mc-line bg-white hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 shrink-0 rounded-full border-2 ${
                          actif ? 'border-mc-primary bg-mc-primary shadow-[inset_0_0_0_2.5px_white]' : 'border-slate-300'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-bold text-mc-ink truncate">{choix.titre}</span>
                        <span className="block text-[11.5px] text-mc-soft truncate">{choix.detail}</span>
                      </span>
                      <span className="shrink-0 text-[13px] font-extrabold text-[#DC2626] tabular-nums">
                        {formatMoney(choix.reste)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="input-collect-amount" className="text-xs font-bold text-slate-700">
                Montant reçu
              </label>
              <MoneyInput id="input-collect-amount" value={montant} onChange={setMontant} />
              {depasse && (
                <p role="alert" className="text-[12px] font-bold text-[#DC2626]">
                  {commandeCible
                    ? `Il ne reste que ${formatMoney(plafond)} à payer sur cette commande.`
                    : `Le montant dépasse ce que ${customer.name} te doit (${formatMoney(dette)}).`}
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
              id="btn-validate-collect"
              type="button"
              onClick={valider}
              disabled={!valide || envoiEnCours}
              className="w-full h-[52px] rounded-full bg-mc-primary hover:bg-mc-primary-dark disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-sm font-extrabold shadow-md shadow-indigo-600/20 cursor-pointer"
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
