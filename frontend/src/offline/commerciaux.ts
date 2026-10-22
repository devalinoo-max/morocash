import { useSyncExternalStore } from 'react';
import { ApiError, generateClientUuid } from '../api/client';
import * as commerciauxApi from '../api/commerciaux';
import { CACHE_STORE, idbGet, idbPut } from './idb';

/**
 * Commerciaux de la boutique, gardés sur l'appareil.
 *
 * La liste est relue au serveur dès que possible et mise en cache : hors
 * ligne, le sélecteur « Vendu par » fonctionne avec la dernière liste connue.
 * Un commercial créé hors ligne reçoit tout de suite son identifiant
 * définitif (UUID) et attend ici d'être envoyé. Les ventes qui le citent
 * portent aussi son nom : le serveur le crée s'il les reçoit avant lui.
 */
export type LocalCommercial = commerciauxApi.ApiCommercial & { pending?: boolean };

type PendingCreate = { id: string; nom: string; telephone?: string; pourMoi?: boolean };
type Cached = { list: LocalCommercial[]; pending: PendingCreate[] };

let businessId: string | null = null;
let state: Cached = { list: [], pending: [] };
const listeners = new Set<() => void>();

const cacheKey = (id: string) => 'commerciaux:' + id;

function emit() {
  for (const l of listeners) l();
}

function setState(next: Cached) {
  state = next;
  emit();
  if (businessId) void idbPut(CACHE_STORE, next, cacheKey(businessId));
}

const isNetworkError = (error: unknown) => error instanceof ApiError && error.code === 'NETWORK_ERROR';
const online = () => typeof navigator === 'undefined' || navigator.onLine;

let flushing = false;

/** Envoie les créations en attente, dans l'ordre. S'arrête à la première panne réseau. */
export async function flushPendingCommerciaux(): Promise<void> {
  if (flushing || !businessId || !online()) return;
  flushing = true;
  try {
    while (state.pending.length > 0) {
      const next = state.pending[0];
      try {
        const created = await commerciauxApi.createCommercial(next);
        setState({
          pending: state.pending.slice(1),
          list: state.list.map((c) => (c.id === next.id ? { ...created } : c)),
        });
      } catch (error) {
        if (isNetworkError(error)) return;
        // Refus du serveur (droits...) : rejouer n'y changera rien.
        setState({ ...state, pending: state.pending.slice(1) });
      }
    }
  } finally {
    flushing = false;
  }
}

/** Charge la liste de la boutique : cache d'abord, serveur ensuite. */
export async function loadCommerciaux(forBusinessId: string): Promise<void> {
  if (businessId !== forBusinessId) {
    businessId = forBusinessId;
    const cached = await idbGet<Cached>(CACHE_STORE, cacheKey(forBusinessId));
    state = cached ?? { list: [], pending: [] };
    emit();
  }
  if (!online()) return;
  try {
    const server = await commerciauxApi.listCommerciaux();
    const pendingIds = new Set(state.pending.map((p) => p.id));
    const localOnly = state.list.filter((c) => pendingIds.has(c.id) && !server.some((s) => s.id === c.id));
    setState({ ...state, list: [...server, ...localOnly] });
  } catch {
    // Hors ligne ou serveur indisponible : la liste en cache reste affichée.
  }
  await flushPendingCommerciaux();
}

/**
 * Crée un commercial tout de suite à l'écran, puis l'envoie (ou le met en
 * attente hors ligne). `userId` sert seulement à l'affichage de « Moi ».
 */
export function createCommercialLocal(input: { nom: string; telephone?: string; pourMoi?: boolean; userId?: string }) {
  const id = generateClientUuid();
  const commercial: LocalCommercial = {
    id,
    nom: input.nom.trim(),
    telephone: input.telephone?.trim() || null,
    actif: true,
    userId: input.pourMoi ? input.userId ?? null : null,
    pending: true,
  };
  setState({
    list: [...state.list, commercial],
    pending: [...state.pending, { id, nom: commercial.nom, telephone: commercial.telephone ?? undefined, pourMoi: input.pourMoi }],
  });
  void flushPendingCommerciaux();
  return commercial;
}

/** Modification depuis les Réglages : en ligne seulement. */
export async function updateCommercialRemote(id: string, patch: { nom?: string; telephone?: string | null; actif?: boolean }) {
  const updated = await commerciauxApi.updateCommercial(id, patch);
  setState({ ...state, list: state.list.map((c) => (c.id === id ? updated : c)) });
  return updated;
}

export function useCommerciaux(): LocalCommercial[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state.list
  );
}

/** Dernier commercial choisi sur cet appareil, pré-sélectionné à la vente suivante. */
const LAST_KEY = 'morocash_dernier_commercial:';

export function rememberLastCommercial(forBusinessId: string, id: string | null) {
  try {
    if (id) localStorage.setItem(LAST_KEY + forBusinessId, id);
    else localStorage.removeItem(LAST_KEY + forBusinessId);
  } catch {
    // Navigation privée : pas de pré-sélection, rien de grave.
  }
}

export function lastCommercial(forBusinessId: string): string | null {
  try {
    return localStorage.getItem(LAST_KEY + forBusinessId);
  } catch {
    return null;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPendingCommerciaux());
}
