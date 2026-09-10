/**
 * Acces minimal a IndexedDB, sans dependance.
 *
 * Pourquoi IndexedDB et pas localStorage : localStorage est synchrone (il bloque
 * le rendu, ce qui est exactement ce qu'on veut eviter, cf. point 1), plafonne
 * autour de 5 Mo, et ne stocke que du texte. Un catalogue avec photos et 30
 * jours de commandes depasse ce plafond.
 */

const DB_NAME = 'morocash';
const DB_VERSION = 1;

/** Instantanes de donnees (catalogue, clients, commandes...) : cle -> valeur. */
export const CACHE_STORE = 'cache';
/** Ecritures faites hors ligne, en attente d'envoi. */
export const QUEUE_STORE = 'queue';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE);
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    // Navigation privee, quota refuse, base corrompue : l'app doit continuer
    // a fonctionner en ligne, simplement sans cache ni file d'attente.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function runTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(storeName, mode);
          const request = work(tx.objectStore(storeName));
          request.onsuccess = () => resolve(request.result ?? null);
          request.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      })
  );
}

export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | null> {
  return runTransaction<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T>);
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return runTransaction<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>).then(
    (rows) => rows ?? []
  );
}

export function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return runTransaction(store, 'readwrite', (s) =>
    key === undefined ? s.put(value) : s.put(value, key)
  ).then(() => undefined);
}

export function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return runTransaction(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
}

export function idbClear(store: string): Promise<void> {
  return runTransaction(store, 'readwrite', (s) => s.clear()).then(() => undefined);
}
