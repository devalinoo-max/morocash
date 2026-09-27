import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, MessageCircleMore, SendHorizontal, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { HelpIntent, HelpTarget, matchHelpIntent } from './helpIntents';

/**
 * Numéro WhatsApp du support MoroCash (indicatif compris, chiffres seuls),
 * proposé quand l'assistant ne reconnaît pas la question. Vide : la réponse
 * le dit sans bouton, plutôt que d'ouvrir un WhatsApp sans destinataire.
 */
const SUPPORT_WHATSAPP_NUMBER = '';

// Sur téléphone, la bulle se déploie en « Besoin d'aide ? » à l'arrivée puis
// de temps en temps, et se replie seule : elle ne prend jamais de place durablement.
const FIRST_EXPAND_DELAY_MS = 1500;
const EXPANDED_DURATION_MS = 4000;
const EXPAND_EVERY_MS = 90_000;

interface ChatMessage {
  id: number;
  from: 'user' | 'assistant';
  text: string;
  button?: { label: string; target: HelpTarget };
  support?: boolean;
}

const WELCOME: ChatMessage = {
  id: 0,
  from: 'assistant',
  text: 'Bonjour ! Pose-moi ta question avec tes mots, par exemple « comment je télécharge mon catalogue ? ». Je te montre où aller.',
};

export const HelpAssistant: React.FC = () => {
  const {
    settings,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    setIsNewProductOpen,
    attemptNewSale,
    openNewExpense,
  } = useApp();
  // Le bouton « Installer l'application » occupe le même coin : la bulle se
  // place au-dessus de lui tant qu'il est affiché.
  const { canPromptInstall, isIosManualInstall, isInstalled } = useInstallPrompt();
  const installButtonShown = !isInstalled && (canPromptInstall || isIosManualInstall);

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Déploiement intermittent (téléphone). Sur ordinateur la pilule est
  // toujours ouverte par le CSS, cet état n'y change rien.
  useEffect(() => {
    if (isOpen) return;
    const timers: number[] = [];
    const expandBriefly = () => {
      setIsExpanded(true);
      timers.push(window.setTimeout(() => setIsExpanded(false), EXPANDED_DURATION_MS));
    };
    timers.push(window.setTimeout(expandBriefly, FIRST_EXPAND_DELAY_MS));
    const interval = window.setInterval(expandBriefly, EXPAND_EVERY_MS);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearInterval(interval);
      setIsExpanded(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isOpen]);

  const push = (message: Omit<ChatMessage, 'id'>) =>
    setMessages((prev) => [...prev, { ...message, id: nextId.current++ }]);

  const answerFor = (intent: HelpIntent | null): Omit<ChatMessage, 'id'> => {
    if (intent) {
      return { from: 'assistant', text: intent.answer, button: intent.button };
    }
    return {
      from: 'assistant',
      text: SUPPORT_WHATSAPP_NUMBER
        ? 'Je n’ai pas trouvé de réponse à cette question. Essaie avec d’autres mots, ou écris directement à l’équipe MoroCash sur WhatsApp.'
        : 'Je n’ai pas trouvé de réponse à cette question. Essaie avec d’autres mots, ou contacte l’équipe MoroCash.',
      support: Boolean(SUPPORT_WHATSAPP_NUMBER),
    };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const question = draft.trim();
    if (!question) return;
    setDraft('');
    push({ from: 'user', text: question });
    push(answerFor(matchHelpIntent(question, { servicesOnly: settings.activityType === 'SERVICES' })));
  };

  const go = (target: HelpTarget) => {
    setIsOpen(false);
    if (target.kind === 'action') {
      if (target.action === 'newSale') attemptNewSale();
      else if (target.action === 'newExpense') openNewExpense();
      else {
        setActiveTab('products');
        setActiveMoreSubTab(null);
        setIsNewProductOpen(true);
      }
      return;
    }
    setActiveTab(target.tab);
    setActiveMoreSubTab(target.subTab ?? null);
    setCustomersDebtorsFilter(Boolean(target.debtorsOnly));
  };

  const supportUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    'Bonjour, j’ai une question sur MoroCash : '
  )}`;

  // Position : au-dessus de la barre du bas sur téléphone, dans le coin sur
  // ordinateur ; un cran plus haut quand le bouton d'installation est là.
  const position = installButtonShown ? 'bottom-[8.5rem] md:bottom-[4.75rem]' : 'bottom-20 md:bottom-6';

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          id="btn-help-assistant"
          onClick={() => setIsOpen(true)}
          aria-label="Besoin d’aide ? Ouvrir l’assistant MoroCash"
          className={`fixed ${position} right-4 z-30 h-[42px] rounded-full bg-gradient-to-br from-[#4F46E5] to-[#8B5CF6] text-white shadow-lg shadow-indigo-500/30 flex items-center cursor-pointer transition-all duration-300 active:scale-95 ${
            isExpanded ? 'pl-3 pr-4 gap-2' : 'px-[9px] gap-0 md:pl-3 md:pr-4 md:gap-2'
          }`}
        >
          <MessageCircleMore className="w-6 h-6 shrink-0" />
          <span
            className={`overflow-hidden whitespace-nowrap text-xs font-bold transition-all duration-300 md:max-w-[9rem] md:opacity-100 ${
              isExpanded ? 'max-w-[9rem] opacity-100' : 'max-w-0 opacity-0'
            }`}
          >
            Besoin d’aide ?
          </span>
          {!isExpanded && (
            <span className="md:hidden absolute top-0 right-0 flex w-2.5 h-2.5">
              <span className="absolute inset-0 rounded-full bg-rose-500 opacity-75 motion-safe:animate-ping" />
              <span className="relative w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[70] bg-slate-950/30 md:bg-transparent" onClick={() => setIsOpen(false)} />
          <div
            role="dialog"
            aria-label="Assistant MoroCash"
            className="fixed z-[80] inset-x-0 bottom-0 h-[75dvh] rounded-t-3xl md:inset-x-auto md:right-6 md:bottom-6 md:w-[380px] md:h-[560px] md:max-h-[calc(100vh-3rem)] md:rounded-3xl bg-white shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
          >
            <div className="shrink-0 px-4 py-3 bg-gradient-to-br from-[#4F46E5] to-[#8B5CF6] text-white flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
                <MessageCircleMore className="w-5 h-5" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-extrabold">Assistant MoroCash</h2>
                <p className="text-[11px] text-white/80">Marche aussi sans internet</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Fermer l’assistant"
                className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-[#F4F4F8]">
              {messages.map((m) =>
                m.from === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-[#4F46E5] text-white text-sm">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="flex flex-col items-start gap-2">
                    <p className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-white border border-slate-200 text-slate-800 text-sm">
                      {m.text}
                    </p>
                    {m.button && (
                      <button
                        type="button"
                        onClick={() => go(m.button!.target)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        {m.button.label}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {m.support && (
                      <a
                        href={supportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                      >
                        Écrire au support sur WhatsApp
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )
              )}
            </div>

            <form onSubmit={handleSubmit} className="shrink-0 p-3 border-t border-slate-200 bg-white flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Écris ta question…"
                aria-label="Ta question"
                className="flex-1 min-w-0 h-11 px-3.5 rounded-xl border border-slate-200 bg-slate-50 text-base md:text-sm text-slate-900 focus:outline-none focus:border-[#4F46E5] focus:bg-white"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Envoyer"
                className="w-11 h-11 shrink-0 rounded-xl bg-[#4F46E5] hover:bg-indigo-700 disabled:opacity-40 text-white flex items-center justify-center cursor-pointer"
              >
                <SendHorizontal className="w-5 h-5" />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
};
