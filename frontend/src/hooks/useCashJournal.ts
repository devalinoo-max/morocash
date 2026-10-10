import { useEffect, useState } from 'react';
import { fetchCashJournal, type CashJournal } from '../api/cash';
import { useApp } from '../context/AppContext';

const CACHE_KEY = 'morocash_cash_journal_v1';
const CACHE_MAX = 4;

type Cache = Record<string, CashJournal>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    return {};
  }
}

function writeCache(key: string, value: CashJournal): void {
  try {
    const cache = readCache();
    delete cache[key];
    cache[key] = value;
    const keys = Object.keys(cache);
    for (const old of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[old];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Stockage plein ou indisponible : pas de journal hors ligne, rien de plus.
  }
}

export interface CashJournalState {
  /** Dernière réponse du serveur pour cette période, ou null si aucune n'a jamais été reçue. */
  journal: CashJournal | null;
  loading: boolean;
  /** Le serveur n'a pas pu être relu : ce sont les données gardées sur le téléphone. */
  stale: boolean;
}

/**
 * Journal de la caisse d'une période, tel que le serveur le calcule. Relu à
 * chaque rechargement des données de la boutique (vente, versement, dépense,
 * mouvement de caisse) ; hors ligne, la dernière réponse connue reste affichée.
 */
export function useCashJournal(start: Date, end: Date): CashJournalState {
  const { dataVersion, authStatus } = useApp();
  const from = start.getTime();
  const to = end.getTime();
  const key = `${from}-${to}`;

  const [state, setState] = useState<CashJournalState & { key: string }>(() => ({
    key,
    journal: readCache()[key] ?? null,
    loading: true,
    stale: false,
  }));

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    setState((prev) =>
      prev.key === key
        ? { ...prev, loading: true }
        : { key, journal: readCache()[key] ?? null, loading: true, stale: false }
    );
    fetchCashJournal(new Date(from), new Date(to))
      .then((journal) => {
        if (cancelled) return;
        writeCache(key, journal);
        setState({ key, journal, loading: false, stale: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, key, loading: false, stale: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, from, to, dataVersion, authStatus]);

  return state.key === key ? state : { journal: readCache()[key] ?? null, loading: true, stale: false };
}
