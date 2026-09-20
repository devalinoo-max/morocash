import React, { useState } from 'react';
import { ArrowLeft, MessageCircle, Store, ShieldCheck } from 'lucide-react';
import { PinInput } from '../common/PinInput';
import {
  requestPinReset,
  verifyPinReset,
  confirmPinReset,
  type ResetBusinessChoice,
} from '../../api/auth';

interface ForgotPinFlowProps {
  /** Numéro déjà saisi sur l'écran de connexion, repris tel quel. */
  initialPhone: string;
  onCancel: () => void;
  /** Nouveau PIN enregistré : on revient à la connexion, numéro pré-rempli. */
  onDone: (telephone: string) => void;
}

type Step = 'PHONE' | 'CODE' | 'SHOP' | 'NEW_PIN';

const ONBOARDING_INDIGO = '#4F46E5';

/**
 * « PIN oublié ? » en trois temps : on demande le numéro, un code à 6 chiffres
 * part par WhatsApp, puis on choisit un nouveau PIN.
 *
 * Le code est vérifié avant l'écran du nouveau PIN (POST reset-code/verify) :
 * un code faux se dit tout de suite, pas après avoir fait taper deux fois un
 * nouveau code pour rien. Un écran de plus s'intercale quand le numéro ouvre
 * plusieurs boutiques — il faut alors désigner laquelle.
 */
export const ForgotPinFlow: React.FC<ForgotPinFlowProps> = ({ initialPhone, onCancel, onDone }) => {
  const [step, setStep] = useState<Step>('PHONE');
  const [telephone, setTelephone] = useState(initialPhone);
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [businesses, setBusinesses] = useState<ResetBusinessChoice[]>([]);
  const [businessId, setBusinessId] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fail = (error: unknown, fallback: string) =>
    setErrorMessage(error instanceof Error ? error.message : fallback);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!/^\d{8,15}$/.test(telephone.trim())) {
      setErrorMessage('Numéro de téléphone invalide (8 à 15 chiffres).');
      return;
    }
    setIsSubmitting(true);
    try {
      await requestPinReset(telephone.trim());
      setCode('');
      setStep('CODE');
    } catch (error) {
      fail(error, "Impossible d'envoyer le code.");
    } finally {
      setIsSubmitting(false);
    }
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
      const found = await verifyPinReset(telephone.trim(), code);
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
      setErrorMessage('Le nouveau code doit comporter exactement 6 chiffres.');
      return;
    }
    if (newPin !== newPinConfirm) {
      setErrorMessage('Les deux codes ne sont pas identiques.');
      return;
    }
    setIsSubmitting(true);
    try {
      await confirmPinReset({ telephone: telephone.trim(), code, newPin, businessId });
      onDone(telephone.trim());
    } catch (error) {
      fail(error, 'Impossible de changer le code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const back = () => {
    setErrorMessage(null);
    if (step === 'PHONE') return onCancel();
    if (step === 'CODE') return setStep('PHONE');
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

      {step === 'PHONE' && (
        <form onSubmit={handleRequest} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Code PIN oublié</h2>
            <p className="text-xs text-slate-500">
              On envoie un code à 6 chiffres sur le WhatsApp de ta boutique.
            </p>
          </div>

          <div>
            <label htmlFor="forgot-phone" className="text-xs font-bold text-slate-700 block mb-1">
              Numéro WhatsApp
            </label>
            <div className="flex rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-[#4F46E5] focus-within:border-[#4F46E5] transition-all">
              <span className="bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-600 border-r border-slate-200 flex items-center shrink-0">
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              </span>
              <input
                id="forgot-phone"
                type="tel"
                inputMode="numeric"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value.replace(/\D/g, ''))}
                placeholder="0708091011"
                className="w-full px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none font-mono"
              />
            </div>
          </div>

          <SubmitButton disabled={isSubmitting}>
            {isSubmitting ? 'Envoi du code…' : 'Recevoir mon code'}
          </SubmitButton>
        </form>
      )}

      {step === 'CODE' && (
        <form onSubmit={handleVerify} className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Saisis le code reçu</h2>
            <p className="text-xs text-slate-500">
              Un code à 6 chiffres vient d’être envoyé par WhatsApp au {telephone}. Il est valable
              10 minutes.
            </p>
          </div>

          <PinInput value={code} onChange={setCode} autoFocus />

          <SubmitButton disabled={isSubmitting || code.length !== 6}>
            {isSubmitting ? 'Vérification…' : 'Valider le code'}
          </SubmitButton>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={(e) => void handleRequest(e)}
            className="w-full text-center text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer disabled:opacity-50"
          >
            Je n’ai rien reçu — renvoyer un code
          </button>
        </form>
      )}

      {step === 'SHOP' && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            Ce numéro est utilisé dans plusieurs boutiques. Pour laquelle veux-tu changer le code ?
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
            <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">Choisis ton nouveau code</h2>
            <p className="text-xs text-slate-500 flex items-start gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-px" />
              <span>6 chiffres, à retenir : il ouvre ta caisse à chaque connexion.</span>
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Nouveau code PIN</label>
            <PinInput value={newPin} onChange={setNewPin} autoFocus />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Confirmation</label>
            <PinInput value={newPinConfirm} onChange={setNewPinConfirm} />
            {newPinConfirm.length === 6 && newPin !== newPinConfirm && (
              <p className="text-[11px] font-semibold text-rose-600 mt-1.5">
                Les deux codes ne sont pas identiques.
              </p>
            )}
          </div>

          <SubmitButton disabled={isSubmitting || newPin.length !== 6 || newPin !== newPinConfirm}>
            {isSubmitting ? 'Enregistrement…' : 'Enregistrer mon nouveau code'}
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
