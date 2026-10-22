import React from 'react';
import { AlertTriangle, ArrowRight, CalendarClock, Sparkles } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/** 05/11/2026 */
const dateCourte = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : null);

const pluriel = (n: number) => `${n} jour${n > 1 ? 's' : ''}`;

/**
 * Bandeau « où en est mon abonnement », en haut du menu : formule, jours
 * restants et date de fin, essai compris. Le bouton mène au renouvellement
 * (propriétaire) ou à la page Abonnement (les autres la consultent seulement).
 *
 * Les jours viennent du serveur (session /auth/me), comme partout ailleurs.
 */
export const SubscriptionBanner: React.FC<{ onOpen: () => void; onRenew: () => void }> = ({ onOpen, onRenew }) => {
  const { settings, currentBusiness } = useApp();
  const estProprietaire = settings.role === 'OWNER';
  const statut = settings.planStatus;

  let titre: string;
  let detail: string | null;
  let bouton: string;
  let ton: 'normal' | 'alerte' | 'expire';

  if (statut === 'EXPIRED') {
    titre = 'Abonnement expiré';
    const fin = dateCourte(currentBusiness?.subscriptionEndsAt ?? currentBusiness?.trialEndsAt);
    detail = `${fin ? `Terminé le ${fin} · ` : ''}ton compte est en lecture seule`;
    bouton = 'Réactiver';
    ton = 'expire';
  } else if (statut === 'TRIAL') {
    const jours = settings.trialDaysLeft;
    titre = `Essai gratuit · ${pluriel(jours)} restant${jours > 1 ? 's' : ''}`;
    const fin = dateCourte(currentBusiness?.trialEndsAt);
    detail = fin ? `Jusqu’au ${fin}` : null;
    bouton = 'Choisir une formule';
    ton = jours <= 7 ? 'alerte' : 'normal';
  } else {
    const jours = settings.subscriptionDaysLeft ?? null;
    const formule = statut === 'BUSINESS' ? 'Business' : 'Solo';
    titre = jours !== null ? `Formule ${formule} · ${pluriel(jours)} restant${jours > 1 ? 's' : ''}` : `Formule ${formule} active`;
    const fin = dateCourte(currentBusiness?.subscriptionEndsAt);
    detail = fin ? `Active jusqu’au ${fin}` : null;
    bouton = 'Renouveler';
    ton = jours !== null && jours <= 7 ? 'alerte' : 'normal';
  }

  const styles = {
    normal: { boite: 'bg-mc-primary-tint border-[#DAD6FC]', icone: 'bg-[#5B4BF0]', bouton: 'bg-mc-primary text-white' },
    alerte: { boite: 'bg-amber-50 border-amber-200', icone: 'bg-amber-600', bouton: 'bg-amber-600 text-white' },
    expire: { boite: 'bg-rose-50 border-rose-200', icone: 'bg-rose-600', bouton: 'bg-rose-600 text-white' },
  }[ton];
  const Icone = ton === 'expire' ? AlertTriangle : statut === 'TRIAL' ? Sparkles : CalendarClock;

  // Renouveler / réactiver directement : seul le propriétaire peut payer.
  const agir = estProprietaire && statut !== 'TRIAL' ? onRenew : onOpen;

  return (
    <div className={`rounded-mc border p-3.5 flex items-center gap-3 ${styles.boite}`}>
      <button type="button" onClick={onOpen} className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer">
        <span className={`w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0 ${styles.icone}`}>
          <Icone className="w-5 h-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-extrabold text-mc-ink leading-snug">{titre}</span>
          {detail && <span className="block text-[12px] text-slate-600 truncate">{detail}</span>}
        </span>
      </button>
      {estProprietaire && (
        <button
          type="button"
          onClick={agir}
          className={`shrink-0 h-9 px-3.5 rounded-full text-[12px] font-bold flex items-center gap-1 cursor-pointer active:scale-[0.97] ${styles.bouton}`}
        >
          <span>{bouton}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
