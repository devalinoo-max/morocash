import React, { useMemo, useState } from 'react';
import { ArrowLeft, KeyRound, UserPlus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatMoney, formatDate } from '../../utils/formatters';
import { countLabel } from '../../utils/plural';
import { avatarInitials } from '../../utils/avatar';
import { LOCKED_BTN_CLASS } from '../../utils/paywall';
import { PeriodFilterBar } from '../common/PeriodFilterBar';
import { usePeriodFilter } from '../../hooks/usePeriodFilter';
import { useActivity } from '../../hooks/useActivity';
import { isWithinPeriod } from '../../utils/periodFilter';
import type { ApiEmployee } from '../../api/users';
import {
  PERMISSION_OPTIONS,
  ROLE_LABELS,
  ROLE_PASTILLES,
  ROLE_RESUMES,
  defaultPermissionsForRole,
  hasPermission,
  type EmployeePermission,
  type UserRoleCode,
} from '../../data/permissions';

/**
 * Le volet Employés : qui travaille ici, ce que chacun a vendu, et ce qu'il a
 * le droit de faire.
 *
 * Deux règles tiennent tout l'écran. La première : un employé n'est jamais
 * supprimé, seulement désactivé — ses ventes passées restent dans les totaux,
 * sinon le chiffre d'affaires du mois dernier changerait parce que quelqu'un a
 * quitté la boutique. La seconde : le propriétaire est intouchable, il ne peut
 * ni se désactiver ni changer son propre rôle, faute de quoi une boutique peut
 * se retrouver sans personne pour gérer les employés et l'abonnement.
 */

interface EmployeesPanelProps {
  onBack: () => void;
  onAdd: () => void;
}

/** Ce qu'une personne a fait sur la période affichée. */
interface ChiffresEmploye {
  nbVentes: number;
  chiffreAffaires: number;
  encaisse: number;
  panierMoyen: number;
}

export const EmployeesPanel: React.FC<EmployeesPanelProps> = ({ onBack, onAdd }) => {
  const {
    employees,
    sales,
    settings,
    isWriteLocked,
    gateWrite,
    setEmployeeActive,
    setEmployeeAccess,
    setEmployeeCommercial,
    resetEmployeeCode,
    showToast,
  } = useApp();

  const peutGerer = hasPermission(settings, 'GERER_EMPLOYES');
  const suiviCommercial = !!settings.suiviCommercialActif;

  const { selection, setSelection, period } = usePeriodFilter('employes');
  const { activity } = useActivity(period.start, period.end);

  const [ficheId, setFicheId] = useState<string | null>(null);
  const [codeOuvertPour, setCodeOuvertPour] = useState<string | null>(null);
  const [nouveauCode, setNouveauCode] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  /**
   * Les chiffres de chaque personne sur la période.
   *
   * Le rapprochement se fait par nom : c'est la seule attache que l'appareil
   * connaisse entre une vente et son auteur (`Sale.sellerName`). L'encaissé
   * vient du serveur — ce qui a été payé à la commande, plus les versements
   * qu'elle a reçus — et non d'un recalcul local, pour que ces chiffres soient
   * les mêmes que ceux du tableau de bord.
   */
  const chiffresParNom = useMemo(() => {
    const parNom = new Map<string, ChiffresEmploye>();

    const ventesPeriode = sales.filter(
      (s) => !s.isCancelled && isWithinPeriod(s.createdAt, period)
    );
    for (const vente of ventesPeriode) {
      const nom = vente.sellerName || '';
      const entree = parNom.get(nom) ?? {
        nbVentes: 0,
        chiffreAffaires: 0,
        encaisse: 0,
        panierMoyen: 0,
      };
      entree.nbVentes += 1;
      entree.chiffreAffaires += vente.totalAmount;
      entree.encaisse += activity?.commandes[vente.id]?.paidAtOrder ?? 0;
      parNom.set(nom, entree);
    }

    // Les versements reçus sur la période, même sur d'anciennes ventes : c'est
    // de l'argent que cette personne a bel et bien fait entrer en caisse.
    for (const versement of activity?.versements ?? []) {
      if (versement.isCancelled || !versement.collectedBy) continue;
      const entree = parNom.get(versement.collectedBy) ?? {
        nbVentes: 0,
        chiffreAffaires: 0,
        encaisse: 0,
        panierMoyen: 0,
      };
      entree.encaisse += versement.amount;
      parNom.set(versement.collectedBy, entree);
    }

    for (const entree of parNom.values()) {
      entree.panierMoyen = entree.nbVentes > 0 ? Math.round(entree.chiffreAffaires / entree.nbVentes) : 0;
    }
    return parNom;
  }, [sales, period, activity]);

  const chiffresDe = (emp: ApiEmployee): ChiffresEmploye =>
    chiffresParNom.get(emp.nom) ?? { nbVentes: 0, chiffreAffaires: 0, encaisse: 0, panierMoyen: 0 };

  // Les actifs d'abord : on cherche presque toujours quelqu'un qui travaille
  // encore ici. Les désactivés restent en bas, jamais effacés.
  const liste = useMemo(
    () =>
      [...employees].sort((a, b) => {
        if (a.actif !== b.actif) return a.actif ? -1 : 1;
        if (a.role !== b.role) return a.role === 'OWNER' ? -1 : b.role === 'OWNER' ? 1 : 0;
        return a.nom.localeCompare(b.nom, 'fr');
      }),
    [employees]
  );

  const fiche = liste.find((e) => e.id === ficheId) ?? null;
  const nbActifs = employees.filter((e) => e.actif).length;

  const basculerDroit = async (emp: ApiEmployee, code: EmployeePermission) => {
    const actuels = (emp.permissions ?? []) as EmployeePermission[];
    const suivants = actuels.includes(code)
      ? actuels.filter((p) => p !== code)
      : [...actuels, code];
    await setEmployeeAccess(emp.id, { permissions: suivants });
  };

  const changerRole = async (emp: ApiEmployee, role: 'SELLER' | 'ACCOUNTANT') => {
    if (role === emp.role) return;
    await setEmployeeAccess(emp.id, { role });
  };

  const validerNouveauCode = async () => {
    if (!codeOuvertPour || nouveauCode.length !== 6) {
      showToast('Le code doit faire exactement 6 chiffres.', 'warning');
      return;
    }
    setEnregistrement(true);
    const ok = await resetEmployeeCode(codeOuvertPour, nouveauCode);
    setEnregistrement(false);
    if (ok) {
      setCodeOuvertPour(null);
      setNouveauCode('');
    }
  };

  const pastille = (role: string) => ROLE_PASTILLES[role as UserRoleCode] ?? ROLE_PASTILLES.SELLER;

  return (
    <div className="space-y-4 pb-24 animate-in fade-in duration-150">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 h-11 pr-4 text-[16px] md:text-[14px] font-bold text-mc-primary hover:text-mc-primary-dark cursor-pointer active:scale-[0.97]"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Menu</span>
        </button>
        {peutGerer && (
          <button
            onClick={() => gateWrite(onAdd)}
            className={`h-10 px-4 rounded-full bg-mc-primary hover:bg-mc-primary-dark text-white text-[14px] font-bold flex items-center gap-1.5 cursor-pointer shadow-mc-card transition-all active:scale-[0.97] ${
              isWriteLocked ? LOCKED_BTN_CLASS : ''
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Ajouter un employé</span>
          </button>
        )}
      </div>

      <PeriodFilterBar
        id="btn-employees-period"
        selection={selection}
        onChange={setSelection}
        period={period}
        countLabel={`${countLabel(nbActifs, 'employé')} actif${nbActifs > 1 ? 's' : ''}`}
        totals={
          activity ? { vendu: activity.totalVendu } : undefined
        }
      />

      <div className="p-4 rounded-2xl bg-mc-primary-tint border border-[#DAD6FC]">
        <h3 className="text-xs font-extrabold text-mc-primary-dark">Chacun son compte</h3>
        <p className="text-[11px] text-mc-primary-dark leading-snug mt-0.5">
          Chaque employé se connecte avec son propre numéro et son propre code. Jamais de compte
          partagé : sinon le suivi par vendeur ne vaut rien.
        </p>
      </div>

      {/* =====================================================================
          LA LISTE — nom, numéro, rôle, état, et ce qu'il a fait sur la période
          ===================================================================== */}
      <div className="space-y-2">
        {liste.map((emp) => {
          const c = chiffresDe(emp);
          const couleurs = pastille(emp.role);
          return (
            <button
              key={emp.id}
              type="button"
              onClick={() => setFicheId(emp.id)}
              className={`w-full text-left p-4 rounded-2xl bg-white border border-mc-line shadow-xs flex items-center justify-between gap-3 cursor-pointer transition-all hover:border-mc-primary active:scale-[0.99] ${
                emp.actif ? '' : 'opacity-60'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-100 font-extrabold text-xs text-slate-700 flex items-center justify-center shrink-0">
                  {avatarInitials(emp.nom)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-extrabold text-mc-ink truncate">{emp.nom}</span>
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                      style={{ backgroundColor: couleurs.bg, color: couleurs.fg }}
                    >
                      {ROLE_LABELS[emp.role as UserRoleCode] ?? emp.role}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                        emp.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {emp.actif ? 'Actif' : 'Inactif'}
                    </span>
                    {suiviCommercial && emp.estCommercial && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 shrink-0">
                        Commercial
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-mc-soft mt-0.5 tabular-nums">{emp.telephone}</p>
                </div>
              </div>

              {/* Sur la période affichée : combien de ventes, et combien d'argent
                  cette personne a fait entrer. */}
              <div className="text-right shrink-0">
                <div className="text-[14px] font-extrabold text-mc-ink tabular-nums">
                  {formatMoney(c.encaisse)}
                </div>
                <p className="text-[11px] text-mc-soft">
                  {c.nbVentes === 0 ? 'aucune vente' : countLabel(c.nbVentes, 'vente')}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          LA FICHE — identité, chiffres, permissions, actions
          ===================================================================== */}
      {fiche && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setFicheId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-mc border border-mc-line shadow-2xl max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95"
          >
            <div className="sticky top-0 bg-white border-b border-mc-line px-5 py-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-mc-ink truncate">{fiche.nom}</h3>
              <button
                type="button"
                onClick={() => setFicheId(null)}
                aria-label="Fermer"
                className="w-8 h-8 shrink-0 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-mc-soft cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* 1. IDENTITÉ */}
              <section className="space-y-2">
                <h4 className="text-[11px] font-extrabold text-mc-soft uppercase tracking-wide">
                  Identité
                </h4>
                <dl className="space-y-1.5 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-mc-soft">Numéro WhatsApp</dt>
                    <dd className="font-bold text-mc-ink tabular-nums">{fiche.telephone}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-mc-soft">Rôle</dt>
                    <dd className="font-bold text-mc-ink">
                      {ROLE_LABELS[fiche.role as UserRoleCode] ?? fiche.role}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-mc-soft">Arrivée</dt>
                    <dd className="font-bold text-mc-ink">{formatDate(fiche.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-mc-soft">État</dt>
                    <dd className={`font-bold ${fiche.actif ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {fiche.actif ? 'Actif' : 'Inactif'}
                    </dd>
                  </div>
                </dl>
                <p className="text-[11px] text-mc-soft leading-snug">
                  {ROLE_RESUMES[fiche.role as UserRoleCode]}
                </p>
              </section>

              {/* 2. SES CHIFFRES SUR LA PÉRIODE */}
              <section className="space-y-2">
                <h4 className="text-[11px] font-extrabold text-mc-soft uppercase tracking-wide">
                  Ses chiffres · {period.label.toLowerCase()}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Ventes', valeur: String(chiffresDe(fiche).nbVentes) },
                    { label: 'Chiffre d’affaires', valeur: formatMoney(chiffresDe(fiche).chiffreAffaires) },
                    { label: 'Encaissé', valeur: formatMoney(chiffresDe(fiche).encaisse) },
                    { label: 'Panier moyen', valeur: formatMoney(chiffresDe(fiche).panierMoyen) },
                  ].map((ligne) => (
                    <div key={ligne.label} className="p-3 rounded-xl bg-slate-50 border border-mc-line">
                      <span className="block text-[11px] font-semibold text-mc-soft">{ligne.label}</span>
                      <span className="block text-[15px] font-extrabold text-mc-ink tabular-nums">
                        {ligne.valeur}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 3. SES PERMISSIONS */}
              <section className="space-y-2">
                <h4 className="text-[11px] font-extrabold text-mc-soft uppercase tracking-wide">
                  Ses permissions
                </h4>

                {fiche.role === 'OWNER' ? (
                  <p className="px-3 py-2.5 rounded-xl bg-emerald-50 text-[12px] font-semibold text-emerald-800">
                    Le propriétaire a tous les droits, sans exception. Son rôle ne se change pas et son
                    compte ne se désactive pas.
                  </p>
                ) : !peutGerer ? (
                  <p className="px-3 py-2.5 rounded-xl bg-slate-50 text-[12px] text-mc-soft">
                    Seul le propriétaire peut modifier les droits de l’équipe.
                  </p>
                ) : (
                  <>
                    {/* Le rôle recoche les cases d'un coup ; les cases se
                        reprennent ensuite une par une. */}
                    <div className="flex gap-2">
                      {(['SELLER', 'ACCOUNTANT'] as const).map((role) => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => void changerRole(fiche, role)}
                          className={`flex-1 px-3 py-2 rounded-xl text-[12px] font-bold border cursor-pointer transition-colors ${
                            fiche.role === role
                              ? 'bg-mc-primary text-white border-mc-primary'
                              : 'bg-white text-mc-ink border-mc-line hover:border-mc-primary'
                          }`}
                        >
                          {ROLE_LABELS[role]}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-mc-soft leading-snug">
                      Changer le rôle recoche les cases de ce rôle. Les droits s’appliquent à sa
                      prochaine connexion.
                    </p>

                    <div className="space-y-1.5 pt-1">
                      {PERMISSION_OPTIONS.map((option) => {
                        const coche = hasPermission(fiche, option.code);
                        return (
                          <label
                            key={option.code}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                              coche
                                ? 'bg-mc-primary-tint border-[#DAD6FC]'
                                : 'bg-white border-mc-line hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={coche}
                              onChange={() => void basculerDroit(fiche, option.code)}
                              className="mt-0.5 w-4 h-4 shrink-0 accent-[#5B4BF0] cursor-pointer"
                            />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-mc-ink">{option.label}</span>
                                {option.sensible && (
                                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700">
                                    SENSIBLE
                                  </span>
                                )}
                              </span>
                              <span className="block text-[10px] text-mc-soft leading-snug">
                                {option.aide}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        void setEmployeeAccess(fiche.id, {
                          permissions: defaultPermissionsForRole(fiche.role as UserRoleCode),
                        })
                      }
                      className="text-[12px] font-bold text-mc-primary hover:underline cursor-pointer"
                    >
                      Remettre les droits par défaut de son rôle
                    </button>

                    {suiviCommercial && (
                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-mc-line cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!fiche.estCommercial}
                          onChange={(e) => void setEmployeeCommercial(fiche.id, e.target.checked)}
                          className="w-4 h-4 shrink-0 accent-[#5B4BF0] cursor-pointer"
                        />
                        <span className="text-xs font-bold text-mc-ink">
                          Commercial — ses ventes lui sont attribuées
                        </span>
                      </label>
                    )}
                  </>
                )}
              </section>

              {/* 4. ACTIONS */}
              {peutGerer && fiche.role !== 'OWNER' && (
                <section className="space-y-2 pt-1 border-t border-mc-line">
                  <h4 className="text-[11px] font-extrabold text-mc-soft uppercase tracking-wide pt-3">
                    Actions
                  </h4>

                  <button
                    type="button"
                    onClick={() => {
                      setCodeOuvertPour(fiche.id);
                      setNouveauCode('');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-mc-line bg-white text-[13px] font-bold text-mc-ink inline-flex items-center justify-center gap-2 cursor-pointer hover:border-mc-primary"
                  >
                    <KeyRound className="w-4 h-4" />
                    Réinitialiser son code
                  </button>

                  {/* Désactiver, jamais supprimer : ses ventes passées restent
                      dans les totaux et dans l'historique. */}
                  <button
                    type="button"
                    onClick={() => void setEmployeeActive(fiche.id, !fiche.actif)}
                    className={`w-full px-3 py-2.5 rounded-xl text-[13px] font-bold cursor-pointer transition-colors ${
                      fiche.actif
                        ? 'bg-mc-danger-bg text-[#B91C1C] hover:bg-rose-100'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {fiche.actif ? 'Désactiver l’employé' : 'Réactiver l’employé'}
                  </button>
                  <p className="text-[11px] text-mc-soft leading-snug">
                    Un employé n’est jamais supprimé. Désactivé, il ne peut plus se connecter et
                    disparaît du choix « Vendu par » — mais ses ventes passées restent dans les
                    totaux et dans l’historique.
                  </p>
                </section>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nouveau code : saisi par le propriétaire, dit de vive voix. */}
      {codeOuvertPour && (
        <div
          className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCodeOuvertPour(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-sm rounded-mc border border-mc-line shadow-2xl p-5 space-y-4"
          >
            <h3 className="text-base font-extrabold text-mc-ink">Nouveau code à 6 chiffres</h3>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={nouveauCode}
              onChange={(e) => setNouveauCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full px-3 py-2.5 rounded-xl border border-mc-line text-[15px] font-mono tracking-[0.4em] text-center text-mc-ink focus:outline-none focus:ring-2 focus:ring-mc-primary"
            />
            <p className="text-[11px] text-mc-soft leading-snug">
              Donne-le-lui de vive voix. MoroCash ne le montrera plus jamais.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCodeOuvertPour(null)}
                className="flex-1 py-2.5 rounded-xl border border-mc-line text-xs font-bold text-slate-600 cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={enregistrement || nouveauCode.length !== 6}
                onClick={() => void validerNouveauCode()}
                className="flex-1 py-2.5 rounded-full bg-mc-primary hover:bg-mc-primary-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md cursor-pointer"
              >
                {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
