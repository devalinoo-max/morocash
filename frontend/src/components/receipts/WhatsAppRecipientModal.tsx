import React, { useEffect, useState } from 'react';
import { X, Send, Plus, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Customer, Sale } from '../../types';
import { avatarColor, avatarInitials } from '../../utils/avatar';
import { formatPhoneDisplay, shareReceiptOnWhatsApp } from '../../utils/receiptHelpers';

export interface ReceiptRecipient {
  nom: string;
  telephone: string;
  /** Texte du bandeau de confirmation. */
  confirmation: string;
}

interface WhatsAppRecipientModalProps {
  sale: Sale;
  customer?: Customer;
  onClose: () => void;
  onSent: (recipient: ReceiptRecipient) => void;
}

const DEFAULT_DIAL = '+225';
const RECENT_KEY = 'morocash.recu.numerosRecents';
const MAX_RECENT = 3;

interface RecentNumber {
  dial: string;
  number: string;
}

// Numéros saisis à la main : gardés pour la session seulement (sessionStorage),
// jamais dans une fiche client sans que le commerçant l'ait demandé.
function readRecent(): RecentNumber[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as RecentNumber[]) : [];
    return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function rememberRecent(entry: RecentNumber) {
  try {
    const digits = (n: RecentNumber) => `${n.dial}${n.number}`.replace(/\D/g, '');
    const next = [entry, ...readRecent().filter((n) => digits(n) !== digits(entry))].slice(0, MAX_RECENT);
    sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible (navigation privée) : on se passe des pastilles.
  }
}

/** Numéro complet pour wa.me : indicatif + numéro local. */
function withDial(dial: string, number: string): string {
  const d = dial.replace(/[^\d+]/g, '');
  return `${d.startsWith('+') ? d : `+${d}`}${number.replace(/\D/g, '')}`;
}

/**
 * Ce qu'on écrit dans la fiche client : le numéro local tel qu'il est saisi
 * partout ailleurs dans l'app pour la Côte d'Ivoire, l'indicatif complet
 * pour un numéro étranger.
 */
function numberForCustomerFile(dial: string, number: string): string {
  const digits = number.replace(/\D/g, '');
  return dial.replace(/\D/g, '') === '225' ? digits : withDial(dial, number);
}

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span
    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
    style={{ backgroundColor: avatarColor(name) }}
  >
    {avatarInitials(name)}
  </span>
);

export const WhatsAppRecipientModal: React.FC<WhatsAppRecipientModalProps> = ({ sale, customer, onClose, onSent }) => {
  const { settings, updateCustomerPhone, showToast } = useApp();

  const clientName = customer?.name || sale.customerName?.trim() || 'Client de passage';
  const clientPhone = customer ? customer.phone : sale.customerPhone || '';
  const canEditCustomer = Boolean(customer);
  const ownPhone = settings.ownerPhone || settings.telephone || '';
  const ownName = settings.ownerName?.trim() || 'Moi-même';

  const [addingClientPhone, setAddingClientPhone] = useState(false);
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
  const [savingClientPhone, setSavingClientPhone] = useState(false);

  const [dial, setDial] = useState(DEFAULT_DIAL);
  const [number, setNumber] = useState('');
  const [saveForClient, setSaveForClient] = useState(false);
  const [recent, setRecent] = useState<RecentNumber[]>(() => readRecent());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = (telephone: string, recipient: Omit<ReceiptRecipient, 'telephone'>) => {
    shareReceiptOnWhatsApp(sale, settings, undefined, telephone);
    onSent({ ...recipient, telephone });
  };

  const saveClientPhone = async () => {
    if (!customer) return;
    const digits = clientPhoneDraft.replace(/\D/g, '');
    if (digits.length < 8) {
      showToast('Numéro trop court.', 'warning');
      return;
    }
    setSavingClientPhone(true);
    const ok = await updateCustomerPhone(customer.id, digits);
    setSavingClientPhone(false);
    if (ok) {
      setAddingClientPhone(false);
      showToast(`Numéro enregistré pour ${customer.name}`, 'success');
    }
  };

  const manualDigits = number.replace(/\D/g, '');
  const manualValid = manualDigits.length >= 8 && dial.replace(/\D/g, '').length > 0;

  const sendManual = async () => {
    if (!manualValid) return;
    const full = withDial(dial, number);
    rememberRecent({ dial, number: manualDigits });
    setRecent(readRecent());
    if (saveForClient && customer) {
      // Enregistré seulement parce que la case est cochée.
      void updateCustomerPhone(customer.id, numberForCustomerFile(dial, number));
    }
    const shown = dial === DEFAULT_DIAL ? formatPhoneDisplay(manualDigits) : full;
    send(full, {
      nom: saveForClient && customer ? customer.name : shown,
      confirmation: saveForClient && customer ? `Reçu envoyé à ${customer.name}` : `Reçu envoyé au ${shown}`,
    });
  };

  const rowClass = 'px-4 py-3 flex items-center gap-3';
  const sendBtn =
    'h-9 px-3.5 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] text-white text-[12.5px] font-bold flex items-center gap-1.5 shrink-0 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-recipient-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 shrink-0 px-4 flex items-center justify-between border-b border-slate-100">
          <h3 id="wa-recipient-title" className="text-[15px] font-[750] text-slate-900">
            Envoyer le reçu à qui ?
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
          {/* 1. Le client de la commande, toujours en premier */}
          <div>
            <div className={rowClass}>
              <Avatar name={clientName} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-slate-900 truncate">{clientName}</div>
                <div className={`text-[12px] ${clientPhone ? 'text-slate-500 tabular-nums' : 'text-slate-400 italic'}`}>
                  {clientPhone ? formatPhoneDisplay(clientPhone) : 'Pas de numéro'}
                </div>
              </div>
              {clientPhone ? (
                <button
                  type="button"
                  className={sendBtn}
                  onClick={() => send(clientPhone, { nom: clientName, confirmation: `Reçu envoyé à ${clientName}` })}
                >
                  <Send className="w-3.5 h-3.5" />
                  Envoyer
                </button>
              ) : (
                canEditCustomer &&
                !addingClientPhone && (
                  <button
                    type="button"
                    onClick={() => setAddingClientPhone(true)}
                    className="h-9 px-3 rounded-lg border border-slate-200 text-slate-700 text-[12px] font-bold flex items-center gap-1 shrink-0 cursor-pointer hover:bg-slate-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter son numéro
                  </button>
                )
              )}
            </div>
            {addingClientPhone && (
              <div className="px-4 pb-3 flex gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  value={clientPhoneDraft}
                  onChange={(e) => setClientPhoneDraft(e.target.value)}
                  placeholder="07 00 00 00 00"
                  className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-slate-200 text-[15px] font-semibold tabular-nums focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
                <button
                  type="button"
                  onClick={saveClientPhone}
                  disabled={savingClientPhone}
                  className="h-11 px-3.5 rounded-xl bg-slate-900 text-white text-[12.5px] font-bold shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {savingClientPhone && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Enregistrer
                </button>
              </div>
            )}
          </div>

          {/* 2. Moi-même, pour garder une trace */}
          <div className={rowClass}>
            <Avatar name={ownName} />
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-bold text-slate-900">Moi-même</div>
              <div className={`text-[12px] ${ownPhone ? 'text-slate-500 tabular-nums' : 'text-slate-400 italic'}`}>
                {ownPhone ? formatPhoneDisplay(ownPhone) : 'Pas de numéro sur ton compte'}
              </div>
            </div>
            <button
              type="button"
              className={sendBtn}
              disabled={!ownPhone}
              onClick={() => send(ownPhone, { nom: 'Moi-même', confirmation: 'Reçu envoyé sur ton numéro' })}
            >
              <Send className="w-3.5 h-3.5" />
              Envoyer
            </button>
          </div>

          {/* 3. Un autre numéro */}
          <div className="px-4 py-3 space-y-2.5">
            <div className="text-[14px] font-bold text-slate-900">Un autre numéro</div>
            <div className="flex gap-2">
              <input
                type="tel"
                inputMode="tel"
                value={dial}
                onChange={(e) => setDial(e.target.value)}
                aria-label="Indicatif"
                className="w-[76px] h-11 px-2 rounded-xl border border-slate-200 text-center text-[15px] font-semibold tabular-nums focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
              <input
                type="tel"
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="07 00 00 00 00"
                aria-label="Numéro"
                className="flex-1 min-w-0 h-11 px-3 rounded-xl border border-slate-200 text-[15px] font-semibold tabular-nums focus:ring-2 focus:ring-indigo-500 outline-hidden"
              />
            </div>

            {recent.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {recent.map((r) => (
                  <button
                    key={`${r.dial}${r.number}`}
                    type="button"
                    onClick={() => {
                      setDial(r.dial);
                      setNumber(formatPhoneDisplay(r.number));
                    }}
                    className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-[11.5px] font-semibold text-slate-700 tabular-nums cursor-pointer"
                  >
                    {r.dial === DEFAULT_DIAL ? formatPhoneDisplay(r.number) : `${r.dial} ${r.number}`}
                  </button>
                ))}
              </div>
            )}

            {canEditCustomer && (
              <label className="flex items-center gap-2 text-[11.5px] text-slate-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveForClient}
                  onChange={(e) => setSaveForClient(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Enregistrer ce numéro pour {clientName}</span>
              </label>
            )}

            <button
              type="button"
              onClick={sendManual}
              disabled={!manualValid}
              className="w-full h-11 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-[13.5px] font-bold flex items-center justify-center gap-2 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              Envoyer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
