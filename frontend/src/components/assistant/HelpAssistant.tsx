import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronLeft, MessageCircleMore, SendHorizontal, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { HelpIntent, HelpTarget, matchHelpIntent } from './helpIntents';

// Choix « Masqué » de l'utilisateur, gardé d'une visite à l'autre.
const HIDDEN_KEY = 'morocash_assistant_hidden';

function readHiddenChoice(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function saveHiddenChoice(hidden: boolean): void {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, '1');
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite seulement.
  }
}

/**
 * Clavier ouvert sur téléphone : la zone visible rétrécit nettement par
 * rapport à la plus grande hauteur vue depuis l'ouverture.
 */
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let tallest = vv.height;
    const onResize = () => {
      tallest = Math.max(tallest, vv.height);
      setOpen(window.matchMedia('(max-width: 767px)').matches && vv.height < tallest - 150);
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);
  return open;
}

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

interface HelpAssistantProps {
  /** La bannière d'installation est affichée : la bulle se place au-dessus. */
  aboveInstallBanner?: boolean;
}

export const HelpAssistant: React.FC<HelpAssistantProps> = ({ aboveInstallBanner = false }) => {
  const {
    settings,
    isNewSaleOpen,
    isNewProductOpen,
    selectedSaleForReceipt,
    saleSuccessReceipt,
    setActiveTab,
    setActiveMoreSubTab,
    setCustomersDebtorsFilter,
    setIsNewProductOpen,
    attemptNewSale,
    openNewExpense,
  } = useApp();
  // Sur téléphone, le bouton « Installer l'application » occupe le même coin :
  // la bulle se place au-dessus de lui tant qu'il est affiché.
  const { canPromptInstall, isIosManualInstall, isInstalled } = useInstallPrompt();
  const installButtonShown = !isInstalled && (canPromptInstall || isIosManualInstall);

  // Trois états : Déployé (pilule, par défaut sur ordinateur), Réduit (bulle
  // ronde, par défaut sur téléphone) et Masqué (onglet sur le bord droit).
  const [hiddenChoice, setHiddenChoice] = useState(readHiddenChoice);
  // Écrans à barre d'action en bas (étapes de commande, paiement, formulaire,
  // reçu) : l'assistant se masque seul, sans toucher au choix enregistré.
  const onActionScreen =
    isNewSaleOpen || isNewProductOpen || Boolean(selectedSaleForReceipt) || Boolean(saleSuccessReceipt);
  // Rouvert à la main sur un de ces écrans : vaut jusqu'à ce qu'on le quitte.
  const [reopenedHere, setReopenedHere] = useState(false);
  useEffect(() => {
    if (!onActionScreen) setReopenedHere(false);
  }, [onActionScreen]);
  const isHidden = hiddenChoice || (onActionScreen && !reopenedHere);
  const keyboardOpen = useKeyboardOpen();

  const hide = () => {
    saveHiddenChoice(true);
    setHiddenChoice(true);
  };
  const reopen = () => {
    saveHiddenChoice(false);
    setHiddenChoice(false);
    if (onActionScreen) setReopenedHere(true);
  };

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
    // Masqué : aucun déploiement automatique.
    if (isOpen || isHidden) return;
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
  }, [isOpen, isHidden]);

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
  // ordinateur ; un cran plus haut quand le bouton d'installation (téléphone)
  // ou la bannière d'installation (ordinateur) est là.
  const position = `${installButtonShown ? 'bottom-[8.5rem]' : 'bottom-20'} ${
    aboveInstallBanner ? 'md:bottom-[5.5rem]' : 'md:bottom-6'
  }`;

  return (
    <>
      {!isOpen && !keyboardOpen && isHidden && (
        <button
          type="button"
          id="btn-help-assistant-tab"
          onClick={reopen}
          aria-label="Rouvrir l’assistant"
          className={`fixed ${position} right-0 z-30 w-12 h-14 flex items-center justify-end cursor-pointer`}
        >
          <span
            className="w-4 h-14 rounded-l-lg flex items-center justify-center shadow-md"
            style={{ backgroundColor: '#4F46E5' }}
          >
            <ChevronLeft className="w-4 h-4 text-white" strokeWidth={3} />
          </span>
        </button>
      )}

      {!isOpen && !keyboardOpen && !isHidden && (
        <div className={`fixed ${position} right-4 z-30 flex flex-col items-end`}>
        {/* Rond de 28 px, 8 px au-dessus de la bulle, aligné sur son bord droit ;
            la zone de toucher fait 48 px. */}
        <button
          type="button"
          id="btn-help-assistant-reduce"
          onClick={hide}
          aria-label="Réduire l’assistant"
          className="w-12 h-12 -mr-[10px] -mb-[2px] flex items-center justify-center cursor-pointer"
        >
          <span
            className="w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-sm"
            style={{ border: '1px solid #E5E7EB' }}
          >
            <ChevronDown className="w-4 h-4" style={{ color: '#4F46E5' }} strokeWidth={2.5} />
          </span>
        </button>
        <button
          type="button"
          id="btn-help-assistant"
          onClick={() => setIsOpen(true)}
          aria-label="Besoin d’aide ? Ouvrir l’assistant MoroCash"
          className={`relative h-[42px] rounded-full bg-gradient-to-br from-[#4F46E5] to-[#8B5CF6] text-white shadow-lg shadow-indigo-500/30 flex items-center cursor-pointer transition-all duration-300 active:scale-95 ${
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
        </div>
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
