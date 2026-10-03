import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { enablePush, isPushSupported, needsIosInstall } from '../../api/push';

/**
 * Invitation à activer les notifications, réaffichée tous les 3 jours tant
 * qu'elles ne le sont pas sur ce téléphone. On passe par cet encart plutôt
 * que d'ouvrir directement la fenêtre du navigateur : Chrome bloque pour de
 * bon un site dont on a fermé cette fenêtre trois fois, alors que « Plus
 * tard » ici ne coûte rien. Jamais affichée pendant une vente.
 */

const REMINDER_KEY = 'morocash_push_reminder_at';
const REMINDER_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
// Laisse l'accueil s'afficher avant de demander quoi que ce soit.
const SHOW_DELAY_MS = 8000;

type Reason = 'ask' | 'denied' | 'ios-install';

function reminderReason(): Reason | null {
  if (needsIosInstall()) return 'ios-install';
  if (!isPushSupported()) return null;
  if (Notification.permission === 'default') return 'ask';
  if (Notification.permission === 'denied') return 'denied';
  return null;
}

function isReminderDue(): boolean {
  try {
    const last = Number(localStorage.getItem(REMINDER_KEY) || 0);
    return Date.now() - last >= REMINDER_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markReminderShown(): void {
  try {
    localStorage.setItem(REMINDER_KEY, String(Date.now()));
  } catch {
    // Stockage indisponible : l'encart reviendra à la prochaine ouverture.
  }
}

const MESSAGES: Record<Reason, { titre: string; texte: string }> = {
  ask: {
    titre: 'Active les notifications',
    texte: "Reçois les nouveautés et les messages importants de l'équipe MoroCash, même app fermée.",
  },
  denied: {
    titre: 'Notifications bloquées',
    texte:
      'Pour recevoir les messages de MoroCash, autorise-les pour MoroCash dans les réglages de ton téléphone ou de ton navigateur.',
  },
  'ios-install': {
    titre: 'Reçois les notifications',
    texte: "Sur iPhone : appuie sur Partager, puis « Sur l'écran d'accueil », et ouvre MoroCash depuis l'icône.",
  },
};

export const PushReminder: React.FC = () => {
  const { authStatus, cart, isNewSaleOpen, selectedSaleForReceipt, saleSuccessReceipt } = useApp();
  const [reason, setReason] = useState<Reason | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const isSelling = cart.length > 0 || isNewSaleOpen || !!selectedSaleForReceipt || !!saleSuccessReceipt;

  useEffect(() => {
    if (authStatus !== 'authenticated' || reason || isSelling) return;
    const timeout = setTimeout(() => {
      const next = reminderReason();
      if (!next || !isReminderDue()) return;
      markReminderShown();
      setReason(next);
    }, SHOW_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [authStatus, reason, isSelling]);

  if (!reason || isSelling) return null;

  const handleEnable = async () => {
    setIsBusy(true);
    try {
      const permission = await enablePush();
      // Refus dans la fenêtre du navigateur : on le reverra dans 3 jours, avec
      // les explications pour débloquer.
      if (permission !== 'default') setReason(null);
    } catch {
      setReason(null);
    } finally {
      setIsBusy(false);
    }
  };

  const { titre, texte } = MESSAGES[reason];

  return (
    <div className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92vw] max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="relative flex gap-3 p-4 rounded-2xl bg-white shadow-xl border border-slate-200">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-5">
          <p className="text-sm font-black text-slate-900">{titre}</p>
          <p className="text-xs text-slate-600 mt-0.5">{texte}</p>
          <div className="flex gap-2 mt-3">
            {reason === 'ask' && (
              <button
                type="button"
                onClick={handleEnable}
                disabled={isBusy}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isBusy ? '…' : 'Activer'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setReason(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold cursor-pointer hover:border-slate-300"
            >
              {reason === 'ask' ? 'Plus tard' : 'Compris'}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReason(null)}
          aria-label="Fermer"
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
