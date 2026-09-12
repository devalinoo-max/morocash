import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Le menu « ••• » de la barre haute.
 *
 * Une page y dépose ses actions occasionnelles — imprimer des étiquettes,
 * lancer un inventaire, exporter — au lieu de les afficher en gros boutons
 * au-dessus de sa liste. Sur un écran de 390 px, chacun de ces boutons coûte
 * une ligne de contenu à chaque ouverture, pour une action faite une fois par
 * semaine.
 */
export interface PageMenuAction {
  id: string;
  label: string;
  /** Icône lucide-react, optionnelle. */
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onSelect: () => void;
}

/** Ce que la barre haute affiche : l'action sans son gestionnaire. */
type PageMenuEntry = Omit<PageMenuAction, 'onSelect'>;

interface PageMenuContextValue {
  entries: PageMenuEntry[];
  runAction: (id: string) => void;
  setEntries: (entries: PageMenuEntry[]) => void;
  handlers: React.MutableRefObject<Map<string, () => void>>;
}

const PageMenuContext = createContext<PageMenuContextValue | null>(null);

export const PageMenuProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<PageMenuEntry[]>([]);
  const handlers = useRef<Map<string, () => void>>(new Map());

  const runAction = useCallback((id: string) => {
    handlers.current.get(id)?.();
  }, []);

  const value = useMemo(
    () => ({ entries, runAction, setEntries, handlers }),
    [entries, runAction]
  );

  return <PageMenuContext.Provider value={value}>{children}</PageMenuContext.Provider>;
};

function usePageMenuContext(): PageMenuContextValue {
  const ctx = useContext(PageMenuContext);
  if (!ctx) throw new Error('usePageMenu doit être utilisé sous <PageMenuProvider>');
  return ctx;
}

/** Lu par la barre haute. */
export function usePageMenuEntries(): { entries: PageMenuEntry[]; runAction: (id: string) => void } {
  const { entries, runAction } = usePageMenuContext();
  return { entries, runAction };
}

/**
 * Inscrit les actions de la page courante, et les retire en la quittant.
 *
 * Le tableau peut être reconstruit à chaque rendu : seule sa signature
 * (identifiants, libellés, état grisé) déclenche une mise à jour, et les
 * gestionnaires sont rafraîchis à chaque rendu — un menu resté ouvert appelle
 * donc toujours la version courante, jamais celle capturée à l'inscription.
 */
export function usePageMenu(actions: PageMenuAction[]): void {
  const { setEntries, handlers } = usePageMenuContext();

  useEffect(() => {
    handlers.current = new Map(actions.map((a) => [a.id, a.onSelect]));
  });

  const signature = actions.map((a) => `${a.id}|${a.label}|${a.disabled ? 1 : 0}`).join('§');

  // `actions` change d'identité à chaque rendu : la signature est ce qui dit
  // si le menu affiché a réellement changé.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    setEntries(
      actionsRef.current.map(({ id, label, icon, disabled }) => ({ id, label, icon, disabled }))
    );
    return () => setEntries([]);
  }, [signature, setEntries]);
}
