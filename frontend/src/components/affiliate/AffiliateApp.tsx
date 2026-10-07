import React, { useEffect, useState } from 'react';
import {
  BadgeCheck,
  Check,
  Copy,
  Lock,
  LogOut,
  RefreshCw,
  Send,
  UserPlus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchAffiliate,
  loginAffiliate,
  logoutAffiliate,
  registerAffiliate,
  requestAffiliatePayout,
  saveAffiliateName,
  type AffiliateActivity,
  type AffiliateDashboard,
  type PayoutOperator,
} from '../../api/affiliate';
import { ApiError } from '../../api/client';
import { COUNTRIES, DEFAULT_COUNTRY, type CountryOption } from '../../data/countries';
import { formatMoney } from '../../utils/currency';
import { Logo, LogoMark } from '../common/Logo';
import { PinInput } from '../common/PinInput';

const INDIGO = '#4F46E5';

const PLAN_LABELS: Record<string, string> = { SOLO: 'Solo', BUSINESS: 'Business' };

const OPERATORS: { code: PayoutOperator; label: string }[] = [
  { code: 'ORANGE_MONEY', label: 'Orange Money' },
  { code: 'MTN', label: 'MTN MoMo' },
  { code: 'WAVE', label: 'Wave' },
  { code: 'MOOV', label: 'Moov' },
];

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Impossible de joindre le serveur. Réessaie.';
}

/** « ali » → « Ali », « boutique étoile » → « Boutique Étoile ». */
function capitalizeName(nom: string): string {
  return nom.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

function planLabel(planCode: string | null): string {
  return planCode ? PLAN_LABELS[planCode] ?? planCode : '—';
}

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `jours` : durée d'essai d'un compte inscrit avec le lien (réglages du back-office). */
function shareMessage(lien: string, jours: number): string {
  return `Gère ta boutique avec MoroCash. ${jours} jours d'essai gratuit avec mon lien : ${lien}`;
}

function whatsappShareUrl(lien: string, jours: number): string {
  return `https://wa.me/?text=${encodeURIComponent(shareMessage(lien, jours))}`;
}

/**
 * Espace affilié (/affilie) : compte séparé des boutiques, même format de
 * connexion (numéro WhatsApp + mot de passe à 6 chiffres).
 */
export const AffiliateApp: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'anonymous' | 'ready' | 'error'>('loading');
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null);

  const load = async () => {
    setStatus('loading');
    try {
      const data = await fetchAffiliate();
      setDashboard(data);
      setStatus(data ? 'ready' : 'anonymous');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    document.title = 'Mon espace affilié · MoroCash';
    load();
  }, []);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#F4F4F8] flex flex-col items-center justify-center gap-4">
        <Logo size={44} />
        <RefreshCw className="w-5 h-5 text-[#4F46E5] animate-spin" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[#F4F4F8] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm font-bold text-slate-700">Impossible de joindre le serveur.</p>
        <button
          onClick={load}
          className="px-4 py-2.5 rounded-xl text-white text-xs font-bold cursor-pointer"
          style={{ backgroundColor: INDIGO }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (status === 'anonymous' || !dashboard) {
    return (
      <AffiliateAuth
        onAuthenticated={(data) => {
          setDashboard(data);
          setStatus('ready');
        }}
      />
    );
  }

  // Compte créé avant que le prénom soit demandé : on le demande une fois.
  if (!dashboard.nom) {
    return <NameScreen onSaved={setDashboard} />;
  }

  return (
    <AffiliateHome
      dashboard={dashboard}
      onChange={setDashboard}
      onLogout={async () => {
        await logoutAffiliate().catch(() => undefined);
        setDashboard(null);
        setStatus('anonymous');
      }}
    />
  );
};

// ─── Connexion / création de compte ───

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-[#4F46E5]';

const AffiliateAuth: React.FC<{ onAuthenticated: (data: AffiliateDashboard) => void }> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'REGISTER' | 'LOGIN'>('REGISTER');
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (next: 'REGISTER' | 'LOGIN') => {
    setMode(next);
    setError(null);
    setPin('');
    setPinConfirm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'REGISTER' && nom.trim().length < 2) {
      setError('Indique ton prénom ou ton nom.');
      return;
    }
    if (!/^\d{8,15}$/.test(telephone)) {
      setError('Numéro de téléphone invalide (8 à 15 chiffres).');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError('Le mot de passe doit comporter exactement 6 chiffres.');
      return;
    }
    if (mode === 'REGISTER' && pin !== pinConfirm) {
      setError('Les deux mots de passe ne sont pas identiques.');
      return;
    }

    setIsSubmitting(true);
    try {
      const data =
        mode === 'REGISTER'
          ? await registerAffiliate({ nom: nom.trim(), telephone, pays: country.code, pin })
          : await loginAffiliate({ telephone, pin });
      onAuthenticated(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F4F8] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-[420px] space-y-5">
        <div className="text-center space-y-2">
          <LogoMark size={44} className="mx-auto" />
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Programme d'affiliation</h1>
          <p className="text-xs text-slate-500">
            Partage ton lien MoroCash et gagne une commission à chaque mois d'abonnement payé par les boutiques que tu amènes.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 overflow-hidden">
          <div className="grid grid-cols-2 p-1.5 m-4 mb-0 bg-slate-100 rounded-xl text-xs font-bold">
            {(['REGISTER', 'LOGIN'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`py-2.5 rounded-lg transition-all cursor-pointer ${
                  mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {m === 'REGISTER' ? 'Créer mon compte' : 'Se connecter'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                {error}
              </div>
            )}

            {mode === 'REGISTER' && (
              <div>
                <label htmlFor="affiliate-name" className="text-xs font-bold text-slate-700 block mb-1">
                  Ton prénom
                </label>
                <input
                  id="affiliate-name"
                  type="text"
                  autoComplete="given-name"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex : Aminata"
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label htmlFor="affiliate-phone" className="text-xs font-bold text-slate-700 block mb-1">
                Numéro WhatsApp
              </label>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4F46E5] focus-within:border-[#4F46E5] transition-all">
                <select
                  aria-label="Indicatif pays"
                  value={country.code}
                  onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? DEFAULT_COUNTRY)}
                  className="bg-slate-50 pl-3 pr-1 py-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 shrink-0 cursor-pointer outline-none"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.dialCode}
                    </option>
                  ))}
                </select>
                <input
                  id="affiliate-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
                  placeholder="0708091011"
                  className="w-full min-w-0 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                {mode === 'REGISTER' ? 'Mot de passe à 6 chiffres' : 'Mot de passe'}
              </label>
              <PinInput id="affiliate-pin" value={pin} onChange={setPin} />
            </div>

            {mode === 'REGISTER' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Confirmation du mot de passe</label>
                <PinInput id="affiliate-pin-confirm" value={pinConfirm} onChange={setPinConfirm} />
                {pinConfirm.length === 6 && pin !== pinConfirm && (
                  <p className="text-[11px] font-semibold text-rose-600 mt-1.5">
                    Les deux mots de passe ne sont pas identiques.
                  </p>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 cursor-pointer transition-all hover:opacity-90"
              style={{ backgroundColor: INDIGO, boxShadow: '0 10px 25px -5px rgba(79,70,229,0.35)' }}
            >
              <Lock className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Un instant...'
                  : mode === 'REGISTER'
                    ? 'Créer mon compte affilié'
                    : 'Ouvrir mon espace affilié'}
              </span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

const NameScreen: React.FC<{ onSaved: (data: AffiliateDashboard) => void }> = ({ onSaved }) => {
  const [nom, setNom] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nom.trim().length < 2) {
      setError('Indique ton prénom ou ton nom.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await saveAffiliateName(nom.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#F4F4F8] flex flex-col items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[420px] bg-white rounded-3xl border border-slate-200 p-6 space-y-4"
      >
        <LogoMark size={40} />
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold text-slate-900">Comment t'appelles-tu ?</h1>
          <p className="text-xs text-slate-500">Ton prénom s'affiche dans ton espace affilié.</p>
        </div>
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}
        <input
          type="text"
          autoComplete="given-name"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Ex : Aminata"
          className={inputClass}
        />
        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm disabled:opacity-60 cursor-pointer"
          style={{ backgroundColor: INDIGO }}
        >
          {isSaving ? 'Enregistrement...' : 'Continuer'}
        </button>
      </form>
    </div>
  );
};

// ─── Espace affilié ───

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const AffiliateHome: React.FC<{
  dashboard: AffiliateDashboard;
  onChange: (data: AffiliateDashboard) => void;
  onLogout: () => void;
}> = ({ dashboard, onChange, onLogout }) => {
  const [copied, setCopied] = useState(false);
  const [isPayoutOpen, setIsPayoutOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const { lien, solde, seuilRetrait } = dashboard;
  const seuilAtteint = solde > 0 && solde >= seuilRetrait;
  const canWithdraw = seuilAtteint && !dashboard.retraitEnCours;
  const progress = seuilRetrait > 0 ? Math.min(1, solde / seuilRetrait) : 1;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(lien);
    } catch {
      // Presse-papiers refusé (ancien navigateur) : sélection manuelle.
      window.prompt('Copie ton lien :', lien);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#F4F4F8]">
      <header className="bg-white border-b border-slate-200">
        <div className="w-full max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <Logo size={30} />
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" /> Déconnexion
          </button>
        </div>
      </header>

      <main className="w-full max-w-xl mx-auto px-4 py-5 space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Mon espace affilié</h1>
          <p className="text-sm text-slate-500">Bonjour {capitalizeName(dashboard.nom ?? '')}</p>
        </div>

        {/* Lien à partager */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <h2 className="text-sm font-extrabold text-slate-900">Ton lien à partager</h2>
          <p className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-mono font-semibold text-slate-800 break-all">
            {lien}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyLink}
              className="py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer hover:bg-slate-50"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copié' : 'Copier'}
            </button>
            <a
              href={whatsappShareUrl(lien, dashboard.joursEssaiAvecLien)}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1.5 bg-[#25D366] hover:opacity-90"
            >
              <Send className="w-4 h-4" /> Partager sur WhatsApp
            </a>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed break-words">
            Message envoyé : « {shareMessage(lien, dashboard.joursEssaiAvecLien)} »
          </p>

          {/* Ce que tu gagnes : taux lus dans les réglages du back-office */}
          <div className="rounded-xl bg-[#EEF2FF] p-3 space-y-2">
            <p className="text-xs font-extrabold text-[#3730A3]">Ce que tu gagnes</p>
            {dashboard.taux.map((t) => (
              <div key={t.planCode} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-semibold text-slate-700">Client {planLabel(t.planCode)}</span>
                <span className="text-right">
                  <span className="font-extrabold text-slate-900">{formatMoney(t.montant)}</span>{' '}
                  <span className="text-xs text-slate-500">par mois payé</span>
                </span>
              </div>
            ))}
            <p className="text-[11px] text-slate-600">À chaque renouvellement, tant que le client reste abonné.</p>
          </div>
        </section>

        {/* Compteurs */}
        <section className="grid grid-cols-3 gap-2">
          <Stat icon={Users} label="Inscrits via ton lien" value={String(dashboard.inscrits)} onClick={() => scrollToSection('inscrits')} />
          <Stat icon={BadgeCheck} label="Abonnés payants" value={String(dashboard.payants)} onClick={() => scrollToSection('abonnes')} />
          <Stat icon={Wallet} label="Solde à recevoir" value={formatMoney(solde)} highlight />
        </section>

        {/* Retrait */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          {notice && (
            <div className="p-3 rounded-xl text-xs font-semibold border bg-emerald-50 border-emerald-200 text-emerald-700">
              {notice}
            </div>
          )}
          {dashboard.retraitEnCours ? (
            <p className="text-xs font-semibold text-slate-700">
              Retrait de {formatMoney(dashboard.retraitEnCours.montant)} demandé le {formatDay(dashboard.retraitEnCours.date)}
              {dashboard.retraitEnCours.operateur &&
                ` vers ${OPERATORS.find((o) => o.code === dashboard.retraitEnCours!.operateur)?.label ?? ''} ${dashboard.retraitEnCours.numeroReception ?? ''}`}
              , en cours de paiement.
            </p>
          ) : (
            <div className="space-y-1.5">
              <div
                className="h-2.5 w-full rounded-full bg-[#E0E7FF] overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={seuilRetrait}
                aria-valuenow={Math.min(solde, seuilRetrait)}
              >
                <div className="h-full rounded-full bg-[#4F46E5]" style={{ width: `${progress * 100}%` }} />
              </div>
              <p className="text-xs font-semibold text-slate-700">
                {formatMoney(solde)} sur {formatMoney(seuilRetrait)} ·{' '}
                {seuilAtteint ? 'Tu peux demander ton retrait' : `Il te manque ${formatMoney(seuilRetrait - solde)}`}
              </p>
            </div>
          )}
          <button
            onClick={() => {
              setNotice(null);
              setIsPayoutOpen(true);
            }}
            disabled={!canWithdraw}
            className={`w-full py-3.5 rounded-2xl font-extrabold text-sm ${
              canWithdraw ? 'bg-[#4F46E5] text-white cursor-pointer hover:opacity-90' : 'bg-[#E0E7FF] text-[#3730A3] cursor-not-allowed'
            }`}
          >
            Demander un retrait
          </button>
        </section>

        {/* Inscrits */}
        <section id="inscrits" className="bg-white rounded-2xl border border-slate-200 p-4 scroll-mt-4">
          <h2 className="text-sm font-extrabold text-slate-900 mb-2">
            Inscrits avec ton code {dashboard.code} ({dashboard.inscrits})
          </h2>
          {dashboard.listeInscrits.length === 0 ? (
            <EmptyState icon={UserPlus} text="Personne ne s'est encore inscrit avec ton lien" lien={lien} jours={dashboard.joursEssaiAvecLien} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.listeInscrits.map((compte, i) => (
                <li key={`${compte.nom}-${compte.date}-${i}`} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{capitalizeName(compte.nom)}</p>
                    <p className="text-[11px] text-slate-500">Inscrit le {formatDay(compte.date)}</p>
                  </div>
                  <StatusBadge statut={compte.statut} planCode={compte.planCode} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Abonnés */}
        <section id="abonnes" className="bg-white rounded-2xl border border-slate-200 p-4 scroll-mt-4">
          <h2 className="text-sm font-extrabold text-slate-900 mb-2">Abonnés ({dashboard.payants})</h2>
          {dashboard.listeAbonnes.length === 0 ? (
            <EmptyState icon={BadgeCheck} text="Aucun abonné pour l'instant" lien={lien} jours={dashboard.joursEssaiAvecLien} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.listeAbonnes.map((abonne, i) => (
                <li key={`${abonne.nom}-${i}`} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{capitalizeName(abonne.nom)}</p>
                    <p className="text-[11px] text-slate-500">
                      {planLabel(abonne.planCode)} · {abonne.paiements} paiement{abonne.paiements > 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-extrabold text-emerald-600">+{formatMoney(abonne.commission)}</span>
                </li>
              ))}
              <li className="pt-3 flex items-center justify-between gap-3">
                <span className="text-xs font-extrabold text-slate-900">Total gagné</span>
                <span className="text-sm font-extrabold text-emerald-700">{formatMoney(dashboard.totalGagne)}</span>
              </li>
            </ul>
          )}
        </section>

        {/* Activité récente */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4">
          <h2 className="text-sm font-extrabold text-slate-900 mb-2">Activité récente</h2>
          {dashboard.activite.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">Chaque inscription et chaque paiement apparaîtront ici.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {dashboard.activite.map((event, i) => (
                <ActivityRow key={`${event.type}-${event.date}-${i}`} event={event} />
              ))}
            </ul>
          )}
        </section>
      </main>

      {isPayoutOpen && (
        <PayoutSheet
          dashboard={dashboard}
          onClose={() => setIsPayoutOpen(false)}
          onDone={(data) => {
            onChange(data);
            setIsPayoutOpen(false);
            setNotice('Demande envoyée. Tu seras payé en mobile money sur le numéro indiqué.');
          }}
        />
      )}
    </div>
  );
};

const Stat: React.FC<{ icon: LucideIcon; label: string; value: string; highlight?: boolean; onClick?: () => void }> = ({
  icon: Icon,
  label,
  value,
  highlight,
  onClick,
}) => {
  const content = (
    <>
      <Icon className={`w-4 h-4 ${highlight ? 'text-emerald-600' : 'text-indigo-500'}`} />
      <p className={`text-sm sm:text-base font-extrabold leading-tight break-words ${highlight ? 'text-emerald-700' : 'text-slate-900'}`}>
        {value}
      </p>
      <p className="text-[10px] font-semibold text-slate-500 leading-tight">{label}</p>
    </>
  );
  const className = 'min-w-0 bg-white rounded-2xl border border-slate-200 p-3 flex flex-col gap-1.5 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${className} cursor-pointer hover:border-indigo-300`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
};

const StatusBadge: React.FC<{ statut: 'ESSAI' | 'ABONNE' | 'INACTIF'; planCode: string | null }> = ({
  statut,
  planCode,
}) => {
  if (statut === 'ABONNE') {
    return (
      <span className="shrink-0 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
        Abonné {planLabel(planCode)}
      </span>
    );
  }
  if (statut === 'ESSAI') {
    return <span className="shrink-0 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Essai</span>;
  }
  return <span className="shrink-0 text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">Inactif</span>;
};

const EmptyState: React.FC<{ icon: LucideIcon; text: string; lien: string; jours: number }> = ({
  icon: Icon,
  text,
  lien,
  jours,
}) => (
  <div className="py-6 flex flex-col items-center text-center gap-3">
    <div className="w-14 h-14 rounded-2xl bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center">
      <Icon className="w-7 h-7" />
    </div>
    <p className="text-xs font-semibold text-slate-600">{text}</p>
    <a
      href={whatsappShareUrl(lien, jours)}
      target="_blank"
      rel="noopener noreferrer"
      className="px-4 py-2.5 rounded-xl text-white text-xs font-bold"
      style={{ backgroundColor: INDIGO }}
    >
      Partager mon lien
    </a>
  </div>
);

const PayoutSheet: React.FC<{
  dashboard: AffiliateDashboard;
  onClose: () => void;
  onDone: (data: AffiliateDashboard) => void;
}> = ({ dashboard, onClose, onDone }) => {
  const [operateur, setOperateur] = useState<PayoutOperator | null>(null);
  const [numero, setNumero] = useState(dashboard.telephone);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialCode = COUNTRIES.find((c) => c.code === dashboard.pays)?.dialCode ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!operateur) {
      setError('Choisis ton opérateur.');
      return;
    }
    if (!/^\d{8,15}$/.test(numero)) {
      setError('Numéro de réception invalide (8 à 15 chiffres).');
      return;
    }
    setIsSending(true);
    try {
      onDone(await requestAffiliatePayout({ operateur, numeroReception: numero }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-white rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-slate-900">Demander un retrait</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">{error}</div>
        )}

        <div>
          <p className="text-xs font-bold text-slate-700 mb-1">Montant</p>
          <p className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-base font-extrabold text-slate-900">
            {formatMoney(dashboard.solde)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Tout ton solde à recevoir.</p>
        </div>

        <div role="radiogroup" aria-label="Opérateur">
          <p className="text-xs font-bold text-slate-700 mb-1.5">Opérateur</p>
          <div className="grid grid-cols-2 gap-2">
            {OPERATORS.map((o) => {
              const selected = operateur === o.code;
              return (
                <button
                  key={o.code}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setOperateur(o.code)}
                  className={`py-2.5 rounded-xl border-2 text-xs font-bold cursor-pointer ${
                    selected ? 'border-[#4F46E5] bg-[#EEF2FF] text-[#3730A3]' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="payout-number" className="text-xs font-bold text-slate-700 block mb-1">
            Numéro de réception
          </label>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4F46E5]">
            {dialCode && (
              <span className="bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 flex items-center shrink-0">
                {dialCode}
              </span>
            )}
            <input
              id="payout-number"
              type="tel"
              inputMode="numeric"
              value={numero}
              onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))}
              className="w-full min-w-0 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none font-mono"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSending}
          className="w-full py-3.5 rounded-2xl bg-[#4F46E5] text-white font-extrabold text-sm disabled:opacity-60 cursor-pointer"
        >
          {isSending ? 'Envoi...' : 'Envoyer ma demande'}
        </button>
      </form>
    </div>
  );
};

const ActivityRow: React.FC<{ event: AffiliateActivity }> = ({ event }) => {
  let title: string;
  let detail: string;
  let right: React.ReactNode;

  switch (event.type) {
    case 'INSCRIPTION':
      title = 'Nouvelle inscription';
      detail = capitalizeName(event.boutique);
      right = event.paye ? (
        <span className="text-[11px] font-bold text-slate-500">Abonné</span>
      ) : (
        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Pas encore payé</span>
      );
      break;
    case 'PAIEMENT':
    case 'RENOUVELLEMENT':
      title = `${event.type === 'PAIEMENT' ? 'Paiement' : 'Renouvellement'} ${planLabel(event.planCode)}`;
      detail = `${capitalizeName(event.boutique)} · ${event.mois} mois`;
      right = <span className="text-sm font-extrabold text-emerald-600">+{formatMoney(event.montant)}</span>;
      break;
    case 'RETRAIT_DEMANDE':
      title = 'Retrait demandé';
      detail = 'Demande envoyée';
      right = <span className="text-sm font-bold text-slate-700">{formatMoney(event.montant)}</span>;
      break;
    case 'RETRAIT_PAYE':
      title = 'Retrait payé';
      detail = 'Versé en mobile money';
      right = <span className="text-sm font-bold text-slate-700">{formatMoney(event.montant)}</span>;
      break;
  }

  return (
    <li className="py-2.5 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-900 truncate">{title}</p>
        <p className="text-[11px] text-slate-500 truncate">
          {detail} · {formatDay(event.date)}
        </p>
      </div>
      <div className="shrink-0">{right}</div>
    </li>
  );
};
