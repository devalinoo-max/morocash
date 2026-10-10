import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Wallet,
  Clock,
  Plus,
  Minus,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  X,
  Lock,
  Unlock,
  CreditCard,
  Banknote,
  Send,
  Calendar,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import { formatMoney, formatDate, formatShortDate } from '../../utils/formatters';
import { PaymentMethod } from '../../types';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import { CashJournalSection } from './CashJournalSection';

export const CashRegisterTab: React.FC = () => {
  const {
    cashSessions,
    activeCashSession,
    cashMovements,
    openCashRegister,
    closeCashRegister,
    addCashMovement,
    settings,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    showToast,
    isWriteLocked,
    gateWrite,
  } = useApp();

  // Modals state
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState<'WITHDRAW' | 'DEPOSIT' | null>(null);

  // Close Register form state
  const [countedAmount, setCountedAmount] = useState<number>(0);
  const [discrepancyComment, setDiscrepancyComment] = useState<string>('');

  // Open Register form state
  const [startFundAmount, setStartFundAmount] = useState<number>(10000);

  // Action (Withdraw/Deposit) form state
  const [actionAmount, setActionAmount] = useState<number>(0);
  const [actionMethod, setActionMethod] = useState<PaymentMethod>('CASH');
  const [actionReason, setActionReason] = useState<string>('');

  // 1. Calculations for the active session
  const sessionMovements = useMemo(() => {
    if (!activeCashSession) return [];
    return cashMovements.filter((m) => m.cashRegisterId === activeCashSession.id);
  }, [activeCashSession, cashMovements]);

  const fondDepart = activeCashSession ? activeCashSession.fondDepart : 0;

  const totalEntrees = sessionMovements
    .filter((m) => m.type === 'ENTREE')
    .reduce((acc, m) => acc + m.montant, 0);

  const totalSorties = sessionMovements
    .filter((m) => m.type === 'SORTIE')
    .reduce((acc, m) => acc + m.montant, 0);

  // The amount expected in cash register
  const montantAttendu = fondDepart + totalEntrees - totalSorties;

  // Previous closed sessions
  const pastClosedSessions = cashSessions.filter((s) => s.statut === 'FERMEE').slice(0, 4);

  // Handlers
  const handleOpenRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startFundAmount < 0) {
      showToast('Saisis un montant valide pour le fond de départ', 'warning');
      return;
    }
    await openCashRegister(startFundAmount);
    setIsOpenModalOpen(false);
  };

  const handleCloseRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const ecart = countedAmount - montantAttendu;
    if (ecart !== 0 && !discrepancyComment.trim()) {
      showToast('Un motif est obligatoire pour justifier l’écart de caisse', 'warning');
      return;
    }
    await closeCashRegister(countedAmount, discrepancyComment.trim() || undefined);
    setIsCloseModalOpen(false);
    setCountedAmount(0);
    setDiscrepancyComment('');
  };

  const handleActionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionAmount <= 0) {
      showToast('Saisis un montant supérieur à 0', 'warning');
      return;
    }
    if (isActionModalOpen === 'WITHDRAW' && !actionReason.trim()) {
      showToast('Toute sortie de caisse exige un motif obligatoire', 'warning');
      return;
    }

    await addCashMovement({
      type: isActionModalOpen === 'WITHDRAW' ? 'SORTIE' : 'ENTREE',
      origine: isActionModalOpen === 'WITHDRAW' ? 'RETRAIT' : 'APPORT',
      montant: actionAmount,
      methode: actionMethod,
      motif: actionReason.trim() || (isActionModalOpen === 'WITHDRAW' ? 'Sortie manuelle' : 'Apport de monnaie'),
    });

    setIsActionModalOpen(null);
    setActionAmount(0);
    setActionReason('');
  };

  return (
    <div id="cash-register-page" className="space-y-6 pb-24 max-w-[1460px] mx-auto animate-in fade-in duration-200">
      {/* ========================================================================= */}
      {/* 1. BANDEAU D'ÉTAT (BLOC 7: Vert doux si ouverte, gris si fermée) */}
      {/* ========================================================================= */}
      <div
        id="cash-status-banner"
        className={`p-4 sm:p-5 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs transition-all ${
          activeCashSession
            ? 'bg-[#ECFDF5] border-[#A7F3D0]'
            : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
              activeCashSession ? 'bg-[#059669] text-white' : 'bg-slate-300 text-slate-700'
            }`}
          >
            {activeCashSession ? <Unlock className="w-5 h-5 stroke-[2.5]" /> : <Lock className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                {activeCashSession
                  ? `Caisse ouverte depuis ${formatShortDate(activeCashSession.ouverteLe)} par ${activeCashSession.ouvertePar}`
                  : 'Caisse actuellement fermée'}
              </h2>
              {activeCashSession && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  En service
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              {activeCashSession ? (
                <>
                  Fond de départ : <strong className="text-slate-900">{formatMoney(fondDepart)}</strong> ·{' '}
                  <strong className="text-slate-900">{sessionMovements.length}</strong> mouvements enregistrés aujourd'hui
                </>
              ) : (
                'Ouvre ta caisse pour suivre les entrées, sorties et moyens de paiement de la journée.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeCashSession ? (
            <button
              onClick={() => gateWrite(() => {
                setCountedAmount(montantAttendu);
                setIsCloseModalOpen(true);
              })}
              className={`px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Fermer la caisse et compter</span>
            </button>
          ) : (
            <button
              onClick={() => gateWrite(() => setIsOpenModalOpen(true))}
              className={`px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Ouvrir la caisse</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. PÉRIODE, CHIFFRES CLIQUABLES ET JOURNAL — tout vient du serveur */}
      {/* ========================================================================= */}
      <CashJournalSection>
      {/* ========================================================================= */}
      {/* 6. "QUE VEUX-TU FAIRE ?" (BLOC 7: 4 actions directes) */}
      {/* ========================================================================= */}
      <div id="quick-cash-actions" className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
        <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
          Que veux-tu faire ?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => gateWrite(() => {
              setIsActionModalOpen('WITHDRAW');
              setActionAmount(0);
              setActionReason('');
            })}
            className={`p-4 rounded-2xl border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-left transition-all cursor-pointer group flex items-start gap-3 ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Minus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-rose-700 transition-colors">
                Sortir de l'argent de la caisse
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Motif obligatoire pour traçabilité
              </span>
            </div>
          </button>

          <button
            onClick={() => gateWrite(() => {
              setIsActionModalOpen('DEPOSIT');
              setActionAmount(0);
              setActionReason('');
            })}
            className={`p-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-left transition-all cursor-pointer group flex items-start gap-3 ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-emerald-700 transition-colors">
                Ajouter de l'argent dans la caisse
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Apport personnel ou monnaie
              </span>
            </div>
          </button>

          <button
            onClick={() => {
              setActiveTab('more');
              setActiveMoreSubTab('expenses');
            }}
            className="p-4 rounded-2xl border border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-left transition-all cursor-pointer group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-amber-700 transition-colors">
                Noter une dépense
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Facture, transport ou marchandise
              </span>
            </div>
          </button>

          <button
            onClick={() => {
              setCustomersDebtorsFilter(true);
              setActiveTab('customers');
            }}
            className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-left transition-all cursor-pointer group flex items-start gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-[#4F46E5] text-white flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-extrabold text-slate-900 block group-hover:text-indigo-700 transition-colors">
                Enregistrer un remboursement
              </span>
              <span className="text-[11px] text-slate-500 block mt-0.5">
                Règlement de dette client
              </span>
            </div>
          </button>
        </div>
      </div>

      </CashJournalSection>

      {/* ========================================================================= */}
      {/* 7. TES DERNIÈRES FERMETURES (BLOC 7) */}
      {/* ========================================================================= */}
      <div>
        <div id="past-closures-card" className="bg-white p-6 rounded-3xl border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
            Tes dernières fermetures de caisse
          </h3>
          <div className="space-y-3">
            {pastClosedSessions.map((s) => {
              const isJust = s.ecart === 0;
              return (
                <div
                  key={s.id}
                  className="p-3.5 rounded-2xl border border-slate-200/80 bg-slate-50/50 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-slate-900 block">
                      {formatDate(s.fermeeLe || s.ouverteLe)}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Fermée par {s.fermeePar || s.ouvertePar} · Fond de départ {formatMoney(s.fondDepart)}
                    </span>
                    {s.commentaireEcart && (
                      <span className="text-[10px] text-slate-600 italic block mt-0.5">
                        « {s.commentaireEcart} »
                      </span>
                    )}
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <span className="text-sm font-black text-slate-900 block tabular-nums">
                      {formatMoney(s.montantCompte)}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        isJust
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isJust ? 'Juste' : `${s.ecart && s.ecart > 0 ? '+' : ''}${formatMoney(s.ecart)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* MODALE 1 : OUVERTURE DE CAISSE */}
      {/* ========================================================================= */}
      {isOpenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#4F46E5] flex items-center justify-center">
                  <Unlock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">Ouvrir la caisse</h3>
              </div>
              <button
                onClick={() => setIsOpenModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleOpenRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Combien mets-tu dans la caisse pour démarrer ? (Fond de départ)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={startFundAmount || ''}
                    onChange={(e) => setStartFundAmount(Number(e.target.value))}
                    placeholder="Ex: 10 000"
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-lg font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-3 text-xs font-bold text-slate-400">F</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Cette somme est ta monnaie de départ, elle n'est pas considérée comme une vente.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpenModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Confirmer l'ouverture
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALE 2 : FERMETURE DE CAISSE ET COMPTAGE (BLOC 7) */}
      {/* ========================================================================= */}
      {isCloseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Fermer la caisse et compter</h3>
                  <p className="text-[11px] text-slate-500">Comptage physique des espèces</p>
                </div>
              </div>
              <button
                onClick={() => setIsCloseModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Récapitulatif attendu */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Montant attendu en caisse :</span>
                <span className="text-base font-black text-slate-900">{formatMoney(montantAttendu)}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Compte toutes les pièces et billets actuellement présents dans ton tiroir ou ta boîte.
              </p>
            </div>

            <form onSubmit={handleCloseRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Combien as-tu compté réellement ?
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={countedAmount || ''}
                    onChange={(e) => setCountedAmount(Number(e.target.value))}
                    placeholder="Saisis le montant compté"
                    className="w-full h-14 px-4 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-2xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-4 text-sm font-bold text-slate-400">F</span>
                </div>
              </div>

              {/* Écart en temps réel */}
              {(() => {
                const ecart = countedAmount - montantAttendu;
                const isJust = ecart === 0;
                return (
                  <div
                    className={`p-3.5 rounded-xl border text-xs flex items-center justify-between font-bold ${
                      isJust
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : ecart < 0
                        ? 'bg-rose-50 border-rose-200 text-rose-800'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    <span>Écart constaté :</span>
                    <span className="text-sm font-black">
                      {isJust ? 'Compte juste (0 F)' : `${ecart > 0 ? '+' : ''}${formatMoney(ecart)}`}
                    </span>
                  </div>
                );
              })()}

              {/* Si écart non nul: commentaire OBLIGATOIRE */}
              {countedAmount !== montantAttendu && (
                <div className="space-y-1.5 animate-in fade-in">
                  <label className="text-xs font-bold text-rose-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Commentaire d'écart obligatoire :</span>
                  </label>
                  <textarea
                    rows={2}
                    value={discrepancyComment}
                    onChange={(e) => setDiscrepancyComment(e.target.value)}
                    placeholder="Ex: Erreur rendu monnaie client pressé, pourboire non noté..."
                    className="w-full p-3 rounded-xl border border-rose-300 focus:ring-1 focus:ring-rose-500 text-xs text-slate-800 outline-none"
                    required
                  ></textarea>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Valider la fermeture définitive
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALE 3 : SORTIE / AJOUT DE FONDS (BLOC 7: motif obligatoire si sortie) */}
      {/* ========================================================================= */}
      {isActionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${
                    isActionModalOpen === 'WITHDRAW' ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                >
                  {isActionModalOpen === 'WITHDRAW' ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  {isActionModalOpen === 'WITHDRAW' ? 'Sortir de l’argent de la caisse' : 'Ajouter de l’argent dans la caisse'}
                </h3>
              </div>
              <button
                onClick={() => setIsActionModalOpen(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleActionSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Montant</label>
                <div className="relative">
                  <input
                    type="number"
                    value={actionAmount || ''}
                    onChange={(e) => setActionAmount(Number(e.target.value))}
                    placeholder="0"
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-xl font-black text-slate-900 outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-3.5 text-xs font-bold text-slate-400">F</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Moyen</label>
                <select
                  value={actionMethod}
                  onChange={(e) => setActionMethod(e.target.value as PaymentMethod)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800 bg-white"
                >
                  <option value="CASH">Espèces</option>
                  <option value="WAVE">Wave</option>
                  <option value="ORANGE_MONEY">Orange Money</option>
                  <option value="MTN">MTN Mobile Money</option>
                  <option value="MOOV">Moov Money</option>
                  <option value="VIREMENT">Virement</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">
                  Motif {isActionModalOpen === 'WITHDRAW' && <span className="text-rose-600">* (Obligatoire)</span>}
                </label>
                <input
                  type="text"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder={
                    isActionModalOpen === 'WITHDRAW'
                      ? 'Ex: Dépannage personnel, achat petit matériel...'
                      : 'Ex: Apport personnel monnaie'
                  }
                  required={isActionModalOpen === 'WITHDRAW'}
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 focus:border-[#4F46E5] text-xs text-slate-800 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer ${
                    isActionModalOpen === 'WITHDRAW' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  Valider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
