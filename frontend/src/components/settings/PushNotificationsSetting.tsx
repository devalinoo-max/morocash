import React, { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  enablePush,
  getCurrentPushSubscription,
  isPushSupported,
  needsIosInstall,
} from '../../api/push';

type Status = 'loading' | 'unsupported' | 'ios-install' | 'denied' | 'off' | 'on';

/**
 * Réglages > Mon compte : état des notifications sur CET appareil. Elles sont
 * activées d'office (voir setupAutoPush) et ne se désactivent pas ici ; le
 * bouton ne sert que si l'autorisation n'a pas encore été donnée.
 */
export const PushNotificationsSetting: React.FC = () => {
  const [status, setStatus] = useState<Status>('loading');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (needsIosInstall()) {
      setStatus('ios-install');
      return;
    }
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    getCurrentPushSubscription()
      .then((sub) => setStatus(sub && Notification.permission === 'granted' ? 'on' : 'off'))
      .catch(() => setStatus('off'));
  }, []);

  const handleEnable = async () => {
    setIsBusy(true);
    setError(null);
    try {
      const permission = await enablePush();
      setStatus(permission === 'granted' ? 'on' : permission === 'denied' ? 'denied' : 'off');
    } catch {
      setError("Impossible d'activer les notifications. Vérifie ta connexion et réessaie.");
    } finally {
      setIsBusy(false);
    }
  };

  const description: Record<Status, string> = {
    loading: 'Vérification…',
    unsupported: 'Ce navigateur ne permet pas de recevoir des notifications.',
    'ios-install': "Sur iPhone, ajoute d'abord MoroCash à ton écran d'accueil, puis ouvre-le depuis l'icône.",
    denied: 'Notifications bloquées : autorise-les dans les réglages de ton navigateur pour ce site.',
    off: "Reçois les annonces de l'équipe MoroCash sur ce téléphone, même app fermée.",
    on: 'Activées sur ce téléphone.',
  };

  return (
    <div className="pt-4 border-t border-slate-100 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            {status === 'on' ? (
              <Bell className="w-4 h-4 text-indigo-600" />
            ) : (
              <BellOff className="w-4 h-4 text-slate-400" />
            )}
            <span>Notifications</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">{description[status]}</p>
        </div>
        {status === 'on' && (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold shrink-0">
            Activées
          </span>
        )}
        {status === 'off' && (
          <button
            type="button"
            onClick={handleEnable}
            disabled={isBusy}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isBusy ? '…' : 'Activer'}
          </button>
        )}
      </div>
      {error && <p className="text-[11px] font-bold text-rose-600">{error}</p>}
    </div>
  );
};
