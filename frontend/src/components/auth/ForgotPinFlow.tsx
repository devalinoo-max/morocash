import React, { useEffect, useState } from 'react';
import { ArrowLeft, Mail, MessageCircle, Store, ShieldCheck } from 'lucide-react';
import { PinInput } from '../common/PinInput';
import { COUNTRIES, DEFAULT_COUNTRY, type CountryOption } from '../../data/countries';
import {
  requestPinReset,
  verifyPinReset,
  confirmPinReset,
  type ResetBusinessChoice,
  type ResetTarget,
} from '../../api/auth';

interface ForgotPinFlowProps {
  /** Numéro déjà saisi sur l'écran de connexion, repris tel quel. */
  initialPhone: string;
  onCancel: () => void;
  /** Nouveau PIN enregistré : on revient à la connexion, numéro pré-rempli quand il est connu. */
  onDone: (telephone: string) => void;
}

type Step = 'CHANNEL' | 'CODE' | 'SHOP' | 'NEW_PIN';
type Canal = ResetTarget['canal'];

const ONBOARDING_INDIGO = '#4F46E5';
const RESEND_DELAY_S = 60;

/** Numéro WhatsApp du support (avec indicatif, chiffres seuls). Vide : le lien n'est pas affiché. */
const SUPPORT_WHATSAPP = String(import.meta.env.VITE_SUPPORT_WHATSAPP ?? '').replace(/\D/g, '');

/** « 0708091098 » → « 07 ** ** ** 98 ». */
export function maskPhone(telephone: string): string {
  if (telephone.length < 5) return telephone;
  const middlePairs = Math.ceil((telephone.length - 4) / 2);
  return [telephone.slice(0, 2), ...Array(middlePairs).fill('**'), telephone.slice(-2)].join(' ');
}

/** « boutique@exemple.com » → « b*******@exemple.com ». */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return `${local[0]}${'*'.repeat(Math.max(local.length - 1, 1))}@${domain}`;
}

/**
 * « Mot de passe oublié ? » en trois temps : choix du canal (WhatsApp ou
 * e-mail de la boutique), saisie du code reçu, puis nouveau PIN.
 *
 * Le code est vérifié avant l'écran du nouveau PIN (POST reset-code/verify) :
 * un code faux se dit tout de suite, pas après avoir fait taper deux fois un
 * nouveau code pour rien. Un écran de plus s'intercale quand le numéro ouvre
 * plusieurs boutiques — il faut alors désigner laquelle.
 */
export const ForgotPinFlow: React.FC<ForgotPinFlowProps> = ({ initialPhone, onCancel, onDone }) => {
  const [step, setStep] = useState<Step>('CHANNEL');
  const [canal, setCanal] = useState<Canal>('WHATSAPP');
  const [country, setCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [telephone, setTelephone] = useState(initialPhone);
  const [email, setEmail] = useState('');
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [businesses, setBusinesses] = useState<ResetBusinessChoice[]>([]);
  const [businessId, setBusinessId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const target: ResetTarget =
    canal === 'EMAIL'
      ? { canal: 'EMAIL', email: email.trim().toLowerCase() }
      : { canal: 'WHATSAPP', telephone: telephone.trim() };

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const fail = (error: unknown, fallback: string) =>
    setErrorMessage(error instanceof Error ? error.message : fallback);

  const sendCode = async () => {
    setErrorMessage(null);
    if (canal === 'WHATSAPP' && !/^\d{8,15}$/.test(telephone.trim())) {
      setErrorMessage('Numéro de téléphone invalide (8 à 15 chiffres).');
      return;
    }
    if (canal === 'EMAIL' && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setErrorMessage('Adresse e-mail invalide.');
      return;
    }
    setIsSubmitting(true);
    try {
      setSentMessage(await requestPinReset(target));
      setCode('');
      setResendIn(RESEND_DELAY_S);
      setStep('CODE');
    } catch (error) {
      fail(error, "Impossible d'envoyer le code.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequest = (e: React.FormEvent) => {
    e.preventDefault();
    void sendCode();
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('Le code doit comporter exactement 6 chiffres.');
      return;
    }
    setIsSubmitting(true);
    try {
      const found = await verifyPinReset(target, code);
      setBusinesses(found);
      // Une seule boutique : rien à demander, on passe au nouveau code.
      if (found.length <= 1) {
        setBusinessId(found[0]?.businessId);
        setStep('NEW_PIN');
      } else {
        setStep('SHOP');
      }
    } catch (error) {
      fail(error, 'Code invalide ou expiré.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!/^\d{6}$/.test(newPin)) {
      setErrorMessage('Le nouveau mot de passe doit comporter exactement 6 chiffres.');
      return;
    }
    if (newPin !== newPinConfirm) {
      setErrorMessage('Les deux mots de passe ne sont pas identiques.');
      return;
    }
    setIsSubmitting(true);
    try {
      await confirmPinReset(target, { code, newPin, businessId });
      onDone(canal === 'WHATSAPP' ? telephone.trim() : initialPhone);
    } catch (error) {
      fail(error, 'Impossible de changer le mot de passe.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const back = () => {
    setErrorMessage(null);
    if (step === 'CHANNEL') return onCancel();
    if (step === 'CODE') return setStep('CHANNEL');
    if (step === 'SHOP') return setStep('CODE');
    setStep(businesses.length > 1 ? 'SHOP' : 'CODE');
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={back}
        className="flex items-center gap-1 text-xs font-bold text-slate-500 cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Retour
      </button>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
          {errorMessage}
        </div>
      )}

      {step === 'CHANNEL' && (
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Mot de passe oublié ?</h2>
            <p className="text-xs text-slate-500">On t'envoie un code pour en choisir un nouveau.</p>
          </div>

          <div role="radiogroup" aria-label="Recevoir le code" className="grid grid-cols-2 p-1.5 bg-slate-100 rounded-xl text-xs font-bold">
            {(
              [
                { value: 'WHATSAPP', label: 'Par WhatsApp', icon: MessageCircle },
                { value: 'EMAIL', label: 'Par e-mail', icon: Mail },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={canal === value}
                onClick={() => {
                  setCanal(value);
                  setErrorMessage(null);
                }}
                className={`py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  canal === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {canal === 'WHATSAPP' ? (
            <div>
              <label htmlFor="forgot-phone" className="text-xs font-bold text-slate-700 block mb-1">
                Numéro WhatsApp
              </label>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4F46E5] focus-within:border-[#4F46E5] transition-all">
                {/* Indicatif affiché comme à la connexion : le numéro est enregistré sans indicatif. */}
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
                  id="forgot-phone"
                  type="tel"
                  inputMode="numeric"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
                  placeholder="0708091011"
                  className="w-full min-w-0 px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none font-mono"
                />
              </div>
            </div>
          ) : (
            <div>
              <label htmlFor="forgot-email" className="text-xs font-bold text-slate-700 block mb-1">
                Adresse e-mail
              </label>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="boutique@exemple.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-[#4F46E5] focus:border-[#4F46E5] outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">Celle indiquée à la création de ta boutique.</p>
            </div>
          )}

          <SubmitButton disabled={isSubmitting}>{isSubmitting ? 'Envoi du code…' : 'Recevoir le code'}</SubmitButton>

          {SUPPORT_WHATSAPP && (
            <p className="text-center text-[11px] text-slate-500">
              Plus accès à ces deux moyens ?{' '}
              <a
                href={`https://wa.me/${SUPPORT_WHATSAPP}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-[#4F46E5] hover:underline"
              >
                Contacter le support sur WhatsApp
              </a>
            </p>
          )}
        </form>
      )}

      {step === 'CODE' && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Saisis le code reçu</h2>
            {sentMessage && <p className="text-xs font-semibold text-slate-700">{sentMessage}</p>}
            <p className="text-xs text-slate-500">
              {canal === 'WHATSAPP'
                ? `Code envoyé par WhatsApp au ${maskPhone(telephone.trim())}`
                : `Code envoyé par e-mail à ${maskEmail(email.trim().toLowerCase())}`}
              . Il est valable 10 minutes.
            </p>
          </div>

          <PinInput value={code} onChange={setCode} autoFocus />

          <SubmitButton disabled={isSubmitting || code.length !== 6}>
            {isSubmitting ? 'Vérification…' : 'Valider le code'}
          </SubmitButton>

          <button
            type="button"
            disabled={isSubmitting || resendIn > 0}
            onClick={() => void sendCode()}
            className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resendIn > 0 ? `Renvoyer le code (dans ${resendIn} s)` : 'Renvoyer le code'}
          </button>
        </form>
      )}

      {step === 'SHOP' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Ce numéro est utilisé dans plusieurs boutiques. Pour laquelle veux-tu changer le mot de passe ?
          </p>
          {businesses.map((b) => (
            <button
              key={b.businessId}
              type="button"
              onClick={() => {
                setBusinessId(b.businessId);
                setStep('NEW_PIN');
              }}
              className="w-full p-3.5 rounded-xl border border-slate-200 text-left text-sm font-bold text-slate-800 hover:bg-slate-50 cursor-pointer flex items-center gap-2"
            >
              <Store className="w-4 h-4 text-indigo-500" /> {b.businessNom}
            </button>
          ))}
        </div>
      )}

      {step === 'NEW_PIN' && (
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Choisis ton nouveau mot de passe</h2>
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" />
              <span>6 chiffres, à retenir : il ouvre ta caisse à chaque connexion.</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Nouveau mot de passe</label>
            <PinInput value={newPin} onChange={setNewPin} autoFocus />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Confirmation</label>
            <PinInput value={newPinConfirm} onChange={setNewPinConfirm} />
            {newPinConfirm.length === 6 && newPin !== newPinConfirm && (
              <p className="text-[11px] font-semibold text-rose-600 mt-1.5">
                Les deux mots de passe ne sont pas identiques.
              </p>
            )}
          </div>

          <SubmitButton disabled={isSubmitting || newPin.length !== 6 || newPin !== newPinConfirm}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer mon nouveau mot de passe'}
          </SubmitButton>
        </form>
      )}
    </div>
  );
};

const SubmitButton: React.FC<{ disabled: boolean; children: React.ReactNode }> = ({
  disabled,
  children,
}) => (
  <button
    type="submit"
    disabled={disabled}
    className="w-full py-3.5 rounded-xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer transition-all enabled:hover:opacity-90"
    style={{ backgroundColor: ONBOARDING_INDIGO, boxShadow: '0 10px 25px -5px rgba(79,70,229,0.35)' }}
  >
    {children}
  </button>
);
