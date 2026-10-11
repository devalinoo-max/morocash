import React from 'react';
import { ArrowDown, ArrowUp, MoreHorizontal, Share, SquarePlus, X } from 'lucide-react';

interface IosInstallGuideProps {
  onClose: () => void;
}

/**
 * Guide visuel d'installation sur iOS : une bulle avec une flèche animée qui
 * pointe vers le bouton Partager de Safari (barre du bas sur iPhone, en haut
 * à droite sur iPad). Apple ne permet pas d'installer par code, on guide donc
 * l'utilisateur geste par geste.
 */
export const IosInstallGuide: React.FC<IosInstallGuideProps> = ({ onClose }) => {
  const isIpad = /ipad/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const steps = (
    <ol className="space-y-3 text-xs text-slate-700 font-medium">
      <li className="flex items-start gap-3">
        <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#4338CA] flex items-center justify-center font-black shrink-0">1</span>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 flex-wrap">
            Appuie sur
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-slate-100 border border-slate-200">
              <Share className="w-4 h-4 text-sky-600" />
            </span>
            <strong>{isIpad ? 'en haut à droite' : 'en bas de l’écran'}</strong>
          </span>
          {!isIpad && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500">
              Pas visible ? Appuie d’abord sur
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 border border-slate-200">
                <MoreHorizontal className="w-3.5 h-3.5 text-slate-600" />
              </span>
            </span>
          )}
        </div>
      </li>
      <li className="flex items-start gap-3">
        <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#4338CA] flex items-center justify-center font-black shrink-0">2</span>
        <div className="space-y-1.5 flex-1">
          <span>Fais défiler et choisis :</span>
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-900 font-semibold">
            <span>Sur l’écran d’accueil</span>
            <SquarePlus className="w-4 h-4 text-slate-700" />
          </div>
        </div>
      </li>
      <li className="flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-indigo-50 text-[#4338CA] flex items-center justify-center font-black shrink-0">3</span>
        <span>Appuie sur <strong className="text-sky-600">Ajouter</strong> en haut à droite</span>
      </li>
    </ol>
  );

  const card = (
    <div
      className="bg-white w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl border border-slate-100 relative"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={onClose}
        aria-label="Fermer"
        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-3 pr-6">
        <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-xl shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <h3 className="font-extrabold text-base text-slate-900">
          Ajoute MoroCash à ton écran d’accueil
        </h3>
      </div>
      {steps}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {isIpad ? (
        <div className="absolute top-2 right-4 flex flex-col items-end gap-2">
          <ArrowUp className="w-10 h-10 text-white animate-bounce mr-6" strokeWidth={3} />
          {card}
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {card}
          <ArrowDown className="w-10 h-10 text-white animate-bounce" strokeWidth={3} />
        </div>
      )}
    </div>
  );
};
