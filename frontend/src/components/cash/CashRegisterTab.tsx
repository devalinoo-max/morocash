import React, { useState, useMemo } from 'react';
import { motion, MotionConfig } from 'motion/react';
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
import { MC_EASE, TrialPill } from '../sales/SalesKit';

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

  // Ce que le tiroir doit contenir : les espèces seulement. C'est ce montant
  // que le serveur compare au comptage à la fermeture — y mêler Wave ou
  // Orange Money annonçait un écart à un commerçant dont le compte était juste.
  const attenduEnEspeces =
    fondDepart +
    sessionMovements
      .filter((m) => m.methode === 'CASH')
      .reduce((acc, m) => acc + (m.type === 'ENTREE' ? m.montant : -m.montant), 0);

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
    const ecart = countedAmount - attenduEnEspeces;
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
    <div id="cash-register-page" className="font-jakarta text-mc-ink space-y-4 md:space-y-6 pb-24 max-w-[1460px] mx-auto">
      <MotionConfig reducedMotion="user">
      {/* ========================================================================= */}
      {/* EN-TÊTE — sur téléphone le titre est déjà dans la barre haute */}
      {/* ========================================================================= */}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-0 hidden md:block">
          <div className="flex items-center gap-3">
            <h1 className="text-[28px] font-extrabold tracking-tight leading-tight">Ma caisse</h1>
            <TrialPill />
          </div>
          <p className="text-[14px] text-mc-soft">
            Ce qui est entré, ce qui est sorti, et ce que tu dois avoir dans le tiroir.
          </p>
        </div>
        <div className="md:hidden">
          <TrialPill />
        </div>
      </header>

      {/* ========================================================================= */}
      {/* 1. CARTE D'ÉTAT — ouverte ou fermée, depuis quand, et le geste à faire */}
      {/* ========================================================================= */}
      <motion.div
        id="cash-status-banner"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: MC_EASE }}
        className={`p-4 md:p-6 rounded-mc shadow-mc-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          activeCashSession ? 'bg-white border border-mc-line' : 'mc-gradient text-white'
        }`}
      >
        <div className="flex items-center gap-4 min-w-0">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
              activeCashSession ? 'bg-mc-success-bg text-[#15803D]' : 'bg-white/15 text-white'
            }`}
          >
            {activeCashSession ? <Unlock className="w-5 h-5 stroke-[2.5]" /> : <Lock className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[16px] md:text-[20px] font-extrabold tracking-tight">
                {activeCashSession
                  ? `Caisse ouverte depuis ${formatShortDate(activeCashSession.ouverteLe)}${activeCashSession.ouvertePar ? ` par ${activeCashSession.ouvertePar}` : ''}`
                  : 'Caisse actuellement fermée'}
              </h2>
              {activeCashSession && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-bold bg-mc-success-bg text-[#15803D]">
                  <span className="w-2 h-2 rounded-full bg-mc-success animate-pulse" />
                  En service
                </span>
              )}
            </div>
            <p className={`text-[14px] mt-0.5 ${activeCashSession ? 'text-mc-soft' : 'text-white/80'}`}>
              {activeCashSession ? (
                <>
                  Fond de départ : <strong className="text-mc-ink tabular-nums">{formatMoney(fondDepart)}</strong> ·{' '}
                  <strong className="text-mc-ink tabular-nums">{sessionMovements.length}</strong> mouvements enregistrés aujourd'hui
                </>
              ) : (
                'Ouvre ta caisse pour suivre les entrées, sorties et moyens de paiement de la journée.'
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          {activeCashSession ? (
            <button
              onClick={() => gateWrite(() => {
                setCountedAmount(montantAttendu);
                setIsCloseModalOpen(true);
              })}
              className={`h-11 px-5 rounded-full bg-mc-ink hover:bg-[#1E2140] text-white text-[14px] font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Lock className="w-4 h-4" />
              <span>Fermer la caisse et compter</span>
            </button>
          ) : (
            <button
              onClick={() => gateWrite(() => setIsOpenModalOpen(true))}
              className={`h-11 px-6 rounded-full bg-white hover:bg-white/90 text-mc-primary-dark text-[14px] font-bold flex items-center gap-2 cursor-pointer transition-all active:scale-[0.97] ${isWriteLocked ? LOCKED_BTN_CLASS : ''}`}
            >
              <Unlock className="w-4 h-4" />
              <span>Ouvrir la caisse</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* ========================================================================= */}
      {/* 2. PÉRIODE, CHIFFRES CLIQUABLES ET JOURNAL — tout vient du serveur */}
      {/* ========================================================================= */}
      <CashJournalSection>
      {/* ========================================================================= */}
      {/* 6. "QUE VEUX-TU FAIRE ?" (4 actions directes) */}
      {/* ========================================================================= */}
      <div id="quick-cash-actions" className="space-y-3">
        <h3 className="text-[16px] font-bold">Que veux-tu faire ?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(
            [
              {
                key: 'withdraw',
                titre: "Sortir de l'argent de la caisse",
                aide: 'Motif obligatoire pour traçabilité',
                icone: Minus,
                pastille: 'bg-mc-danger-bg text-[#DC2626]',
                verrouillable: true,
                action: () =>
                  gateWrite(() => {
                    setIsActionModalOpen('WITHDRAW');
                    setActionAmount(0);
                    setActionReason('');
                  }),
              },
              {
                key: 'deposit',
                titre: "Ajouter de l'argent dans la caisse",
                aide: 'Apport personnel ou monnaie',
                icone: Plus,
                pastille: 'bg-mc-success-bg text-[#15803D]',
                verrouillable: true,
                action: () =>
                  gateWrite(() => {
                    setIsActionModalOpen('DEPOSIT');
                    setActionAmount(0);
                    setActionReason('');
                  }),
              },
              {
                key: 'expense',
                titre: 'Noter une dépense',
                aide: 'Facture, transport ou marchandise',
                icone: Receipt,
                pastille: 'bg-mc-warning-bg text-[#B45309]',
                verrouillable: false,
                action: () => {
                  setActiveTab('more');
                  setActiveMoreSubTab('expenses');
                },
              },
              {
                key: 'repayment',
                titre: 'Enregistrer un remboursement',
                aide: 'Règlement de dette client',
                icone: TrendingUp,
                pastille: 'bg-mc-primary-tint text-mc-primary-dark',
                verrouillable: false,
                action: () => {
                  setCustomersDebtorsFilter(true);
                  setActiveTab('customers');
                },
              },
            ] as const
          ).map((a) => {
            const Icone = a.icone;
            return (
              <button
                key={a.key}
                onClick={a.action}
                className={`mc-lift p-4 rounded-mc bg-white border border-mc-line shadow-mc-card text-left cursor-pointer flex items-center gap-3 active:scale-[0.97] ${
                  a.verrouillable && isWriteLocked ? LOCKED_BTN_CLASS : ''
                }`}
              >
                <span className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${a.pastille}`}>
                  <Icone className="w-5 h-5" />
                </span>
                <span className="min-w-0">
                  <span className="text-[14px] font-bold block leading-snug">{a.titre}</span>
                  <span className="text-[12px] text-mc-soft block mt-0.5">{a.aide}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      </CashJournalSection>

      {/* ========================================================================= */}
      {/* 7. TES DERNIÈRES FERMETURES */}
      {/* ========================================================================= */}
      <section id="past-closures-card" className="space-y-3">
        <h3 className="text-[16px] font-bold">Tes dernières fermetures de caisse</h3>
        {pastClosedSessions.length === 0 && (
          <p className="p-6 rounded-mc bg-white border border-mc-line text-center text-[14px] text-mc-soft">
            Aucune fermeture de caisse pour l’instant.
          </p>
        )}
        <div className="space-y-2">
          {pastClosedSessions.map((s) => {
            const isJust = s.ecart === 0;
            return (
              <div
                key={s.id}
                className="px-4 py-3 rounded-2xl border border-mc-line bg-white flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isJust ? 'bg-mc-success-bg text-[#15803D]' : 'bg-mc-danger-bg text-[#DC2626]'
                    }`}
                  >
                    {isJust ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </span>
                  <div className="min-w-0">
                    <span className="text-[14px] font-bold block">{formatDate(s.fermeeLe || s.ouverteLe)}</span>
                    <span className="text-[12px] text-mc-soft block truncate">
                      {s.fermeePar || s.ouvertePar ? `Fermée par ${s.fermeePar || s.ouvertePar} · ` : ''}Fond de départ {formatMoney(s.fondDepart)}
                    </span>
                    {s.commentaireEcart && (
                      <span className="text-[12px] text-mc-ink/70 italic block mt-0.5">« {s.commentaireEcart} »</span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <span className="text-[16px] font-extrabold block tabular-nums">{formatMoney(s.montantCompte)}</span>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold tabular-nums ${
                      isJust ? 'bg-mc-success-bg text-[#15803D]' : 'bg-mc-danger-bg text-[#DC2626]'
                    }`}
                  >
                    {isJust ? 'Juste' : `${s.ecart && s.ecart > 0 ? '+' : ''}${formatMoney(s.ecart)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      </MotionConfig>

      {/* ========================================================================= */}
      {/* MODALE 1 : OUVERTURE DE CAISSE */}
      {/* ========================================================================= */}
      {isOpenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-mc p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-mc-primary-tint text-mc-primary-dark flex items-center justify-center">
                  <Unlock className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-extrabold text-mc-ink">Ouvrir la caisse</h3>
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
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:border-[#5B4BF0] text-lg font-extrabold text-mc-ink outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-3 text-xs font-bold text-slate-400">F</span>
                </div>
                <p className="text-[11px] text-mc-soft">
                  Cette somme est ta monnaie de départ, elle n'est pas considérée comme une vente.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpenModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-mc-primary hover:bg-mc-primary-dark text-white text-xs font-bold shadow-xs cursor-pointer"
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
          <div className="bg-white w-full max-w-lg rounded-mc p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-mc-ink text-white flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-mc-ink">Fermer la caisse et compter</h3>
                  <p className="text-[11px] text-mc-soft">Comptage physique des espèces</p>
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
            <div className="p-4 rounded-2xl bg-slate-50 border border-mc-line space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-mc-soft">Espèces attendues en caisse :</span>
                <span className="text-base font-extrabold text-mc-ink">{formatMoney(attenduEnEspeces)}</span>
              </div>
              <p className="text-[11px] text-mc-soft">
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
                    className="w-full h-14 px-4 rounded-xl border border-slate-300 focus:border-[#5B4BF0] text-2xl font-extrabold text-mc-ink outline-none"
                    autoFocus
                  />
                  <span className="absolute right-4 top-4 text-sm font-bold text-slate-400">F</span>
                </div>
              </div>

              {/* Écart en temps réel */}
              {(() => {
                const ecart = countedAmount - attenduEnEspeces;
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
                    <span className="text-sm font-extrabold">
                      {isJust ? 'Compte juste (0 F)' : `${ecart > 0 ? '+' : ''}${formatMoney(ecart)}`}
                    </span>
                  </div>
                );
              })()}

              {/* Si écart non nul: commentaire OBLIGATOIRE */}
              {countedAmount !== attenduEnEspeces && (
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
                    className="w-full p-3 rounded-xl border border-rose-300 focus:ring-1 focus:ring-rose-500 text-xs text-mc-ink outline-none"
                    required
                  ></textarea>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCloseModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-mc-ink hover:bg-[#1E2140] text-white text-xs font-bold shadow-xs cursor-pointer"
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
          <div className="bg-white w-full max-w-md rounded-mc p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-white ${
                    isActionModalOpen === 'WITHDRAW' ? 'bg-rose-600' : 'bg-emerald-600'
                  }`}
                >
                  {isActionModalOpen === 'WITHDRAW' ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                </div>
                <h3 className="text-sm font-extrabold text-mc-ink">
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
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:border-[#5B4BF0] text-xl font-extrabold text-mc-ink outline-none"
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
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 text-xs font-semibold text-mc-ink bg-white"
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
                  className="w-full h-10 px-3 rounded-xl border border-slate-300 focus:border-[#5B4BF0] text-xs text-mc-ink outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsActionModalOpen(null)}
                  className="px-4 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
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
