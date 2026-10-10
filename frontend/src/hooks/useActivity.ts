import { useEffect, useState } from 'react';
import { fetchActivity } from '../api/payments';
import { useApp } from '../context/AppContext';
import type { Activity } from '../types';

const CACHE_KEY = 'morocash_activity_v1';
const CACHE_MAX = 8;

type Cache = Record<string, Activity>;

function readCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    return {};
  }
}

function writeCache(key: string, value: Activity): void {
  try {
    const cache = readCache();
    delete cache[key];
    cache[key] = value;
    const keys = Object.keys(cache);
    for (const old of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete cache[old];
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Stockage plein ou indisponible : on se passera du dernier total connu hors ligne.
  }
}

export interface ActivityState {
  /** Dernière réponse du serveur pour cette période, ou null si aucune n'a jamais été reçue. */
  activity: Activity | null;
  loading: boolean;
  /** Le serveur n'a pas pu être relu : c'est le dernier total connu qui est affiché. */
  stale: boolean;
}

/**
 * Total vendu, compteurs et versements d'une période, tels que le serveur les
 * calcule. C'est la seule source de ces chiffres : l'accueil et la page
 * Commandes passent tous deux par ici, ils ne peuvent donc pas diverger.
 *
 * Relu à chaque fois que les données de la boutique sont rechargées (après un
 * versement, une vente, une annulation, ou le recalage périodique).
 */
export function useActivity(start: Date, end: Date): ActivityState {
  const { dataVersion, authStatus } = useApp();
  const from = start.getTime();
  const to = end.getTime();
  const key = `${from}-${to}`;

  const [state, setState] = useState<ActivityState & { key: string }>(() => ({
    key,
    activity: readCache()[key] ?? null,
    loading: true,
    stale: false,
  }));

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    let cancelled = false;
    setState((prev) =>
      prev.key === key
        ? { ...prev, loading: true }
        : { key, activity: readCache()[key] ?? null, loading: true, stale: false }
    );
    fetchActivity(new Date(from), new Date(to))
      .then((activity) => {
        if (cancelled) return;
        writeCache(key, activity);
        setState({ key, activity, loading: false, stale: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, key, loading: false, stale: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [key, from, to, dataVersion, authStatus]);

  return state.key === key ? state : { activity: readCache()[key] ?? null, loading: true, stale: false };
}
