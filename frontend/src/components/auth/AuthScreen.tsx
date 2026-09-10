import React, { useState } from 'react';
import { lastKnownPhone } from '../../utils/session';
import { useApp } from '../../context/AppContext';
import {
  ArrowRight,
  ArrowLeft,
  Lock,
  Phone,
  Store,
  MapPin,
  Mail,
  Wallet,
  Wifi,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { Logo, LogoMark } from '../common/Logo';
import { PinInput } from '../common/PinInput';
import { COUNTRIES, DEFAULT_COUNTRY, CountryOption } from '../../data/countries';


/**
 * Secteurs proposes a l'inscription. Ils ne servent qu'a choisir les
 * categories de depart (voir starterProductCategories cote serveur) : rien
 * n'est verrouille par ce choix.
 */
const BUSINESS_SECTORS = [
  { code: 'ALIMENTATION' as const, label: 'Alimentation' },
  { code: 'COSMETIQUES' as const, label: 'Cosmétiques' },
  { code: 'PRET_A_PORTER' as const, label: 'Prêt-à-porter' },
  { code: 'ELECTRONIQUE' as const, label: 'Électronique' },
  { code: 'SERVICES' as const, label: 'Services' },
  { code: 'AUTRE' as const, label: 'Autre chose' },
];

type BusinessSector = (typeof BUSINESS_SECTORS)[number]['code'];

type Mode = 'LOGIN' | 'REGISTER';

const BRAND_INDIGO = '#4338CA';

interface AuthScreenProps {
  initialMode?: Mode;
  /** Permet à l'adresse de suivre l'onglet choisi (/connexion vs /inscription). */
  onModeChange?: (mode: Mode) => void;
}

/**
 * Écran d'authentification réel (étape 13) — le backend n'accepte pas de nom
 * de gérant à l'inscription (POST /auth/register génère le nom du OWNER),
 * donc ce champ n'est pas proposé ici : ce serait inventer un paramètre hors
 * spec. Inscription en 2 étapes (boutique/localisation puis contact/PIN) pour
 * un onboarding plus guidé qu'un long formulaire unique.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ initialMode = 'REGISTER', onModeChange }) => {
  const { registerBusinessAccount, loginUser } = useApp();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Champs communs
  // Session expiree : le numero de la derniere connexion reussie est deja la,
  // le commercant n'a plus qu'a taper son code (point 3).
  const [telephone, setTelephone] = useState(lastKnownPhone);
  const [pin, setPin] = useState('');

  // Inscription
  const [businessNom, setBusinessNom] = useState('');
  const [ville, setVille] = useState('');
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [email, setEmail] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [secteur, setSecteur] = useState<BusinessSector>('ALIMENTATION');

  // Connexion multi-boutiques (même numéro dans plusieurs boutiques)
  const [businessChoices, setBusinessChoices] = useState<{ businessId: string; businessNom: string }[] | null>(null);

  const resetBusinessChoices = () => setBusinessChoices(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    onModeChange?.(next);
    setRegisterStep(1);
    setErrorMessage(null);
    resetBusinessChoices();
  };

  const handleContinueStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!businessNom.trim()) {
      setErrorMessage('Le nom de la boutique est obligatoire.');
      return;
    }
    setRegisterStep(2);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!/^\d{8,15}$/.test(telephone.trim())) {
      setErrorMessage('Numéro de téléphone invalide (8 à 15 chiffres).');
      return;
    }
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrorMessage('Adresse e-mail invalide.');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setErrorMessage('Le code PIN doit comporter exactement 6 chiffres.');
      return;
    }
    if (pin !== pinConfirm) {
      setErrorMessage('Les deux codes PIN ne correspondent pas.');
      return;
    }

    setIsSubmitting(true);
    const result = await registerBusinessAccount({
      businessNom: businessNom.trim(),
      ville: ville.trim() || undefined,
      pays: country.code,
      email: email.trim() || undefined,
      telephone: telephone.trim(),
      pin,
      secteur,
    });
    setIsSubmitting(false);
    if (!result.success) {
      setErrorMessage(result.message ?? "Impossible de créer la boutique.");
    }
  };

  const handleLogin = async (e: React.FormEvent, businessId?: string) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!/^\d{8,15}$/.test(telephone.trim())) {
      setErrorMessage('Numéro de téléphone invalide.');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setErrorMessage('Le code PIN doit comporter exactement 6 chiffres.');
      return;
    }

    setIsSubmitting(true);
    const result = await loginUser({ telephone: telephone.trim(), pin, businessId });
    setIsSubmitting(false);

    if (result.requiresBusinessSelection && result.businesses) {
      setBusinessChoices(result.businesses);
      return;
    }
    if (!result.success) {
      setErrorMessage(result.message ?? 'Numéro ou code incorrect.');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row">
      {/* PANNEAU GAUCHE : branding (masqué sur mobile) */}
      <div className="hidden md:flex md:w-1/2 relative bg-[#0a0d18] text-white p-10 lg:p-14 flex-col justify-between overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundSize: '38px 38px',
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)',
          }}
        />
        <div className="absolute top-[-80px] left-[-80px] w-96 h-96 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(67,56,202,0.25)' }} />
        <div className="absolute bottom-10 right-[-60px] w-80 h-80 rounded-full blur-3xl pointer-events-none" style={{ background: 'rgba(16,185,129,0.15)' }} />

        <div className="relative z-10 space-y-8">
          <Logo size={40} onDark />

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            +1 200 commerçants actifs en Afrique de l'Ouest
          </div>

          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight text-white">
            La meilleure façon de <span className="text-emerald-400">gérer ta caisse</span> et tes profits.
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md">
            Chaque soir, sache exactement ce que tu as gagné, ce qu'il te reste en rayon, et qui te doit.
          </p>

          <div className="space-y-3.5 pt-2">
            {[
              { icon: Wallet, text: 'Vente enregistrée en 10 secondes chrono' },
              { icon: Wifi, text: 'Continue de vendre même sans connexion Internet' },
              { icon: ShieldCheck, text: 'Mode Protection Patron : marges masquées aux employés' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-slate-200">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0 border border-indigo-500/30">
                  <Icon className="w-4 h-4" />
                </div>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 pt-10 space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400 font-bold">Disponible dans 6 pays UEMOA</p>
            <div className="flex flex-wrap gap-2 text-xs">
              {COUNTRIES.map((c) => (
                <span key={c.code} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/80 text-slate-300 font-medium">
                  <span>{c.flag}</span> {c.label}
                </span>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800/80">
            <div className="flex items-center gap-1 text-amber-400 mb-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
              ))}
            </div>
            <p className="text-xs text-slate-300 italic leading-relaxed mb-2">
              « Un client me devait 60 000 F depuis des mois et j'avais oublié dans mon carnet. En 2 jours sur MoroCash, tout était clair et recouvré. »
            </p>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px] flex items-center justify-center border border-emerald-500/30">AT</div>
              <span className="text-xs font-semibold text-white">Awa Touré</span>
              <span className="text-[11px] text-slate-400">— Cosmétiques &amp; Wax, Yopougon</span>
            </div>
          </div>
        </div>
      </div>

      {/* PANNEAU DROIT : formulaire */}
      <div className="w-full md:w-1/2 flex flex-col justify-center items-center p-6 sm:p-10 lg:p-14 bg-[#F4F4F8] md:bg-white min-h-screen">
        <div className="w-full max-w-[420px] space-y-5 my-auto">
          <div className="text-center space-y-2 md:hidden">
            <LogoMark size={44} className="mx-auto" />
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">MoroCash</h2>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 overflow-hidden">
            <div className="grid grid-cols-2 p-1.5 m-4 mb-0 bg-slate-100 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => switchMode('REGISTER')}
                className={`py-2.5 rounded-lg transition-all cursor-pointer ${
                  mode === 'REGISTER' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Créer ma boutique
              </button>
              <button
                type="button"
                onClick={() => switchMode('LOGIN')}
                className={`py-2.5 rounded-lg transition-all cursor-pointer ${
                  mode === 'LOGIN' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Se connecter
              </button>
            </div>

            <div className="p-6 space-y-4">
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {errorMessage}
                </div>
              )}

              {businessChoices ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={resetBusinessChoices}
                    className="flex items-center gap-1 text-xs font-bold text-slate-500 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Retour
                  </button>
                  <p className="text-xs text-slate-500">
                    Ce numéro est utilisé dans plusieurs boutiques. Laquelle veux-tu ouvrir ?
                  </p>
                  {businessChoices.map((b) => (
                    <button
                      key={b.businessId}
                      type="button"
                      disabled={isSubmitting}
                      onClick={(e) => handleLogin(e, b.businessId)}
                      className="w-full p-3.5 rounded-xl border border-slate-200 text-left text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-indigo-500" /> {b.businessNom}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                    </button>
                  ))}
                </div>
              ) : mode === 'REGISTER' ? (
                <>
                  {/* Progression 2 étapes */}
                  <div className="flex items-center gap-2 pb-1">
                    {[1, 2].map((step) => (
                      <div
                        key={step}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          registerStep >= step ? 'bg-[#4338CA]' : 'bg-slate-150 bg-slate-100'
                        }`}
                      />
                    ))}
                  </div>

                  {registerStep === 1 ? (
                    <form onSubmit={handleContinueStep1} className="space-y-3">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Étape 1 · Ta boutique</p>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Nom de la boutique</label>
                        <div className="relative">
                          <Store className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={businessNom}
                            onChange={(e) => setBusinessNom(e.target.value)}
                            placeholder="Ex: Boutique Étoile d'Afrique"
                            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-[#4338CA] focus:border-[#4338CA] outline-none"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        <div className="col-span-2">
                          <label className="text-xs font-bold text-slate-700 block mb-1">Pays</label>
                          <select
                            value={country.code}
                            onChange={(e) => setCountry(COUNTRIES.find((c) => c.code === e.target.value) ?? DEFAULT_COUNTRY)}
                            className="w-full px-2.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900 bg-white cursor-pointer focus:ring-2 focus:ring-[#4338CA] outline-none"
                          >
                            {COUNTRIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.code}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-3">
                          <label className="text-xs font-bold text-slate-700 block mb-1">Ville (optionnel)</label>
                          <div className="relative">
                            <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={ville}
                              onChange={(e) => setVille(e.target.value)}
                              placeholder="Ex: Abidjan"
                              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-[#4338CA] focus:border-[#4338CA] outline-none"
                            />
                          </div>
                        </div>
                      </div>
                      {/* Secteur : une seule touche, sur l'étape qui existe déjà.
                          Il ne sert qu'à proposer des catégories de départ qui
                          parlent du métier du commerçant — il n'ajoute donc ni
                          écran, ni décision qu'on ne puisse défaire ensuite. */}
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1.5">
                          Tu vends quoi ?
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {BUSINESS_SECTORS.map((s) => (
                            <button
                              key={s.code}
                              type="button"
                              onClick={() => setSecteur(s.code)}
                              className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                                secteur === s.code
                                  ? 'bg-[#4338CA] border-[#4338CA] text-white shadow-sm'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          Ça nous sert juste à te proposer des catégories toutes prêtes. Tu pourras
                          les changer.
                        </p>
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all hover:opacity-90"
                        style={{ backgroundColor: BRAND_INDIGO, boxShadow: '0 10px 25px -5px rgba(67,56,202,0.35)' }}
                      >
                        <span>Continuer</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setRegisterStep(1)}
                        className="flex items-center gap-1 text-xs font-bold text-slate-500 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" /> Retour
                      </button>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Étape 2 · Contact &amp; sécurité</p>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">Numéro WhatsApp</label>
                        <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4338CA] focus-within:border-[#4338CA] transition-all">
                          <span className="bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 border-r border-slate-200 flex items-center gap-1 shrink-0">
                            {country.flag} {country.dialCode}
                          </span>
                          <input
                            type="tel"
                            value={telephone}
                            onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
                            placeholder="0708091011"
                            className="w-full px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">E-mail (optionnel)</label>
                        <div className="relative">
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="boutique@exemple.com"
                            className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-[#4338CA] focus:border-[#4338CA] outline-none"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Pour recevoir tes bilans de caisse en plus de WhatsApp.</p>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1.5">Choisis ton code PIN (6 chiffres)</label>
                        <PinInput value={pin} onChange={setPin} />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1.5">Confirme ton code PIN</label>
                        <PinInput value={pinConfirm} onChange={setPinConfirm} />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 cursor-pointer transition-all hover:opacity-90"
                        style={{ backgroundColor: BRAND_INDIGO, boxShadow: '0 10px 25px -5px rgba(67,56,202,0.35)' }}
                      >
                        <span>{isSubmitting ? 'Création en cours...' : 'Créer ma boutique'}</span>
                        {!isSubmitting && <ArrowRight className="w-4 h-4" />}
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <form onSubmit={(e) => handleLogin(e)} className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Numéro WhatsApp</label>
                    <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4338CA] focus-within:border-[#4338CA] transition-all">
                      <span className="bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 border-r border-slate-200 flex items-center gap-1 shrink-0">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                      </span>
                      <input
                        type="tel"
                        value={telephone}
                        onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
                        placeholder="0708091011"
                        className="w-full px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">Code PIN</label>
                    <PinInput value={pin} onChange={setPin} />
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 rounded-2xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-60 cursor-pointer transition-all hover:opacity-90"
                    style={{ backgroundColor: BRAND_INDIGO, boxShadow: '0 10px 25px -5px rgba(67,56,202,0.35)' }}
                  >
                    <Lock className="w-4 h-4" />
                    <span>{isSubmitting ? 'Connexion en cours...' : 'Se connecter à ma boutique'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 leading-relaxed px-4">
            En continuant, tu acceptes nos conditions d'utilisation et notre politique de confidentialité.
          </p>
        </div>
      </div>
    </div>
  );
};
