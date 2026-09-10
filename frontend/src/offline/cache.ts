import { CACHE_STORE, idbGet, idbPut } from './idb';

/**
 * Instantane local des donnees de la boutique.
 *
 * Ecrit a chaque chargement reussi, relu au demarrage : c'est ce qui permet
 * d'ouvrir l'app en mode avion et d'y retrouver son catalogue, ses clients et
 * ses commandes recentes au lieu d'un ecran vide.
 */
export interface OfflineSnapshot {
  products: any[];
  customers: any[];
  sales: any[];
  expenses: any[];
  cashSessions: any[];
  cashMovements: any[];
  stockMovements: any[];
  stockReceptions: any[];
  stockCounts: any[];
  productCategories: any[];
  /** Session (nom, boutique, formule) : evite l'ecran de connexion hors ligne. */
  session: any | null;
  savedAt: string;
}

const SNAPSHOT_KEY = 'snapshot';

/**
 * 30 derniers jours de commandes (point 2) : au-dela, l'historique se consulte
 * en ligne. Garder tout ferait grossir l'instantane sans fin sur un telephone
 * d'entree de gamme.
 */
const SALES_RETENTION_DAYS = 30;

function recentSales(sales: any[]): any[] {
  const since = Date.now() - SALES_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return sales.filter((s) => {
    const at = Date.parse(s?.createdAt ?? '');
    return Number.isNaN(at) ? true : at >= since;
  });
}

export function saveSnapshot(snapshot: Omit<OfflineSnapshot, 'savedAt'>): Promise<void> {
  return idbPut(
    CACHE_STORE,
    { ...snapshot, sales: recentSales(snapshot.sales), savedAt: new Date().toISOString() },
    SNAPSHOT_KEY
  );
}

export function loadSnapshot(): Promise<OfflineSnapshot | null> {
  return idbGet<OfflineSnapshot>(CACHE_STORE, SNAPSHOT_KEY);
}

/**
 * Correspondance identifiant provisoire -> identifiant reel.
 *
 * Un produit cree hors ligne porte un id local. S'il est vendu dans la foulee,
 * la commande en attente reference cet id local : au moment de l'envoi, il faut
 * lui substituer l'id que le serveur a attribue au produit, sinon la commande
 * est rejetee. La table survit a une fermeture de l'app, comme la file.
 */
const ID_MAP_KEY = 'idMap';

export function loadIdMap(): Promise<Record<string, string>> {
  return idbGet<Record<string, string>>(CACHE_STORE, ID_MAP_KEY).then((m) => m ?? {});
}

export function saveIdMap(map: Record<string, string>): Promise<void> {
  return idbPut(CACHE_STORE, map, ID_MAP_KEY);
}
