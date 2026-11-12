import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, MessageCircle, Store } from 'lucide-react';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import { PinInput } from '../common/PinInput';
import { CountryPicker } from './CountryPicker';
import { ApiError } from '../../api/client';
import {
  requestWhatsappCode,
  resetPasswordWithToken,
  verifyWhatsappCode,
  type OtpPurpose,
  type ResetBusinessChoice,
} from '../../api/auth';

/**
 * Connexion par code WhatsApp (purpose LOGIN) et « Mot de passe oublié »
 * (purpose PASSWORD_RESET) : mêmes écrans A (numéro), B (code) et C (nouveau
 * mot de passe, reset seulement). Le serveur décide de tout — durée du code,
 * essais, délais, limites ; l'écran affiche ses messages tels quels.
 */

const INDIGO = '#4F46E5';
const RESEND_DELAY_S = 60;
const SEND_FAILED = "Impossible d'envoyer le code. Réessaie dans une minute.";
const INVALID_PHONE = "Ce numéro n'est pas valide. Exemple : 01 70 34 58 08";

/**
 * Numéro tapé + pays choisi -> E.164 avec « + » (validé par libphonenumber-js),
 * ou null. Un numéro tapé avec son indicatif (+33…, 00225…) prime sur le pays choisi.
 */
function toE164(raw: string, country: CountryCode): { e164: string; nationalNumber: string; dialCode: string } | null {
  const parsed = parsePhoneNumberFromString(raw.trim().replace(/^00(?=\d)/, '+'), country);
  return parsed?.isValid()
    ? { e164: parsed.number, nationalNumber: parsed.nationalNumber, dialCode: parsed.countryCallingCode }
    : null;
}

/** « +2250170345808 » -> « +225 01 70 XX XX 08 » : seuls le début et les 2 derniers chiffres restent visibles. */
function maskPhone(p: { nationalNumber: string; dialCode: string }): string {
  const n = p.nationalNumber;
  const hidden = n.slice(2, -2).replace(/\d/g, 'X').replace(/(X{2})(?=X)/g, '$1 ');
  return `+${p.dialCode} ${n.slice(0, 2)}${hidden ? ' ' + hidden : ''} ${n.slice(-2)}`;
}

type Step = 'PHONE' | 'CODE' | 'SHOP' | 'NEW_PIN' | 'DONE';

interface WhatsappCodeFlowProps {
  purpose: OtpPurpose;
  /** Numéro déjà saisi ailleurs sur l'écran de connexion. */
  initialPhone?: string;
  /** Pays proposé d'abord (ISO) ; Côte d'Ivoire par défaut. */
  initialCountry?: CountryCode;
  /** LOGIN : la session est ouverte côté serveur, l'app doit la charger. */
  onLoggedIn?: () => Promise<{ success: boolean; message?: string }>;
  /** PASSWORD_RESET : mot de passe changé, retour à la connexion. */
  onDone?: () => void;
  /** Retour (PASSWORD_RESET) depuis le premier écran. */
  onCancel?: () => void;
  /** LOGIN : lien « Se connecter avec mon mot de passe ». */
  onUsePassword?: () => void;
  /** LOGIN : lien « Mot de passe oublié ? ». */
  onForgot?: () => void;
  /** PASSWORD_RESET : proposé après deux échecs d'envoi d'affilée. */
  onUseEmail?: () => void;
}

export const WhatsappCodeFlow: React.FC<WhatsappCodeFlowProps> = ({
  purpose,
  initialPhone = '',
  initialCountry = 'CI',
  onLoggedIn,
  onDone,
  onCancel,
  onUsePassword,
  onForgot,
  onUseEmail,
}) => {
  const isLogin = purpose === 'LOGIN';
  const [step, setStep] = useState<Step>('PHONE');
  const [phone, setPhone] = useState(initialPhone);
  const [country, setCountry] = useState<CountryCode>(initialCountry);
  const [code, setCode] = useState('');
  const [codeKey, setCodeKey] = useState(0); // remonte les cases après une erreur : focus sur la première
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendFailures, setSendFailures] = useState(0);
  const [businesses, setBusinesses] = useState<ResetBusinessChoice[]>([]);
  const [resetToken, setResetToken] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  // Verrou synchrone : trois appuis très rapides ne partent qu'une fois.
  const lock = useRef(false);
  // Boutique choisie (numéro présent dans plusieurs boutiques) : rejoue le même code.
  const chosenBusiness = useRef<string | undefined>(undefined);

  const parsedPhone = toE164(phone, country);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const run = async (task: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      if (!parsedPhone) {
        setError(INVALID_PHONE);
        return;
      }
      try {
        await requestWhatsappCode(parsedPhone.e164, purpose);
        setSendFailures(0);
        setCode('');
        setCodeKey((k) => k + 1);
        setResendIn(RESEND_DELAY_S);
        setStep('CODE');
      } catch (e) {
        const serverMessage = e instanceof ApiError && e.code !== 'NETWORK_ERROR' ? e.message : null;
        if (!serverMessage || (e instanceof ApiError && e.code === 'OTP_SEND_FAILED')) {
          setSendFailures((n) => n + 1);
        }
        setError(serverMessage ?? SEND_FAILED);
      }
    });

  const verifyCode = (value: string) =>
    run(async () => {
      if (!parsedPhone) return;
      try {
        const result = await verifyWhatsappCode({
          phone: parsedPhone.e164,
          purpose,
          code: value,
          businessId: chosenBusiness.current,
        });
        if (result.requiresBusinessSelection) {
          setBusinesses(result.businesses);
          setStep('SHOP');
          return;
        }
        if (isLogin) {
          const logged = await onLoggedIn?.();
          if (logged && !logged.success) setError(logged.message ?? 'Connexion impossible, réessaie.');
          return;
        }
        setResetToken('resetToken' in result ? (result.resetToken ?? '') : '');
        setStep('NEW_PIN');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Connexion impossible, réessaie.');
        // Les cases se vident et reprennent le focus : on peut retaper tout de suite.
        setCode('');
        setCodeKey((k) => k + 1);
      }
    });

  // La validation part toute seule au sixième chiffre.
  const handleCodeChange = (value: string) => {
    setCode(value);
    if (value.length === 6 && !lock.current) void verifyCode(value);
  };

  const chooseBusiness = (businessId: string) => {
    chosenBusiness.current = businessId;
    setStep('CODE');
    void verifyCode(code);
  };

  const savePassword = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!/^\d{6}$/.test(newPin)) {
        setError('Le mot de passe doit comporter exactement 6 chiffres.');
        return;
      }
      if (newPin !== confirmPin) {
        setError('Les deux mots de passe ne sont pas identiques.');
        return;
      }
      try {
        await resetPasswordWithToken(resetToken, newPin);
        setStep('DONE');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de changer le mot de passe.');
      }
    });
  };

  const changeNumber = () => {
    chosenBusiness.current = undefined;
    setError(null);
    setStep('PHONE');
  };

  const primaryButton = (label: string, disabled: boolean) => (
    <button
      type="submit"
      disabled={disabled}
      className="w-full min-h-12 py-3 rounded-xl text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer transition-all enabled:hover:opacity-90"
      style={{ backgroundColor: INDIGO, boxShadow: '0 10px 25px -5px rgba(79,70,229,0.35)' }}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {!isLogin && step !== 'DONE' && (
        <button
          type="button"
          onClick={() => (step === 'PHONE' ? onCancel?.() : step === 'CODE' ? changeNumber() : setStep('CODE'))}
          className="flex items-center gap-1 text-xs font-bold text-mc-soft cursor-pointer min-h-8"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Retour
        </button>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Écran A — numéro */}
      {step === 'PHONE' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
          className="space-y-4"
        >
          {!isLogin && (
            <div className="space-y-1">
              <h2 className="text-lg font-extrabold text-mc-ink tracking-tight">Mot de passe oublié ?</h2>
              <p className="text-xs text-mc-soft">On t'envoie un code sur WhatsApp pour en choisir un nouveau.</p>
            </div>
          )}
          <div>
            <label htmlFor="wa-phone" className="text-xs font-bold text-slate-700 block mb-1">
              Numéro WhatsApp
            </label>
            <div className="flex rounded-xl border border-mc-line overflow-hidden focus-within:ring-2 focus-within:ring-[#4F46E5] focus-within:border-[#4F46E5] transition-all">
              <CountryPicker value={country} onChange={setCountry} disabled={busy} />
              <input
                id="wa-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s.+()-]/g, ''))}
                placeholder="Numéro de téléphone"
                className="w-full min-w-0 px-3 h-12 text-sm font-semibold text-mc-ink outline-none font-mono"
              />
            </div>
          </div>

          {primaryButton(
            busy ? 'Envoi du code…' : isLogin ? 'Recevoir mon code sur WhatsApp' : 'Recevoir mon code',
            busy || phone.trim() === ''
          )}

          {/* Deux échecs d'envoi d'affilée : l'e-mail prend le relais (parcours existant). */}
          {!isLogin && sendFailures >= 2 && onUseEmail && (
            <button
              type="button"
              onClick={onUseEmail}
              className="w-full text-center text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer min-h-10"
            >
              Recevoir le code par e-mail
            </button>
          )}

          {isLogin && (
            <div className="space-y-1 pt-1">
              <button
                type="button"
                onClick={onUsePassword}
                className="w-full text-center text-xs font-bold text-mc-soft hover:text-mc-ink cursor-pointer min-h-10"
              >
                Se connecter avec mon mot de passe
              </button>
              <button
                type="button"
                onClick={onForgot}
                className="w-full text-center text-xs font-bold text-mc-soft hover:text-mc-ink cursor-pointer min-h-10"
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}
        </form>
      )}

      {/* Écran B — saisie du code */}
      {step === 'CODE' && parsedPhone && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-mc-ink tracking-tight flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-emerald-600" /> Saisis le code
            </h2>
            <p className="text-xs text-mc-soft">
              Un code à 6 chiffres vient d'être envoyé au {maskPhone(parsedPhone)} sur WhatsApp.
            </p>
          </div>

          <PinInput key={codeKey} value={code} onChange={handleCodeChange} masked={false} autoFocus disabled={busy} />
          {busy && <p className="text-center text-[11px] font-semibold text-mc-soft">Vérification…</p>}

          <button
            type="button"
            disabled={busy || resendIn > 0}
            onClick={() => void sendCode()}
            className="w-full text-center text-xs font-bold text-mc-soft hover:text-mc-ink cursor-pointer min-h-10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {resendIn > 0 ? `Renvoyer le code dans ${resendIn} s` : 'Renvoyer le code'}
          </button>
          <button
            type="button"
            onClick={changeNumber}
            className="w-full text-center text-xs font-bold text-[#4F46E5] hover:underline cursor-pointer min-h-10"
          >
            Changer de numéro
          </button>
        </div>
      )}

      {/* Numéro présent dans plusieurs boutiques */}
      {step === 'SHOP' && (
        <div className="space-y-3">
          <p className="text-xs text-mc-soft">
            Ce numéro est utilisé dans plusieurs boutiques.{' '}
            {isLogin ? 'Laquelle veux-tu ouvrir ?' : 'Pour laquelle veux-tu changer le mot de passe ?'}
          </p>
          {businesses.map((b) => (
            <button
              key={b.businessId}
              type="button"
              disabled={busy}
              onClick={() => chooseBusiness(b.businessId)}
              className="w-full min-h-12 p-3.5 rounded-xl border border-mc-line text-left text-sm font-bold text-mc-ink hover:bg-slate-50 cursor-pointer flex items-center gap-2"
            >
              <Store className="w-4 h-4 text-mc-primary" /> {b.businessNom}
            </button>
          ))}
        </div>
      )}

      {/* Écran C — nouveau mot de passe */}
      {step === 'NEW_PIN' && (
        <form onSubmit={savePassword} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-mc-ink tracking-tight">Choisis ton nouveau mot de passe</h2>
            <p className="text-xs text-mc-soft">6 chiffres, à retenir : il ouvre ta caisse à chaque connexion.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">Nouveau mot de passe</label>
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                aria-label={showPin ? 'Cacher le mot de passe' : 'Afficher le mot de passe'}
                className="p-2 -m-2 text-slate-500 hover:text-mc-ink cursor-pointer"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PinInput value={newPin} onChange={setNewPin} masked={!showPin} autoFocus />
            <p className={`text-[11px] font-semibold mt-1.5 ${newPin.length === 6 ? 'text-emerald-600' : 'text-slate-400'}`}>
              {newPin.length}/6 chiffres
            </p>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Confirmation</label>
            <PinInput value={confirmPin} onChange={setConfirmPin} masked={!showPin} />
            {confirmPin.length === 6 && newPin !== confirmPin && (
              <p className="text-[11px] font-semibold text-rose-600 mt-1.5">Les deux mots de passe ne sont pas identiques.</p>
            )}
          </div>

          {primaryButton(
            busy ? 'Enregistrement…' : 'Enregistrer mon mot de passe',
            busy || newPin.length !== 6 || newPin !== confirmPin
          )}
        </form>
      )}

      {step === 'DONE' && (
        <div className="space-y-4 text-center">
          <p role="status" className="text-sm font-bold text-mc-ink">
            Mot de passe changé. Connecte-toi avec ton nouveau mot de passe.
          </p>
          <button
            type="button"
            onClick={onDone}
            className="w-full min-h-12 py-3 rounded-xl text-white font-extrabold text-sm cursor-pointer hover:opacity-90"
            style={{ backgroundColor: INDIGO }}
          >
            Me connecter
          </button>
        </div>
      )}
    </div>
  );
};
