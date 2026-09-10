import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { matchPath, type MoreSubTab } from '../utils/routes';
import {
  Product,
  ProductCode,
  BarcodeFormat,
  CodeOrigin,
  Customer,
  Sale,
  Expense,
  ShopSettings,
  UIState,
  UserRole,
  ActivityType,
  PaymentMethod,
  CartItem,
  CashRegisterSession,
  CashMovement,
  NavigationTab,
  StockMovement,
  StockReception,
  StockCount,
  StockReceptionLine,
  ReceiptDelivery,
  ReceiptDeliveryChannel,
} from '../types';
import {
  initialProducts,
  initialCustomers,
  initialSales,
  initialExpenses,
  initialSettings,
  initialCashSessions,
  initialCashMovements,
  initialStockMovements,
  initialStockReceptions,
  initialStockCounts,
} from '../data/mockInitialData';
import {
  generateUUID,
  getTerminology,
} from '../utils/formatters';
import { validateBarcodeChecksum } from '../utils/barcodeEngine';
import confetti from 'canvas-confetti';
import { PLANS } from '../data/plans';
import * as authApi from '../api/auth';
import * as businessApi from '../api/business';
import * as productsApi from '../api/products';
import * as customersApi from '../api/customers';
import * as ordersApi from '../api/orders';
import * as cashApi from '../api/cash';
import * as expensesApi from '../api/expenses';
import * as stockApi from '../api/stock';
import * as usersApi from '../api/users';
import { ApiError, generateClientUuid } from '../api/client';
import {
  buildOptimisticProduct,
  buildOptimisticSale,
  haptic,
  revertSaleFromStock,
  applySaleToStock,
} from '../offline/optimistic';
import {
  SERVER_DEDUPLICATED,
  dequeue,
  enqueue,
  listPending,
  markAttempt,
  retryDelayMs,
  type PendingMutation,
} from '../offline/queue';
import { loadIdMap, loadSnapshot, saveIdMap, saveSnapshot } from '../offline/cache';
import { CACHE_STORE, QUEUE_STORE, idbClear } from '../offline/idb';
import { NO_CATEGORY_LABEL } from '../api/categories';
import { hasSessionHint, markSessionEnded, markSessionStarted } from '../utils/session';

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Impossible de joindre le serveur. Réessaie.';
}

/**
 * Une panne reseau franche (requete jamais partie, ou coupee en vol) se rejoue
 * sans risque. Une reponse d'erreur du serveur, elle, veut dire quelque chose
 * et doit remonter au commercant : rejouer indefiniment un refus ne le
 * corrigera pas.
 */
function isNetworkFailure(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'NETWORK_ERROR';
}

/**
 * Refus prononces AVANT toute ecriture en base : session expiree, quota de
 * requetes, boutique en lecture seule, abonnement echu. Rien n'a ete cree cote
 * serveur, donc rejouer plus tard ne peut pas faire de doublon — meme pour un
 * produit ou un client, qui n'ont pas de garde-fou anti-doublon en base.
 *
 * Le cas est frequent et couteux : un commercant reste hors ligne assez
 * longtemps pour que sa session expire perdait, au retour du reseau, tout ce
 * qu'il avait saisi entre-temps (la file jetait la ligne pour ne pas risquer
 * un doublon). On la garde desormais : elle repartira apres reconnexion.
 */
const RETRYABLE_REFUSALS = new Set([
  'AUTH_SESSION_EXPIRED',
  'AUTH_TOO_MANY_ATTEMPTS',
  'RATE_LIMITED',
  'BUSINESS_READ_ONLY',
  'SUBSCRIPTION_EXPIRED',
]);

function wroteNothing(error: unknown): boolean {
  return error instanceof ApiError && RETRYABLE_REFUSALS.has(error.code);
}

/**
 * La ressource visee n'existe pas (ou plus) cote serveur. Pour une
 * modification de produit, cela veut dire que sa creation n'est jamais passee :
 * insister sur le meme identifiant echouera toujours.
 */
function isMissingResource(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'PRODUCT_NOT_FOUND' || error.code === 'RESOURCE_NOT_OWNED')
  );
}

interface AppContextType {
  // Auth réel (étape 13) — remplace l'ancien onboarding local uniquement.
  authStatus: 'loading' | 'anonymous' | 'authenticated';
  currentUser: authApi.ApiUser | null;
  currentBusiness: authApi.ApiBusiness | null;
  registerBusinessAccount: (
    input: authApi.RegisterInput
  ) => Promise<{ success: boolean; message?: string }>;
  loginUser: (
    input: authApi.LoginInput
  ) => Promise<{ success: boolean; requiresBusinessSelection?: boolean; businesses?: { businessId: string; businessNom: string }[]; message?: string }>;
  logoutUser: () => Promise<void>;
  closeAccount: () => Promise<boolean>;
  // Vrai juste après une inscription réussie (pas après une connexion ni une
  // reprise de session) — pilote l'écran "essai vs payer" une seule fois.
  justRegistered: boolean;
  dismissWelcomeChoice: () => void;

  // State
  uiState: UIState;
  setUiState: (state: UIState) => void;
  settings: ShopSettings;
  updateSettings: (newSettings: Partial<ShopSettings>) => void;
  updateCashRegisterMode: (mode: 'LIBRE' | 'STRICT') => Promise<boolean>;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  expenses: Expense[];
  cart: CartItem[];
  cashSessions: CashRegisterSession[];
  activeCashSession: CashRegisterSession | null;
  cashMovements: CashMovement[];
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  activeMoreSubTab: MoreSubTab | null;
  setActiveMoreSubTab: (subTab: MoreSubTab | null) => void;
  // Piloté depuis l'extérieur de l'onglet Clients (liens "Qui me doit" du tableau
  // de bord, de la caisse, du menu Plus et de la barre latérale) pour ouvrir la
  // liste déjà filtrée sur les débiteurs plutôt que la liste complète des clients.
  customersDebtorsFilter: boolean;
  setCustomersDebtorsFilter: (value: boolean) => void;
  
  // Modals & Flows
  isNewSaleOpen: boolean;
  setIsNewSaleOpen: (open: boolean) => void;
  // Formulaire "nouveau produit" — pilote depuis l'adresse /produits/nouveau
  // autant que depuis le bouton de la liste, pour que l'adresse et l'ecran
  // affiche ne puissent pas diverger.
  isNewProductOpen: boolean;
  setIsNewProductOpen: (open: boolean) => void;
  // Ouvre la vente sauf abonnement expiré — redirige alors vers l'écran
  // d'abonnement au lieu d'ouvrir la modale (§ paywall).
  attemptNewSale: () => void;
  // true dès que l'abonnement est expiré : sert à griser (visuellement) tous
  // les boutons d'action qui créent/modifient des données, sans les cacher —
  // l'utilisateur doit voir qu'ils existent mais comprendre qu'ils sont bloqués.
  isWriteLocked: boolean;
  // Porte générique pour toute action de création/modification (ouvrir un
  // produit, une réception, la caisse, etc.) : bloque et redirige vers
  // l'abonnement si l'essai/l'abonnement est expiré, sinon exécute l'action.
  gateWrite: (action: () => void) => void;
  selectedSaleForReceipt: Sale | null;
  setSelectedSaleForReceipt: (sale: Sale | null) => void;
  saleSuccessReceipt: Sale | null;
  setSaleSuccessReceipt: (sale: Sale | null) => void;
  receiptDeliveries: ReceiptDelivery[];
  recordReceiptDelivery: (orderId: string, canal: ReceiptDeliveryChannel, orderReference?: string) => void;
  toastMessage: { text: string; type: 'success' | 'warning' | 'error' | 'info' } | null;
  showToast: (text: string, type?: 'success' | 'warning' | 'error' | 'info') => void;
  
  // Cart Actions
  addToCart: (product: Product) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, delta: number) => void;
  setCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartItemCount: number;

  // Business Actions
  completeSale: (params: {
    paidAmount: number;
    paymentMethod: PaymentMethod;
    discount?: number;
    discountMode?: 'PERCENTAGE' | 'AMOUNT';
    discountValue?: number;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  }) => Promise<Sale | null>;
  cancelSale: (saleId: string, reason?: string) => Promise<void>;
  assignCustomerToSale: (saleId: string, customerId: string, customerName: string, customerPhone?: string) => void;

  addProduct: (product: Omit<Product, 'id' | 'salesCount' | 'createdAt'>) => Promise<Product | null>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  
  // Scannable Product Codes Management
  findProductByCode: (code: string) => Product | undefined;
  addProductCode: (
    productId: string,
    code: string,
    format: BarcodeFormat,
    origin: CodeOrigin,
    isPrimary?: boolean
  ) => { success: boolean; conflictProduct?: Product; message?: string };
  transferProductCode: (fromProductId: string, toProductId: string, code: string) => void;
  removeProductCode: (productId: string, codeId: string) => { success: boolean; message?: string };
  setPrimaryProductCode: (productId: string, codeId: string) => void;

  addCustomer: (customer: Omit<Customer, 'id' | 'debtAgeDays' | 'lastActivity'>) => Promise<Customer | null>;
  recordDebtPayment: (customerId: string, amount: number, paymentMethod: PaymentMethod) => Promise<void>;

  addExpense: (expense: Omit<Expense, 'id' | 'syncStatus'>) => Promise<Expense | null>;

  // Employees (BLOC 8) — écrit réellement sur le backend (étape 13).
  employees: usersApi.ApiEmployee[];
  fetchEmployees: () => Promise<void>;
  addEmployee: (input: { nom: string; telephone: string; pin: string; role: 'SELLER' | 'ACCOUNTANT' }) => Promise<boolean>;
  setEmployeeActive: (id: string, actif: boolean) => Promise<boolean>;

  // "Mes appareils connectés" (réglages > Mon compte) — sessions réelles de l'utilisateur.
  mySessions: authApi.ApiSession[];
  fetchMySessions: () => Promise<void>;
  revokeMySession: (sessionId: string) => Promise<boolean>;
  revokeOtherMySessions: () => Promise<boolean>;

  // Cash Register Actions
  openCashRegister: (fondDepart: number) => Promise<void>;
  closeCashRegister: (montantCompte: number, commentaire?: string) => Promise<void>;
  addCashMovement: (params: {
    type: 'ENTREE' | 'SORTIE';
    origine: 'COMMANDE' | 'REMBOURSEMENT' | 'DEPENSE' | 'APPORT' | 'RETRAIT';
    montant: number;
    methode: PaymentMethod;
    motif?: string;
    referenceId?: string;
  }) => Promise<void>;

  // Stock Movements & Tracking
  stockMovements: StockMovement[];
  stockReceptions: StockReception[];
  stockCounts: StockCount[];
  recordStockReception: (params: {
    fournisseur?: string;
    note?: string;
    justificatif_url?: string;
    lines: StockReceptionLine[];
  }) => Promise<{ reception: StockReception; expense: Expense | null } | null>;
  recordStockBreakage: (params: {
    productId: string;
    quantity: number;
    motif: string;
    note?: string;
    photo?: string;
  }) => Promise<StockMovement | null>;
  recordStockLoss: (params: {
    productId: string;
    quantity: number;
    motif: string;
    note?: string;
    photo?: string;
  }) => Promise<StockMovement | null>;
  recordStockCount: (params: {
    perimetre: string;
    items: { productId: string; countedQty: number }[];
    commentaire?: string;
  }) => Promise<StockCount | null>;
  cancelStockMovement: (
    movementId: string,
    reason: string
  ) => Promise<{ success: boolean; message?: string }>;

  // Sync & Offline Engine
  syncPendingOperations: () => Promise<void>;
  toggleOfflineMode: () => void;
  resetToDefaultData: () => void;

  // ── Envoi differe (points 1 et 2) ─────────────────────────────────────
  /** Ecritures pas encore confirmees par le serveur. */
  pendingMutations: PendingMutation[];
  /** Vrai tant qu'une reprise de la file est en cours. */
  isSyncing: boolean;
  /** Etat reel du reseau, independant du bascule manuel des reglages. */
  isOnline: boolean;
  /**
   * Dernier refus du serveur : affiche en bande basse avec "Reessayer".
   * Aucune donnee n'est perdue tant que cette bande est la.
   */
  pendingFailure: { message: string; canRetry: boolean } | null;
  dismissPendingFailure: () => void;
  /** Nombre d'elements envoyes lors de la derniere reprise ("4 elements envoyes"). */
  lastSyncedCount: number | null;
  /** Vrai pour une commande encore dans la file (badge "En attente"). */
  isSalePending: (saleId: string) => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SETTINGS: 'morocash_settings_v3',
  PRODUCTS: 'morocash_products_v3',
  CUSTOMERS: 'morocash_customers_v3',
  SALES: 'morocash_sales_v3',
  EXPENSES: 'morocash_expenses_v3',
  CART: 'morocash_cart_v3',
  CASH_SESSIONS: 'morocash_cash_sessions_v3',
  CASH_MOVEMENTS: 'morocash_cash_movements_v3',
  STOCK_MOVEMENTS: 'morocash_stock_movements_v3',
  STOCK_RECEPTIONS: 'morocash_stock_receptions_v3',
  STOCK_COUNTS: 'morocash_stock_counts_v3',
  RECEIPT_DELIVERIES: 'morocash_receipt_deliveries_v3',
};

const defaultReceiptDeliveries: ReceiptDelivery[] = [
  {
    id: 'del-1',
    businessId: 'A7K2X',
    orderId: 'sale-1',
    orderReference: 'CMD-20260904-0046',
    canal: 'WHATSAPP',
    userId: 'owner',
    userName: 'Mamadou Koné',
    createdAt: '2026-09-04T06:32:00Z',
  },
  {
    id: 'del-2',
    businessId: 'A7K2X',
    orderId: 'sale-2',
    orderReference: 'CMD-20260904-0045',
    canal: 'IMPRESSION',
    userId: 'owner',
    userName: 'Mamadou Koné',
    createdAt: '2026-09-04T05:50:00Z',
  },
  {
    id: 'del-3',
    businessId: 'A7K2X',
    orderId: 'sale-3',
    orderReference: 'CMD-20260903-0044',
    canal: 'WHATSAPP',
    userId: 'owner',
    userName: 'Mamadou Koné',
    createdAt: '2026-09-03T16:20:00Z',
  },
  {
    id: 'del-4',
    businessId: 'A7K2X',
    orderId: 'sale-5',
    orderReference: 'CMD-20260902-0042',
    canal: 'WHATSAPP',
    userId: 'owner',
    userName: 'Mamadou Koné',
    createdAt: '2026-09-02T14:45:00Z',
  },
  {
    id: 'del-5',
    businessId: 'A7K2X',
    orderId: 'sale-6',
    orderReference: 'CMD-20260902-0041',
    canal: 'WHATSAPP',
    userId: 'emp-1',
    userName: 'Awa Traoré',
    createdAt: '2026-09-02T09:20:00Z',
  },
  {
    id: 'del-6',
    businessId: 'A7K2X',
    orderId: 'sale-8',
    orderReference: 'CMD-20260901-0039',
    canal: 'IMPRESSION',
    userId: 'owner',
    userName: 'Mamadou Koné',
    createdAt: '2026-09-01T10:15:00Z',
  },
  {
    id: 'del-7',
    businessId: 'A7K2X',
    orderId: 'sale-9',
    orderReference: 'CMD-20260828-0038',
    canal: 'WHATSAPP',
    userId: 'owner',
    userName: 'Mamadou Koné',
    createdAt: '2026-08-28T15:30:00Z',
  },
];

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 1. Settings State
  const [settings, setSettings] = useState<ShopSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? JSON.parse(saved) : initialSettings;
    } catch {
      return initialSettings;
    }
  });

  // 1b. Auth réel (étape 13) — session cookie vérifiée auprès du vrai backend
  // au montage ; tant que 'loading', on n'affiche ni l'app ni l'écran de connexion.
  const [authStatus, setAuthStatus] = useState<'loading' | 'anonymous' | 'authenticated'>('loading');
  // Lu par les ecouteurs poses une seule fois au montage (retour au premier
  // plan), qui captureraient sinon la valeur du premier rendu.
  const authStatusRef = useRef(authStatus);
  authStatusRef.current = authStatus;
  const [currentUser, setCurrentUser] = useState<authApi.ApiUser | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<authApi.ApiBusiness | null>(null);

  // 2. UI State
  const [uiState, setUiState] = useState<UIState>(settings.isOfflineMode ? 'OFFLINE' : 'READY');

  // 3. Data Collections
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      const loaded: Product[] = saved ? JSON.parse(saved) : initialProducts;
      const shopCode = settings.shopCode || 'A7K2X';

      return loaded.map((p, idx) => {
        // Le code interne vient du SERVEUR, qui le genere a la creation du
        // produit (INT-XXXXXXXXX) et garantit son unicite dans la boutique.
        // On n'en fabrique plus ici : un code invente localement n'existait
        // pour personne d'autre — il finissait imprime sur l'etiquette, puis
        // introuvable au scan des que le catalogue etait recharge du serveur.
        const internalCode = p.internalCode;
        const codes = p.productCodes ? [...p.productCodes] : [];

        const hasHouseCode =
          !internalCode || codes.some((c) => c.origine === 'GENERE' || c.code === internalCode);
        if (!hasHouseCode) {
          codes.unshift({
            id: `code-gen-${p.id || idx}`,
            business_id: shopCode,
            product_id: p.id,
            code: internalCode,
            format: 'INTERNE',
            origine: 'GENERE',
            est_principal: !p.barcode && codes.length === 0,
            created_at: p.createdAt || new Date().toISOString(),
          });
        }

        if (p.barcode && !codes.some((c) => c.code === p.barcode)) {
          codes.push({
            id: `code-fac-${p.id || idx}`,
            business_id: shopCode,
            product_id: p.id,
            code: p.barcode,
            format: validateBarcodeChecksum(p.barcode).format,
            origine: 'MANUEL',
            est_principal: true,
            created_at: p.createdAt || new Date().toISOString(),
          });
        }

        if (!codes.some((c) => c.est_principal) && codes.length > 0) {
          codes[0].est_principal = true;
        }

        return {
          ...p,
          internalCode,
          productCodes: codes,
        };
      });
    } catch {
      return initialProducts;
    }
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      return saved ? JSON.parse(saved) : initialCustomers;
    } catch {
      return initialCustomers;
    }
  });

  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SALES);
      const parsed: Sale[] = saved ? JSON.parse(saved) : initialSales;
      return parsed
        .filter((s) => !s.items?.some((it) => it.productId === 'debt-payment'))
        .map((s) => {
          let ref = s.reference;
          if (ref.startsWith('VNT-')) ref = ref.replace('VNT-', 'CMD-');
          if (ref.startsWith('LOC-')) ref = ref.replace('LOC-', 'CMD-');
          return { ...s, reference: ref };
        });
    } catch {
      return initialSales;
    }
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      return saved ? JSON.parse(saved) : initialExpenses;
    } catch {
      return initialExpenses;
    }
  });

  // Employees — toujours rechargé depuis le backend (jamais persisté en local,
  // contrairement aux données ci-dessus qui datent de l'ère mock).
  const [employees, setEmployees] = useState<usersApi.ApiEmployee[]>([]);
  const [mySessions, setMySessions] = useState<authApi.ApiSession[]>([]);

  // 4. Cart State (Persists across crashes and reloads as per §3 & §8)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CART);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 5. Offline Sync Queue
  // 6. Cash Register State (BLOC 7)
  const [cashSessions, setCashSessions] = useState<CashRegisterSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CASH_SESSIONS);
      return saved ? JSON.parse(saved) : initialCashSessions;
    } catch {
      return initialCashSessions;
    }
  });

  const [cashMovements, setCashMovements] = useState<CashMovement[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CASH_MOVEMENTS);
      return saved ? JSON.parse(saved) : initialCashMovements;
    } catch {
      return initialCashMovements;
    }
  });

  const activeCashSession = cashSessions.find((s) => s.statut === 'OUVERTE') || null;

  // 7. Stock Movements State
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STOCK_MOVEMENTS);
      return saved ? JSON.parse(saved) : initialStockMovements;
    } catch {
      return initialStockMovements;
    }
  });

  const [stockReceptions, setStockReceptions] = useState<StockReception[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STOCK_RECEPTIONS);
      return saved ? JSON.parse(saved) : initialStockReceptions;
    } catch {
      return initialStockReceptions;
    }
  });

  const [stockCounts, setStockCounts] = useState<StockCount[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.STOCK_COUNTS);
      return saved ? JSON.parse(saved) : initialStockCounts;
    } catch {
      return initialStockCounts;
    }
  });

  // 8. Navigation and Modals
  // L'onglet ouvert au démarrage vient de l'URL : un permalien (/products,
  // /more/settings...) doit rouvrir exactement l'écran qu'il désigne.
  const initialRoute = typeof window !== 'undefined' ? matchPath(window.location.pathname) : null;
  const [activeTab, setActiveTab] = useState<NavigationTab>(initialRoute?.tab ?? 'home');
  const [activeMoreSubTab, setActiveMoreSubTab] = useState<MoreSubTab | null>(
    initialRoute?.subTab ?? null
  );
  const [customersDebtorsFilter, setCustomersDebtorsFilter] = useState(
    initialRoute?.debtorsOnly ?? false
  );
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(initialRoute?.modal === 'new-sale');
  const [isNewProductOpen, setIsNewProductOpen] = useState(initialRoute?.modal === 'new-product');

  // ── Envoi differe ───────────────────────────────────────────────────────
  // Tout ce qui n'a pas encore ete confirme par le serveur vit ici ET dans
  // IndexedDB : l'etat React sert a l'affichage, IndexedDB survit a la
  // fermeture de l'app (c'est ce qui rend le mode avion utilisable).
  const [pendingMutations, setPendingMutations] = useState<PendingMutation[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [pendingFailure, setPendingFailure] = useState<{ message: string; canRetry: boolean } | null>(
    null
  );
  const [lastSyncedCount, setLastSyncedCount] = useState<number | null>(null);
  // Une seule reprise a la fois : deux boucles concurrentes rejoueraient la
  // meme ecriture et, pour un produit (non dedoublonne en base), la creeraient
  // deux fois.
  const replayRunning = useRef(false);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ecriture refusee par le serveur : la reprise automatique s'arrete la, en
  // attendant un clic sur "Reessayer" (voir replayQueue).
  const blockedId = useRef<string | null>(null);
  const replayRef = useRef<((opts?: { silent?: boolean; force?: boolean }) => Promise<void>) | null>(
    null
  );
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);
  const [saleSuccessReceipt, setSaleSuccessReceipt] = useState<Sale | null>(null);
  const [receiptDeliveries, setReceiptDeliveries] = useState<ReceiptDelivery[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RECEIPT_DELIVERIES);
      return saved ? JSON.parse(saved) : defaultReceiptDeliveries;
    } catch {
      return defaultReceiptDeliveries;
    }
  });
  const [justRegistered, setJustRegistered] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'warning' | 'error' | 'info' } | null>(null);

  // Persistence effects
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.RECEIPT_DELIVERIES, JSON.stringify(receiptDeliveries));
  }, [receiptDeliveries]);

  // Detection reseau : au retour de la connexion, la file repart toute seule
  // (point 2, "la reprise se declenche sur l'evenement online").
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setSettings((prev) => ({ ...prev, isOfflineMode: false }));
      setUiState('READY');
      // Via la référence, jamais directement : cet écouteur n'est posé qu'une
      // fois, il capturerait sinon la toute première version de replayQueue,
      // avec la session pas encore chargée.
      void replayRef.current?.();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSettings((prev) => ({ ...prev, isOfflineMode: true }));
      setUiState('OFFLINE');
    };

    // Retour au premier plan : sur telephone, l'app est mise en veille par le
    // systeme et l'evenement `online` peut ne jamais arriver (reseau revenu
    // pendant que l'ecran etait eteint, bascule 4G/Wi-Fi...). On retente donc
    // aussi a chaque fois que le commercant revient sur l'app.
    const handleVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) return;
      if (authStatusRef.current !== 'authenticated') return;
      void replayRef.current?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);

    // État réel du réseau au démarrage, dans les deux sens : `isOfflineMode`
    // est persisté avec les réglages, et sans cette remise à plat une app
    // fermée hors ligne rouvrait avec le bandeau « Hors ligne » alors que la
    // connexion était revenue.
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    setSettings((prev) => ({ ...prev, isOfflineMode: offline }));
    setUiState(offline ? 'OFFLINE' : 'READY');

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
      if (replayTimer.current) clearTimeout(replayTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CASH_SESSIONS, JSON.stringify(cashSessions));
  }, [cashSessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CASH_MOVEMENTS, JSON.stringify(cashMovements));
  }, [cashMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STOCK_MOVEMENTS, JSON.stringify(stockMovements));
  }, [stockMovements]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STOCK_RECEPTIONS, JSON.stringify(stockReceptions));
  }, [stockReceptions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STOCK_COUNTS, JSON.stringify(stockCounts));
  }, [stockCounts]);

  const showToast = (text: string, type: 'success' | 'warning' | 'error' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const updateSettings = (newSettings: Partial<ShopSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  // Contrairement au reste de updateSettings (purement local, jamais persisté
  // côté serveur — limite pré-existante de ce prototype), le mode de caisse a
  // un vrai impact serveur (createOrder/createManualMovement en dépendent) :
  // il doit donc être écrit en base, pas seulement en mémoire locale.
  const updateCashRegisterMode = async (mode: 'LIBRE' | 'STRICT'): Promise<boolean> => {
    try {
      const business = await businessApi.updateBusinessSettings({ cashRegisterMode: mode });
      updateSettings({ cashRegisterMode: business.cashRegisterMode });
      showToast(
        business.cashRegisterMode === 'LIBRE'
          ? 'Caisse libre : plus besoin d’ouvrir/fermer, tu encaisses directement.'
          : 'Caisse stricte : ouverture/fermeture requises avant tout encaissement.',
        'success'
      );
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return false;
    }
  };

  /**
   * Porte d'entrée unique pour ouvrir "Nouvelle vente" (TopBar, BottomNav,
   * tableau de bord) — bloque et redirige vers l'Abonnement si le compte est
   * en lecture seule, au lieu de laisser la modale s'ouvrir sans effet réel.
   */
  const isWriteLocked = settings.planStatus === 'EXPIRED';

  const gateWrite = (action: () => void) => {
    if (isWriteLocked) {
      showToast("Abonnement expiré : réactive ton compte pour continuer à enregistrer des données.", 'warning');
      setActiveTab('more');
      setActiveMoreSubTab('subscription');
      return;
    }
    action();
  };

  const attemptNewSale = () => gateWrite(() => setIsNewSaleOpen(true));

  /**
   * Recharge produits/clients/commandes/caisse depuis le vrai backend et
   * remplace l'état local correspondant (étape 13). Appelée au bootstrap de
   * session puis après chaque action qui mute des données côté serveur — le
   * plus simple à raisonner correctement vu l'échelle d'une boutique, quitte à
   * multiplier les allers-retours réseau par rapport à une mise à jour locale
   * optimiste.
   */
  /**
   * Rechargement serveur et écritures en attente se marchent dessus : pendant
   * qu'un rechargement est en vol, le commerçant continue de vendre, et ses
   * commandes toutes fraîches n'existent pas encore côté serveur. Les appliquer
   * telles quelles les ferait disparaître de l'écran — le pire bug possible
   * pour une caisse.
   *
   * On relit donc la file au moment d'appliquer, et on remet en tête ce qui n'a
   * pas encore été confirmé.
   */
  const mergePending = <T extends { id: string }>(
    serverRows: T[],
    localRows: T[],
    pendingLocalIds: Set<string>
  ): T[] => {
    const serverIds = new Set(serverRows.map((r) => r.id));
    const stillLocal = localRows.filter((r) => pendingLocalIds.has(r.id) && !serverIds.has(r.id));
    return [...stillLocal, ...serverRows];
  };

  const loadRealData = async (userName: string) => {
    try {
      // Toutes ces requêtes sont indépendantes les unes des autres (seul le
      // calcul des soldes clients, vague 2 ci-dessous, dépend de la liste des
      // clients) : on les lance donc en une seule vague parallèle plutôt qu'en
      // 8+ appels séquentiels, ce qui divisait par un facteur important le
      // temps de rechargement déclenché après chaque action (créer un produit,
      // un client, valider une commande...). Les routes réservées
      // OWNER/ACCOUNTANT (403 FORBIDDEN_ROLE pour un SELLER, spec §0 règle 7)
      // gardent leur repli existant via `.catch()`.
      const [
        apiProducts,
        apiCustomers,
        apiOrders,
        currentRegister,
        apiMovements,
        productCategories,
        registersResult,
        categories,
        apiExpenses,
        apiReceptions,
        apiCounts,
        apiStockMovements,
      ] = await Promise.all([
        productsApi.listProducts(),
        customersApi.listCustomers(),
        ordersApi.listOrders(),
        cashApi.getCurrentRegister(),
        cashApi.listMovements(),
        productsApi.listProductCategories().catch(() => []),
        cashApi.listHistory().catch(() => null),
        expensesApi.listCategories('DEPENSE'),
        expensesApi.listExpenses().catch(() => []),
        stockApi.listReceptions().catch(() => []),
        stockApi.listCounts().catch(() => []),
        stockApi.listMovements(),
      ]);

      // Relue ICI, et non avant les appels réseau : le commerçant a pu vendre
      // pendant qu'ils étaient en vol (voir mergePending).
      const pendingLocalIds = new Set((await listPending()).map((m) => m.localId));

      const productCategoryName = (id: string | null) =>
        productCategories.find((c) => c.id === id)?.nom ?? NO_CATEGORY_LABEL;
      const serverProducts = apiProducts.map((p) =>
        productsApi.toFrontendProduct(p, productCategoryName(p.categoryId))
      );
      setProducts((prev) => mergePending(serverProducts, prev, pendingLocalIds));

      // Vague 2 : les soldes clients ont besoin de la liste des clients
      // (vague 1 ci-dessus) pour savoir quels ids interroger.
      const balances = await Promise.all(
        apiCustomers.map((c) => customersApi.fetchCustomerBalance(c.id).catch(() => 0))
      );
      const serverCustomers = apiCustomers.map((c, i) =>
        customersApi.toFrontendCustomer(c, balances[i])
      );
      setCustomers((prev) => mergePending(serverCustomers, prev, pendingLocalIds));

      const serverSales = apiOrders.map((o) => {
        const customer = apiCustomers.find((c) => c.id === o.customerId);
        return ordersApi.toFrontendSale(o, {
          customerName: customer?.nom,
          customerPhone: customer?.telephone ?? undefined,
          sellerName: userName,
        });
      });
      setSales((prev) => mergePending(serverSales, prev, pendingLocalIds));

      setCashMovements(apiMovements.map((m) => cashApi.toFrontendCashMovement(m, userName)));

      // /cash/history est réservé OWNER/ACCOUNTANT (FORBIDDEN_ROLE pour un
      // SELLER) — on retombe sur la seule caisse courante dans ce cas.
      const registers = registersResult ?? (currentRegister ? [currentRegister] : []);
      setCashSessions(registers.map((r) => cashApi.toFrontendCashSession(r, {})));

      // Catégories accessibles à tous les rôles (non sensibles en elles-mêmes) —
      // sert à afficher un nom de catégorie lisible sur chaque dépense.
      const categoryName = (id: string) => categories.find((c) => c.id === id)?.nom ?? 'Autre';
      const serverExpenses = apiExpenses.map((e) =>
        expensesApi.toFrontendExpense(e, categoryName(e.categoryId))
      );
      setExpenses((prev) => mergePending(serverExpenses, prev, pendingLocalIds));

      setStockReceptions(apiReceptions.map((r) => stockApi.toFrontendStockReception(r, userName)));
      setStockCounts(apiCounts.map((c) => stockApi.toFrontendStockCount(c, userName)));

      const productName = (id: string) => apiProducts.find((p) => p.id === id)?.nom;
      const frontendStockMovements = apiStockMovements.map((m) =>
        stockApi.toFrontendStockMovement(m, {
          productName: productName(m.productId),
          userName,
          orders: apiOrders,
          receptions: apiReceptions,
        })
      );
      setStockMovements(frontendStockMovements);

      // Chargement reussi = instantane a jour. C'est ce qui permet d'ouvrir
      // l'app en mode avion et d'y retrouver son catalogue, ses clients et
      // ses commandes recentes (point 2) au lieu d'une page vide.
      // L'instantané ne garde QUE la version serveur : ce qui est encore dans
      // la file d'attente y est déjà, avec tout ce qu'il faut pour être renvoyé.
      // L'y dupliquer ferait réapparaître une commande déjà partie.
      void saveSnapshot({
        products: serverProducts,
        customers: serverCustomers,
        sales: serverSales,
        expenses: serverExpenses,
        cashSessions: registers.map((r) => cashApi.toFrontendCashSession(r, {})),
        cashMovements: apiMovements.map((m) => cashApi.toFrontendCashMovement(m, userName)),
        stockMovements: frontendStockMovements,
        stockReceptions: apiReceptions.map((r) => stockApi.toFrontendStockReception(r, userName)),
        stockCounts: apiCounts.map((c) => stockApi.toFrontendStockCount(c, userName)),
        productCategories,
        session: null,
      });
    } catch (error) {
      // Hors ligne, l'echec est attendu : l'instantane local prend le relais,
      // aucun message d'erreur technique ne doit s'afficher (point 2).
      if (isNetworkFailure(error)) return;
      showToast(apiErrorMessage(error), 'error');
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // MOTEUR D'ENVOI DIFFERE
  //
  // Une seule mecanique sert les deux exigences : l'ecran repond en moins de
  // 100 ms (point 1) et l'app marche sans reseau (point 2). Dans les deux cas
  // l'interface agit d'abord, la requete part ensuite, et si elle ne passe pas
  // elle attend dans la file jusqu'a ce qu'elle passe.
  // ═════════════════════════════════════════════════════════════════════════

  const idMap = useRef<Record<string, string>>({});

  // Catalogue courant, lisible depuis la file d'envoi sans dependre de la
  // fermeture capturee au rendu : c'est la seule source complete d'un produit
  // qu'il faut recreer parce que le serveur ne le connait pas.
  const productsRef = useRef(products);
  productsRef.current = products;

  const remapId = (id: string): string => idMap.current[id] ?? id;

  const rememberId = async (localId: string, serverId: string) => {
    if (localId === serverId) return;
    idMap.current = { ...idMap.current, [localId]: serverId };
    await saveIdMap(idMap.current);
  };

  const refreshPending = async (): Promise<PendingMutation[]> => {
    const rows = await listPending();
    setPendingMutations(rows);
    return rows;
  };

  /**
   * Ecriture refusee par le serveur : l'element reste a l'ecran, entier, mais
   * signale comme non transmis. Rien n'est efface — le commercant doit pouvoir
   * relire ce qu'il a saisi et decider.
   */
  const markMutationFailed = (mutation: PendingMutation) => {
    const flag = <T extends { id: string; syncStatus?: string }>(rows: T[]): T[] =>
      rows.map((row) => (row.id === mutation.localId ? { ...row, syncStatus: 'SYNC_ERROR' } : row));

    switch (mutation.kind) {
      case 'ORDER_CREATE':
        setSales((prev) => flag(prev) as typeof prev);
        break;
      case 'PRODUCT_CREATE':
      case 'PRODUCT_UPDATE':
        setProducts((prev) => flag(prev) as typeof prev);
        break;
      case 'CUSTOMER_CREATE':
        setCustomers((prev) => flag(prev) as typeof prev);
        break;
      case 'EXPENSE_CREATE':
        setExpenses((prev) => flag(prev) as typeof prev);
        break;
    }
  };

  /**
   * Envoie UNE ecriture et reconcilie l'ecran avec la reponse du serveur
   * (vrai numero de commande, vrai identifiant produit...). Jette si le
   * serveur refuse ou si le reseau est coupe : l'appelant decide alors.
   */
  const sendMutation = async (m: PendingMutation): Promise<void> => {
    switch (m.kind) {
      case 'ORDER_CREATE': {
        const input: ordersApi.CreateOrderInput = {
          ...m.payload,
          customerId: remapId(m.payload.customerId),
          items: m.payload.items.map((it: { productId: string; qte: number }) => ({
            ...it,
            productId: remapId(it.productId),
          })),
        };
        const order = await ordersApi.createOrder(input);
        const sale = ordersApi.toFrontendSale(order, {
          customerName: m.meta?.customerName,
          customerPhone: m.meta?.customerPhone,
          sellerName: m.meta?.sellerName ?? 'Vendeur',
        });
        setSales((prev) => prev.map((s) => (s.clientUuid === m.id ? sale : s)));
        await rememberId(m.localId, order.id);
        break;
      }

      case 'PRODUCT_CREATE': {
        // La categorie se resout au moment de l'envoi : hors ligne, on ne peut
        // ni lister ni creer une categorie cote serveur.
        const categoryName: string | undefined = m.payload.categoryName;
        const categoryId = categoryName
          ? await productsApi.resolveProductCategoryId(categoryName)
          : undefined;
        const created = await productsApi.createProduct({
          ...m.payload.input,
          ...(categoryId ? { categoryId } : {}),
        });

        // Une photo qui ne part pas ne doit jamais faire perdre le produit
        // (point 5) : on enregistre le produit, on signale la photo.
        let refs: productsApi.ProductPhotoRef[] = [];
        const photos: string[] = m.payload.photos ?? [];
        if (photos.length > 0) {
          try {
            refs = await productsApi.syncProductPhotos(created.id, photos, []);
          } catch {
            showToast("Produit enregistré, mais la photo n'a pas pu être envoyée.", 'warning');
          }
        }

        setProducts((prev) =>
          prev.map((p) =>
            p.id === m.localId
              ? {
                  ...p,
                  id: created.id,
                  syncStatus: 'SYNCED',
                  ...(refs.length > 0
                    ? { photoRefs: refs, photos: refs.map((r) => r.url), photo: refs[0]?.url }
                    : {}),
                }
              : p
          )
        );
        await rememberId(m.localId, created.id);
        break;
      }

      case 'PRODUCT_UPDATE': {
        const localProductId: string = m.payload.id;
        const categoryName: string | undefined = m.payload.categoryName;
        const categoryId = categoryName
          ? await productsApi.resolveProductCategoryId(categoryName)
          : undefined;

        // La modification part AVANT les photos : il faut d'abord savoir si le
        // produit existe cote serveur. Sa creation hors ligne a pu ne jamais
        // passer (session expiree, refus...) ; le PATCH repondait alors
        // PRODUCT_NOT_FOUND en boucle et, comme une modification est rejouable,
        // il bloquait TOUTE la file derriere lui — y compris les creations des
        // autres produits saisis hors ligne. C'est ce qui figeait la reprise.
        let productId = remapId(localProductId);
        let updated: Awaited<ReturnType<typeof productsApi.updateProduct>>;
        try {
          updated = await productsApi.updateProduct(productId, {
            ...m.payload.input,
            ...(categoryId ? { categoryId } : {}),
          });
        } catch (error) {
          if (!isMissingResource(error)) throw error;

          const local = productsRef.current.find(
            (p) => p.id === productId || p.id === localProductId
          );
          if (!local) {
            // Ni sur le serveur, ni dans le catalogue local : il n'y a plus
            // rien a envoyer. On laisse cette ligne sortir de la file au lieu
            // de bloquer indefiniment tout ce qui attend derriere elle.
            return;
          }

          // Le serveur vient de confirmer que ce produit n'existe pas : le
          // creer a partir de la version locale ne peut pas faire de doublon,
          // et c'est la seule facon de ne pas perdre ce qui a ete saisi.
          updated = await productsApi.createProduct(
            productsApi.toCreateProductInput({ ...local, categoryId })
          );
          productId = updated.id;
          await rememberId(localProductId, updated.id);
        }

        let refs: productsApi.ProductPhotoRef[] | null = null;
        if (m.payload.photos !== undefined) {
          try {
            refs = await productsApi.syncProductPhotos(
              productId,
              m.payload.photos ?? [],
              m.payload.currentPhotoRefs ?? []
            );
          } catch {
            showToast("Les photos n'ont pas pu être mises à jour.", 'warning');
          }
        }

        setProducts((prev) =>
          prev.map((p) =>
            p.id === productId || p.id === m.payload.id
              ? {
                  ...p,
                  id: updated.id,
                  name: updated.nom,
                  salePrice: updated.prixVente,
                  purchasePrice: updated.prixAchat ?? p.purchasePrice,
                  stock: updated.stock,
                  alertThreshold: updated.seuilAlerte,
                  unit: updated.unite,
                  isService: updated.type === 'SERVICE',
                  syncStatus: 'SYNCED',
                  ...(refs
                    ? { photoRefs: refs, photos: refs.map((r) => r.url), photo: refs[0]?.url }
                    : {}),
                }
              : p
          )
        );
        break;
      }

      case 'CUSTOMER_CREATE': {
        const created = await customersApi.createCustomer(m.payload);
        setCustomers((prev) =>
          prev.map((c) =>
            c.id === m.localId ? { ...c, id: created.id, syncStatus: 'SYNCED' } : c
          )
        );
        await rememberId(m.localId, created.id);
        break;
      }

      case 'EXPENSE_CREATE': {
        const categoryId = await expensesApi.resolveExpenseCategoryId(m.payload.categoryName);
        const created = await expensesApi.createExpense({
          clientUuid: m.id,
          montant: m.payload.montant,
          categoryId,
          note: m.payload.note,
          methode: m.payload.methode,
          date: m.payload.date,
        });
        setExpenses((prev) =>
          prev.map((e) =>
            e.id === m.localId
              ? expensesApi.toFrontendExpense(created, m.payload.categoryName)
              : e
          )
        );
        await rememberId(m.localId, created.id);
        break;
      }
    }
  };

  /**
   * Rejoue la file, du plus ancien au plus recent (l'ordre compte : un produit
   * cree hors ligne doit exister avant la commande qui le vend). S'arrete a la
   * premiere panne reseau — inutile d'insister, rien ne passera.
   */
  const replayQueue = async (opts: { silent?: boolean; force?: boolean } = {}): Promise<void> => {
    if (replayRunning.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    // Une ecriture refusee par le serveur (stock insuffisant, caisse fermee...)
    // ne se debloquera pas toute seule : on cesse de la rejouer en boucle et on
    // attend que le commercant clique "Reessayer". Sinon elle bloquerait aussi
    // toutes les ecritures suivantes a chaque tentative.
    if (blockedId.current && !opts.force) return;

    const rows = await refreshPending();
    if (rows.length === 0) return;

    replayRunning.current = true;
    setIsSyncing(true);
    let sent = 0;

    try {
      for (const mutation of rows) {
        try {
          await sendMutation(mutation);
          await dequeue(mutation.id);
          sent += 1;
        } catch (error) {
          const updated = await markAttempt(mutation.id, apiErrorMessage(error));

          if (isNetworkFailure(error)) {
            // Reseau coupe : on garde tout, on retentera plus tard, avec un
            // delai croissant. Aucun message d'erreur technique a l'ecran.
            scheduleReplay(retryDelayMs(updated?.attempts ?? 1));
            break;
          }

          // Le serveur a repondu : ce n'est pas un probleme de reseau, insister
          // n'y changera rien. On marque l'element concerne comme en erreur
          // (il reste visible et complet a l'ecran, rien n'est perdu) et on
          // laisse la main au commercant.
          markMutationFailed(mutation);

          if (SERVER_DEDUPLICATED[mutation.kind] || wroteNothing(error)) {
            blockedId.current = mutation.id;
          } else {
            // Ni produit ni client ne portent de garde-fou anti-doublon en
            // base : la creation a peut-etre abouti cote serveur. La rejouer
            // risquerait un doublon, on sort donc la ligne de la file.
            await dequeue(mutation.id);
          }

          setPendingFailure({
            message: `${mutation.label} : ${apiErrorMessage(error)}`,
            canRetry: SERVER_DEDUPLICATED[mutation.kind] || wroteNothing(error),
          });
          break;
        }
      }
    } finally {
      replayRunning.current = false;
      setIsSyncing(false);
      const remaining = await refreshPending();
      if (sent > 0) {
        setPendingFailure(null);
        if (!opts.silent) {
          setLastSyncedCount(sent);
          setTimeout(() => setLastSyncedCount(null), 3000);
        }
      }
      if (remaining.length === 0 && sent > 0) {
        // Les totaux (caisse, dettes, stock) sont recalcules par le serveur :
        // on se realigne dessus une fois la file vide, jamais avant.
        await loadRealData(currentUser?.nom ?? settings.ownerName ?? 'Vendeur');
      }
    }
  };

  // Version courante de replayQueue, pour les écouteurs posés une seule fois.
  replayRef.current = replayQueue;

  const scheduleReplay = (delay: number) => {
    if (replayTimer.current) clearTimeout(replayTimer.current);
    replayTimer.current = setTimeout(() => {
      replayTimer.current = null;
      replayQueue();
    }, delay);
  };

  /**
   * Empile une ecriture puis tente de l'envoyer tout de suite. L'appelant a
   * DEJA mis l'ecran a jour : cette fonction ne renvoie rien et ne bloque rien.
   */
  const queueMutation = (mutation: Omit<PendingMutation, 'createdAt' | 'attempts'>) => {
    const full: PendingMutation = {
      ...mutation,
      createdAt: new Date().toISOString(),
      attempts: 0,
    };
    setPendingMutations((prev) => [...prev, full]);
    // Volontairement sans await : le clic est deja repercute a l'ecran.
    void enqueue(full).then(() => replayQueue({ silent: true }));
  };

  const dismissPendingFailure = () => setPendingFailure(null);

  const isSalePending = (saleId: string): boolean =>
    pendingMutations.some((m) => m.kind === 'ORDER_CREATE' && m.localId === saleId);

  /**
   * Traduit le statut réel du backend (statut/trialEndsAt/subscriptionEndsAt,
   * calculés côté serveur dans locked/trialDaysLeft — voir GET /auth/me) vers
   * l'enum local ShopSettings.planStatus consommé par le reste de l'app
   * (bannières, paywall du tableau de bord, écran Abonnement).
   */
  const computePlanStatus = (business: authApi.ApiBusiness): { planStatus: ShopSettings['planStatus']; trialDaysLeft: number; quotaMaxProducts: number } => {
    if (business.locked) {
      return { planStatus: 'EXPIRED', trialDaysLeft: 0, quotaMaxProducts: PLANS.SOLO.maxProduits };
    }
    if (business.statut === 'ESSAI') {
      return { planStatus: 'TRIAL', trialDaysLeft: business.trialDaysLeft ?? 0, quotaMaxProducts: PLANS.SOLO.maxProduits };
    }
    if (business.planCode === 'BUSINESS') {
      return { planStatus: 'BUSINESS', trialDaysLeft: 0, quotaMaxProducts: PLANS.BUSINESS.maxProduits };
    }
    return { planStatus: 'SOLO', trialDaysLeft: 0, quotaMaxProducts: PLANS.SOLO.maxProduits };
  };

  const bootstrapSession = async (session: authApi.MeResponse) => {
    setCurrentUser(session.user);
    setCurrentBusiness(session.business);
    const { planStatus, trialDaysLeft, quotaMaxProducts } = computePlanStatus(session.business);
    updateSettings({
      role: session.user.role,
      ownerName: session.user.nom,
      ownerPhone: session.user.telephone,
      shopName: session.business.nom,
      shopCode: session.business.id.slice(0, 5).toUpperCase(),
      city: session.business.ville || '',
      planStatus,
      trialDaysLeft,
      quotaMaxProducts,
      cashRegisterMode: session.business.cashRegisterMode ?? 'LIBRE',
    });
    setAuthStatus('authenticated');
    markSessionStarted(session.user.telephone);
    await loadRealData(session.user.nom);

    // Reprise de la file au demarrage. Sans ca, ce qui avait ete saisi hors
    // ligne ne repartait QUE si la connexion revenait pendant que l'app etait
    // ouverte (evenement `online`) : un commercant qui saisit ses produits en
    // mode avion, ferme l'app, puis la rouvre une fois le reseau revenu ne
    // declenchait aucun envoi — la file restait pleine indefiniment.
    // Volontairement ici, et pas au montage : tant que la session n'est pas
    // confirmee, le serveur repondrait AUTH_SESSION_EXPIRED, ce que la file
    // interprete comme un refus (voir replayQueue).
    void replayRef.current?.();
  };

  useEffect(() => {
    // 1. On repeuple l'ecran depuis l'instantane local AVANT tout appel reseau.
    //    Hors ligne c'est la seule source ; en ligne, ca evite l'ecran vide le
    //    temps que le serveur reponde (Neon peut demarrer a froid).
    void loadIdMap().then((map) => {
      idMap.current = map;
    });
    // La file est relue AVANT l'instantane, et l'instantane est fusionne avec
    // elle : l'instantane ne contient que la version serveur, donc l'appliquer
    // tel quel effacait de l'ecran tout ce qui avait ete saisi hors ligne lors
    // d'une session precedente (un produit cree en mode avion disparaissait au
    // redemarrage de l'app, alors que son envoi attendait toujours en file).
    void (async () => {
      const pendingRows = await refreshPending();
      const pendingLocalIds = new Set(pendingRows.map((m) => m.localId));
      const snapshot = await loadSnapshot();
      if (!snapshot) return;
      if (snapshot.products?.length)
        setProducts((prev) => mergePending(snapshot.products, prev, pendingLocalIds));
      if (snapshot.customers?.length)
        setCustomers((prev) => mergePending(snapshot.customers, prev, pendingLocalIds));
      if (snapshot.sales?.length)
        setSales((prev) => mergePending(snapshot.sales, prev, pendingLocalIds));
      if (snapshot.expenses?.length)
        setExpenses((prev) => mergePending(snapshot.expenses, prev, pendingLocalIds));
      if (snapshot.cashSessions?.length) setCashSessions(snapshot.cashSessions);
      if (snapshot.cashMovements?.length) setCashMovements(snapshot.cashMovements);
      if (snapshot.stockMovements?.length) setStockMovements(snapshot.stockMovements);
      if (snapshot.stockReceptions?.length) setStockReceptions(snapshot.stockReceptions);
      if (snapshot.stockCounts?.length) setStockCounts(snapshot.stockCounts);
    })();

    // 2. Session reelle. Hors ligne, /auth/me echoue : on ne renvoie surtout
    //    pas le commercant sur l'ecran de connexion (il n'a aucun moyen de s'y
    //    connecter sans reseau) — on le laisse travailler sur ses donnees
    //    locales, la session sera reverifiee au retour du reseau.
    authApi
      .fetchCurrentSession()
      .then((session) => {
        if (session) {
          bootstrapSession(session);
          return;
        }
        markSessionEnded();
        setAuthStatus('anonymous');
      })
      .catch((error) => {
        if (isNetworkFailure(error) && hasSessionHint()) {
          setAuthStatus('authenticated');
          setUiState('OFFLINE');
          return;
        }
        markSessionEnded();
        setAuthStatus('anonymous');
      });

    // 3. Reveil de la base : Neon met une base inactive en veille, et le
    //    premier appel apres la sieste paie plusieurs secondes de demarrage.
    //    Le faire ici, pendant que le commercant regarde son accueil, evite
    //    que ce soit sa premiere commande qui le paie.
    void fetch('/api/v1/categories?type=PRODUIT', { credentials: 'include' }).catch(() => {
      // Simple reveil : son echec n'a aucune consequence.
    });

    // Exécuté une seule fois au montage — vérifie la session cookie existante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const registerBusinessAccount = async (input: authApi.RegisterInput) => {
    try {
      const result = await authApi.registerBusiness(input);
      await bootstrapSession({ user: result.user, business: result.business });
      setJustRegistered(true);
      showToast('Boutique créée avec succès ! Bienvenue sur MoroCash.', 'success');
      return { success: true };
    } catch (error) {
      return { success: false, message: apiErrorMessage(error) };
    }
  };

  const dismissWelcomeChoice = () => setJustRegistered(false);

  const loginUser = async (input: authApi.LoginInput) => {
    try {
      const result = await authApi.login(input);
      if (result.requiresBusinessSelection) {
        return { success: false, requiresBusinessSelection: true, businesses: result.businesses };
      }
      const session = await authApi.fetchCurrentSession();
      if (!session) {
        return { success: false, message: 'Connexion impossible, réessaie.' };
      }
      await bootstrapSession(session);
      showToast('Connexion réussie !', 'success');
      return { success: true };
    } catch (error) {
      return { success: false, message: apiErrorMessage(error) };
    }
  };

  const logoutUser = async () => {
    try {
      await authApi.logout();
    } catch {
      // On déconnecte localement même si l'appel serveur échoue (session déjà expirée, réseau...).
    }
    markSessionEnded();
    setCurrentUser(null);
    setCurrentBusiness(null);
    setAuthStatus('anonymous');
  };

  const closeAccount = async () => {
    try {
      await authApi.closeAccount();
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return false;
    }
    markSessionEnded();
    setCurrentUser(null);
    setCurrentBusiness(null);
    setAuthStatus('anonymous');
    showToast('Boutique fermée. Reconnecte-toi dans les 90 jours pour la récupérer.', 'info');
    return true;
  };

  // Cart operations
  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1, unitPrice: product.salePrice }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const setCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const cartItemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  // Business Action: Complete Sale — écrit réellement la commande côté backend
  // (étape 13) ; le serveur recalcule tout (total, remise, statut de paiement,
  // stock, CashMovement) — cette fonction ne fait plus de calcul métier local.
  const completeSale = async (params: {
    paidAmount: number;
    paymentMethod: PaymentMethod;
    discount?: number;
    discountMode?: 'PERCENTAGE' | 'AMOUNT';
    discountValue?: number;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  }): Promise<Sale | null> => {
    if (cart.length === 0) {
      showToast('Le panier est vide', 'warning');
      return null;
    }
    if (!params.customerId) {
      showToast('Sélectionne un client pour cette vente !', 'error');
      return null;
    }

    // ── Reponse optimiste (point 1) ───────────────────────────────────────
    // Le clic vaut validation : la commande entre dans l'historique, le stock
    // baisse a l'ecran, le panier se vide et le recu s'affiche. Tout de suite,
    // sans attendre le serveur — meme en mode avion. Le clientUuid garantit
    // qu'un renvoi ne creera jamais de doublon cote serveur.
    haptic();

    const clientUuid = generateClientUuid();
    const sellerName = currentUser?.nom ?? settings.ownerName ?? 'Vendeur';
    const sale = buildOptimisticSale({
      clientUuid,
      cart,
      paidAmount: params.paidAmount,
      paymentMethod: params.paymentMethod,
      discountMode: params.discountMode,
      discountValue: params.discountValue,
      customerId: params.customerId,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      notes: params.notes,
      sellerName,
    });

    setSales((prev) => [sale, ...prev]);
    setProducts((prev) => applySaleToStock(prev, sale));
    clearCart();
    setIsNewSaleOpen(false);
    setSelectedSaleForReceipt(sale);
    setSaleSuccessReceipt(sale);

    try {
      confetti({ particleCount: 40, spread: 60, origin: { y: 0.8 } });
    } catch {
      // Ignored if confetti fails
    }

    queueMutation({
      id: clientUuid,
      kind: 'ORDER_CREATE',
      localId: sale.id,
      label: 'Commande',
      payload: ordersApi.toCreateOrderInput({
        clientUuid,
        customerId: params.customerId,
        items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        remiseMode: params.discountMode,
        remiseValeur: params.discountValue,
        montantRecu: Math.max(0, Math.round(params.paidAmount)),
        methode: params.paymentMethod,
      }),
      meta: {
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        sellerName,
      },
    });

    return sale;
  };

  const recordReceiptDelivery = (orderId: string, canal: ReceiptDeliveryChannel, orderReference?: string) => {
    const sale = sales.find((s) => s.id === orderId || s.reference === orderId);
    const ref = orderReference || (sale ? sale.reference : orderId);
    const currentUserName = settings.role === 'SELLER'
      ? (settings.currentSellerName || 'Awa Traoré')
      : (settings.ownerName || 'Mamadou Koné');
    const currentUserId = settings.role === 'SELLER' ? 'emp-1' : 'owner';

    const delivery: ReceiptDelivery = {
      id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      businessId: settings.shopCode || 'A7K2X',
      orderId: sale ? sale.id : orderId,
      orderReference: ref,
      canal,
      userId: currentUserId,
      userName: currentUserName,
      createdAt: new Date().toISOString(),
    };

    setReceiptDeliveries((prev) => [delivery, ...prev]);
  };

  // Products CRUD — écrit réellement sur le backend (étape 13). La gestion des
  // codes-barres/QR (productCodes, internalCode) reste hors-périmètre de ce
  // passage ("parcours complet d'abord") : le produit créé côté serveur a bien
  // un QR généré automatiquement (spec §3), mais ce prototype ne l'affiche pas
  // encore — productCodes reste vide côté frontend pour l'instant.
  const addProduct = async (
    productData: Omit<Product, 'id' | 'salesCount' | 'createdAt'>
  ): Promise<Product | null> => {
    // Meme principe que la commande : le produit apparait dans le catalogue au
    // clic, la requete part derriere. Un produit cree sans reseau est vendable
    // immediatement — la file remplacera son id local par l'id serveur, y
    // compris dans les commandes en attente qui le referencent.
    haptic();

    const localId = generateClientUuid();
    const categoryName = productData.category?.trim() || undefined;
    const photos = productData.photos ?? (productData.photo ? [productData.photo] : []);
    const product = buildOptimisticProduct(localId, {
      ...productData,
      category: categoryName || 'Sans catégorie',
      photos,
      photo: photos[0],
    });

    setProducts((prev) => [product, ...prev]);
    showToast(`${product.name} ajouté au catalogue`, 'success');

    queueMutation({
      id: localId,
      kind: 'PRODUCT_CREATE',
      localId,
      label: `Produit ${product.name}`,
      payload: {
        input: productsApi.toCreateProductInput({ ...productData }),
        categoryName,
        photos,
      },
    });

    return product;
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    const current = products.find((p) => p.id === id);
    const categoryName = updates.category?.trim() || undefined;

    // L'ecran affiche la modification tout de suite ; le PATCH suit.
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, syncStatus: 'PENDING_SYNC' } : p))
    );

    queueMutation({
      id: generateClientUuid(),
      kind: 'PRODUCT_UPDATE',
      localId: id,
      label: `Produit ${updates.name ?? current?.name ?? ''}`.trim(),
      payload: {
        id,
        categoryName,
        photos: updates.photos,
        currentPhotoRefs: current?.photoRefs ?? [],
        input: {
          ...(updates.name !== undefined ? { nom: updates.name } : {}),
          ...(updates.salePrice !== undefined ? { prixVente: updates.salePrice } : {}),
          ...(updates.purchasePrice !== undefined ? { prixAchat: updates.purchasePrice } : {}),
          ...(updates.stock !== undefined ? { stock: updates.stock } : {}),
          ...(updates.alertThreshold !== undefined ? { seuilAlerte: updates.alertThreshold } : {}),
          ...(updates.unit !== undefined ? { unite: updates.unit } : {}),
          ...(updates.isService !== undefined
            ? { type: updates.isService ? 'SERVICE' : 'PRODUIT' }
            : {}),
        },
      },
    });
  };

  const deleteProduct = async (id: string) => {
    try {
      const result = await productsApi.deleteOrDeactivateProduct(id);
      if (result === 'DELETED') {
        // Suppression réelle : le produit ne peut plus apparaître nulle part,
        // on le retire directement plutôt que de recharger tout loadRealData().
        setProducts((prev) => prev.filter((p) => p.id !== id));
        showToast('Produit supprimé', 'info');
      } else {
        // Désactivation (le produit a un historique de ventes) : GET /products
        // ne filtre pas les produits désactivés et le frontend ne modélise pas
        // ce champ `actif` — on recharge donc pour rester fidèle à ce que le
        // serveur renvoie réellement, plutôt que de deviner un état local.
        showToast('Produit désactivé (il a un historique de ventes)', 'info');
        await loadRealData(currentUser?.nom ?? 'Vendeur');
      }
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  // --- Scannable Product Codes Management ---
  const findProductByCode = (rawCode: string): Product | undefined => {
    if (!rawCode) return undefined;
    const clean = rawCode.trim().toLowerCase();
    return products.find((p) => {
      if (p.internalCode && p.internalCode.toLowerCase() === clean) return true;
      if (p.barcode && p.barcode.toLowerCase() === clean) return true;
      if (p.productCodes && p.productCodes.some((c) => c.code.toLowerCase() === clean)) return true;
      // Filet de securite pour les etiquettes deja collees : tant que le
      // catalogue ne recevait pas les codes du serveur, le generateur
      // d'etiquettes se rabattait sur l'identifiant du produit (voir
      // labelPdfGenerator, `p.internalCode || p.barcode || p.id`). Ces QR-la
      // sont dans la boutique et doivent continuer a scanner.
      if (p.id.toLowerCase() === clean) return true;
      return false;
    });
  };

  const addProductCode = (
    productId: string,
    code: string,
    format: BarcodeFormat,
    origin: CodeOrigin,
    isPrimary = false
  ): { success: boolean; conflictProduct?: Product; message?: string } => {
    const cleanCode = code.trim();
    if (!cleanCode) {
      return { success: false, message: 'Le code ne peut pas être vide.' };
    }

    // Uniqueness rule: A code can only be associated with ONE product in this boutique
    const conflictProduct = products.find(
      (p) =>
        p.id !== productId &&
        (p.internalCode?.toLowerCase() === cleanCode.toLowerCase() ||
          p.barcode?.toLowerCase() === cleanCode.toLowerCase() ||
          p.productCodes?.some((c) => c.code.toLowerCase() === cleanCode.toLowerCase()))
    );

    if (conflictProduct) {
      return { success: false, conflictProduct };
    }

    const newCodeObj: ProductCode = {
      id: `code-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      business_id: settings.shopCode || 'A7K2X',
      product_id: productId,
      code: cleanCode,
      format,
      origine: origin,
      est_principal: isPrimary,
      created_at: new Date().toISOString(),
      created_by: settings.ownerName || 'Commerçant',
    };

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const currentCodes = p.productCodes ? [...p.productCodes] : [];
        if (isPrimary) {
          currentCodes.forEach((c) => {
            c.est_principal = false;
          });
        }
        return {
          ...p,
          barcode: isPrimary ? cleanCode : (p.barcode || cleanCode),
          productCodes: [...currentCodes, newCodeObj],
        };
      })
    );

    showToast(`Code ${cleanCode} associé avec succès`, 'success');
    return { success: true };
  };

  const transferProductCode = (fromProductId: string, toProductId: string, codeToTransfer: string) => {
    const clean = codeToTransfer.trim();
    let transferredFormat: BarcodeFormat = 'EAN13';
    let transferredOrigin: CodeOrigin = 'MANUEL';

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === fromProductId) {
          const match = p.productCodes?.find((c) => c.code.toLowerCase() === clean.toLowerCase());
          if (match) {
            transferredFormat = match.format;
            transferredOrigin = match.origine;
          }
          const remaining = (p.productCodes || []).filter(
            (c) => c.code.toLowerCase() !== clean.toLowerCase()
          );
          if (!remaining.some((c) => c.est_principal) && remaining.length > 0) {
            remaining[0].est_principal = true;
          }
          return {
            ...p,
            barcode: p.barcode?.toLowerCase() === clean.toLowerCase() ? undefined : p.barcode,
            productCodes: remaining,
          };
        }
        return p;
      })
    );

    // Add code to toProductId
    addProductCode(toProductId, clean, transferredFormat, transferredOrigin, false);
  };

  const removeProductCode = (productId: string, codeId: string): { success: boolean; message?: string } => {
    const targetProduct = products.find((p) => p.id === productId);
    if (!targetProduct) return { success: false, message: 'Produit introuvable.' };

    const targetCode = targetProduct.productCodes?.find((c) => c.id === codeId);
    if (!targetCode) return { success: false, message: 'Code introuvable.' };

    // House code rule: never deleted!
    if (targetCode.origine === 'GENERE') {
      showToast('Le code maison ne peut pas être supprimé', 'warning');
      return {
        success: false,
        message: 'Le code maison généré automatiquement par MoroCash ne peut pas être supprimé.',
      };
    }

    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        const remaining = (p.productCodes || []).filter((c) => c.id !== codeId);
        if (targetCode.est_principal && remaining.length > 0) {
          remaining[0].est_principal = true;
        }
        return {
          ...p,
          barcode: p.barcode === targetCode.code ? remaining.find((c) => c.est_principal)?.code : p.barcode,
          productCodes: remaining,
        };
      })
    );

    showToast('Code retiré du produit', 'info');
    return { success: true };
  };

  const setPrimaryProductCode = (productId: string, codeId: string) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== productId) return p;
        let primaryCodeStr: string | undefined = p.barcode;
        const updatedCodes = (p.productCodes || []).map((c) => {
          if (c.id === codeId) {
            primaryCodeStr = c.code;
            return { ...c, est_principal: true };
          }
          return { ...c, est_principal: false };
        });
        return {
          ...p,
          barcode: primaryCodeStr,
          productCodes: updatedCodes,
        };
      })
    );
    showToast('Code principal défini', 'success');
  };

  // Customers & Debt — écrit réellement sur le backend (étape 13).
  const addCustomer = async (
    customerData: Omit<Customer, 'id' | 'debtAgeDays' | 'lastActivity'>
  ): Promise<Customer | null> => {
    // Nouveau client, dette forcement nulle : rien a attendre du serveur pour
    // l'afficher, ni pour lui attribuer une commande dans la foulee.
    const localId = generateClientUuid();
    const customer: Customer = {
      ...customerData,
      id: localId,
      totalDebt: 0,
      debtAgeDays: 0,
      lastActivity: new Date().toISOString(),
      syncStatus: 'PENDING_SYNC',
    };

    setCustomers((prev) => [customer, ...prev]);
    showToast(`Client ${customerData.name} ajouté`, 'success');

    queueMutation({
      id: localId,
      kind: 'CUSTOMER_CREATE',
      localId,
      label: `Client ${customerData.name}`,
      payload: {
        nom: customerData.name,
        telephone: customerData.phone || undefined,
        note: customerData.notes || undefined,
      },
    });

    return customer;
  };

  const recordDebtPayment = async (customerId: string, amount: number, paymentMethod: PaymentMethod) => {
    const targetCustomer = customers.find((c) => c.id === customerId);
    try {
      await customersApi.repayDebt(customerId, amount, paymentMethod);
      showToast(`Remboursement de ${amount} F noté${targetCustomer ? ` pour ${targetCustomer.name}` : ''}`, 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  // Business Action: Cancel Sale — le backend recrée les mouvements de retour,
  // ajuste le stock, la dette client et la caisse dans sa propre transaction
  // (étape 13, spec §7.2) ; réservé OWNER/ACCOUNTANT côté serveur.
  const cancelSale = async (saleId: string, reason?: string) => {
    const targetSale = sales.find((s) => s.id === saleId);
    if (targetSale?.isCancelled) {
      showToast('Cette commande est déjà annulée', 'warning');
      return;
    }
    try {
      await ordersApi.cancelOrder(saleId, reason?.trim() || 'Annulation par le commerçant');
      showToast(`Commande ${targetSale?.reference ?? ''} annulée`.trim(), 'info');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  // Business Action: Assign Customer to Sale
  const assignCustomerToSale = (saleId: string, customerId: string, customerName: string, customerPhone?: string) => {
    setSales((prev) =>
      prev.map((s) =>
        s.id === saleId
          ? {
              ...s,
              customerId,
              customerName,
              customerPhone: customerPhone || s.customerPhone,
            }
          : s
      )
    );
    showToast(`Client ${customerName} attribué à la commande`, 'success');
  };

  // Expenses CRUD
  // Dépenses — écrit réellement sur le backend (étape 13). Le backend exige un
  // categoryId réel (résolu depuis le nom via resolveExpenseCategoryId) et une
  // caisse ouverte (chaque dépense règle un CashMovement, spec §7.4).
  const addExpense = async (expenseData: Omit<Expense, 'id' | 'syncStatus'>): Promise<Expense | null> => {
    haptic();

    const localId = generateClientUuid();
    const expense: Expense = { ...expenseData, id: localId, syncStatus: 'PENDING_SYNC' };

    setExpenses((prev) => [expense, ...prev]);
    showToast(`Frais de ${expenseData.amount} F enregistrés`, 'success');

    queueMutation({
      id: localId,
      kind: 'EXPENSE_CREATE',
      localId,
      label: `Dépense de ${expenseData.amount} F`,
      payload: {
        montant: expenseData.amount,
        categoryName: expenseData.category,
        note: expenseData.note,
        methode: expensesApi.toApiExpenseMethode(expenseData.paymentMethod ?? 'CASH'),
        date: expenseData.date,
      },
    });

    return expense;
  };

  // Pas de suppression de dépense côté backend (spec §0 règle 4 : rien n'est
  // jamais supprimé) — aucune route DELETE /expenses n'existe. Le bouton
  // correspondant a été retiré de l'UI (voir MoreTab.tsx).

  // Employees CRUD — POST /users et PATCH /users/:id réservés OWNER côté
  // backend (403 FORBIDDEN_ROLE sinon) ; GET /users est ouvert à tout rôle.
  const fetchEmployees = async () => {
    try {
      const apiEmployees = await usersApi.listEmployees();
      setEmployees(apiEmployees);
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  const addEmployee = async (input: {
    nom: string;
    telephone: string;
    pin: string;
    role: 'SELLER' | 'ACCOUNTANT';
  }): Promise<boolean> => {
    try {
      await usersApi.createEmployee(input);
      showToast(`${input.nom} a été ajouté à l'équipe`, 'success');
      await fetchEmployees();
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return false;
    }
  };

  const setEmployeeActive = async (id: string, actif: boolean): Promise<boolean> => {
    try {
      await usersApi.setEmployeeActive(id, actif);
      showToast(actif ? 'Employé réactivé' : 'Employé désactivé', 'info');
      await fetchEmployees();
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return false;
    }
  };

  const fetchMySessions = async () => {
    try {
      const sessions = await authApi.listMySessions();
      setMySessions(sessions);
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  const revokeMySession = async (sessionId: string): Promise<boolean> => {
    try {
      await authApi.revokeSession(sessionId);
      showToast('Appareil déconnecté', 'info');
      await fetchMySessions();
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return false;
    }
  };

  const revokeOtherMySessions = async (): Promise<boolean> => {
    try {
      const revoked = await authApi.revokeOtherSessions();
      showToast(
        revoked > 0 ? `${revoked} appareil${revoked > 1 ? 's' : ''} déconnecté${revoked > 1 ? 's' : ''}` : 'Aucun autre appareil connecté',
        'success'
      );
      await fetchMySessions();
      return true;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return false;
    }
  };

  // Cash Register Actions (BLOC 7) — écrit réellement sur le backend (étape 13).
  const openCashRegister = async (fondDepart: number) => {
    try {
      await cashApi.openRegister(fondDepart);
      showToast(`Caisse ouverte avec un fond de départ de ${fondDepart} F`, 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  const closeCashRegister = async (montantCompte: number, commentaire?: string) => {
    try {
      const register = await cashApi.closeRegister(montantCompte, commentaire);
      if (typeof register.ecart === 'number') {
        showToast(
          register.ecart === 0
            ? 'Caisse fermée : compte juste !'
            : `Caisse fermée avec un écart de ${register.ecart > 0 ? '+' : ''}${register.ecart} F`,
          register.ecart === 0 ? 'success' : 'warning'
        );
      } else {
        showToast('Caisse fermée', 'success');
      }
      await loadRealData(currentUser?.nom ?? 'Vendeur');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  const addCashMovement = async (params: {
    type: 'ENTREE' | 'SORTIE';
    origine: 'COMMANDE' | 'REMBOURSEMENT' | 'DEPENSE' | 'APPORT' | 'RETRAIT';
    montant: number;
    methode: PaymentMethod;
    motif?: string;
    referenceId?: string;
  }) => {
    // Le backend ne permet un mouvement manuel que pour APPORT/RETRAIT — les
    // autres origines (COMMANDE, REMBOURSEMENT, DEPENSE) sont toujours créées
    // automatiquement par le module correspondant (spec §7.4), jamais via cet appel.
    if (params.origine !== 'APPORT' && params.origine !== 'RETRAIT') {
      showToast('Ce type de mouvement est enregistré automatiquement, pas manuellement.', 'warning');
      return;
    }
    try {
      await cashApi.createManualMovement({
        type: params.origine,
        montant: params.montant,
        motif: params.motif?.trim() || (params.origine === 'APPORT' ? 'Apport en caisse' : 'Retrait de caisse'),
        methode: params.methode,
      });
      showToast(
        params.type === 'ENTREE'
          ? `Entrée de ${params.montant} F ajoutée en caisse`
          : `Sortie de ${params.montant} F effectuée`,
        'info'
      );
      await loadRealData(currentUser?.nom ?? 'Vendeur');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  // --- Stock Movements & Inventory Actions --- écrivent réellement sur le
  // backend (étape 13). Pas d'auto-dépense sur réception côté backend (le
  // champ Expense.receptionId existe dans le schéma mais aucune route ne le
  // relie automatiquement) — contrairement à l'ancien mock, expense est null.
  const recordStockReception = async (params: {
    fournisseur?: string;
    note?: string;
    justificatif_url?: string;
    lines: StockReceptionLine[];
  }): Promise<{ reception: StockReception; expense: Expense | null } | null> => {
    try {
      const created = await stockApi.createReception({
        fournisseur: params.fournisseur,
        note: params.note,
        lines: params.lines,
      });
      const totalArticles = params.lines.reduce((sum, l) => sum + l.quantity, 0);
      const reception = stockApi.toFrontendStockReception(created, currentUser?.nom ?? 'Vendeur');
      showToast(`Réception enregistrée : +${totalArticles} articles (${created.totalMontant} F CFA)`, 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return { reception, expense: null };
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
  };

  const recordStockBreakage = async (params: {
    productId: string;
    quantity: number;
    motif: string;
    note?: string;
    photo?: string;
  }): Promise<StockMovement | null> => {
    const cleanMotif = (params.motif || '').trim();
    if (!cleanMotif) {
      showToast('Le motif est obligatoire', 'warning');
      return null;
    }
    const prod = products.find((p) => p.id === params.productId);
    try {
      const created = await stockApi.createAdjustment({
        productId: params.productId,
        type: 'CASSE',
        quantite: params.quantity,
        motif: cleanMotif + (params.note ? ` : ${params.note.trim()}` : ''),
      });
      const movement = stockApi.toFrontendStockMovement(created, {
        productName: prod?.name,
        userName: currentUser?.nom ?? 'Vendeur',
      });
      showToast(`Casse enregistrée : −${params.quantity} ${prod?.unit || 'unités'} (${prod?.name ?? ''})`, 'info');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return movement;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
  };

  const recordStockLoss = async (params: {
    productId: string;
    quantity: number;
    motif: string;
    note?: string;
    photo?: string;
  }): Promise<StockMovement | null> => {
    const cleanMotif = (params.motif || '').trim();
    if (!cleanMotif) {
      showToast('Le motif est obligatoire', 'warning');
      return null;
    }
    const prod = products.find((p) => p.id === params.productId);
    try {
      const created = await stockApi.createAdjustment({
        productId: params.productId,
        type: 'PERTE',
        quantite: params.quantity,
        motif: cleanMotif + (params.note ? ` : ${params.note.trim()}` : ''),
      });
      const movement = stockApi.toFrontendStockMovement(created, {
        productName: prod?.name,
        userName: currentUser?.nom ?? 'Vendeur',
      });
      showToast(`Perte enregistrée : −${params.quantity} ${prod?.unit || 'unités'} (${prod?.name ?? ''})`, 'info');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return movement;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
  };

  const recordStockCount = async (params: {
    perimetre: string;
    items: { productId: string; countedQty: number }[];
    commentaire?: string;
  }): Promise<StockCount | null> => {
    try {
      const created = await stockApi.createStockCount({
        perimetre: params.perimetre,
        commentaire: params.commentaire,
        lines: params.items,
      });
      const stockCount = stockApi.toFrontendStockCount(created, currentUser?.nom ?? 'Vendeur');
      showToast(
        `Comptage validé : ${params.items.length} produits vérifiés, ${created.nbEcarts} écart(s)`,
        'success'
      );
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return stockCount;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
  };

  // Note : le backend n'enregistre pas de motif personnalisé pour l'annulation
  // d'un mouvement (POST /stock/movements/:id/cancel n'a pas de corps) — il en
  // génère un lui-même. Le motif saisi ici sert seulement à la validation
  // locale, il n'est pas persisté côté serveur (limite du backend, pas du frontend).
  const cancelStockMovement = async (
    movementId: string,
    reason: string
  ): Promise<{ success: boolean; message?: string }> => {
    const targetMov = stockMovements.find((m) => m.id === movementId);
    if (!targetMov) {
      return { success: false, message: 'Mouvement introuvable' };
    }
    if (targetMov.annule) {
      return { success: false, message: 'Ce mouvement a déjà été annulé' };
    }
    if (targetMov.order_id || targetMov.type === 'SORTIE' || targetMov.type === 'RETOUR') {
      return {
        success: false,
        message:
          'Pour annuler ce mouvement de vente ou retour, annulez la commande correspondante dans Mes commandes.',
      };
    }
    if (!reason.trim()) {
      return { success: false, message: 'Le motif d’annulation est obligatoire.' };
    }

    try {
      await stockApi.cancelMovement(movementId);
      showToast('Mouvement annulé avec succès', 'info');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return { success: true };
    } catch (error) {
      return { success: false, message: apiErrorMessage(error) };
    }
  };

  /**
   * "Reessayer" : relance la file, y compris l'ecriture bloquee par un refus
   * du serveur. C'est le seul chemin qui debloque cette derniere.
   */
  const syncPendingOperations = async () => {
    if (pendingMutations.length === 0) {
      showToast('Tout est à jour.', 'info');
      return;
    }
    blockedId.current = null;
    setPendingFailure(null);
    await replayQueue({ force: true });
  };

  const toggleOfflineMode = () => {
    const nextMode = !settings.isOfflineMode;
    updateSettings({ isOfflineMode: nextMode });
    setUiState(nextMode ? 'OFFLINE' : 'READY');
    if (!nextMode) {
      void syncPendingOperations();
    }
  };

  const resetToDefaultData = () => {
    localStorage.clear();
    setSettings(initialSettings);
    setProducts(initialProducts);
    setCustomers(initialCustomers);
    setSales(initialSales);
    setExpenses(initialExpenses);
    setCashSessions(initialCashSessions);
    setCashMovements(initialCashMovements);
    setStockMovements(initialStockMovements);
    setStockReceptions(initialStockReceptions);
    setStockCounts(initialStockCounts);
    setCart([]);
    setUiState('READY');

    // L'instantané hors-ligne et la file d'attente vivent dans IndexedDB, pas
    // dans localStorage : sans ça, une réinitialisation laisserait derrière
    // elle des écritures en attente qui repartiraient vers le serveur.
    setPendingMutations([]);
    setPendingFailure(null);
    blockedId.current = null;
    idMap.current = {};
    void idbClear(QUEUE_STORE);
    void idbClear(CACHE_STORE);

    showToast('Données réinitialisées avec succès', 'info');
  };

  return (
    <AppContext.Provider
      value={{
        authStatus,
        currentUser,
        currentBusiness,
        registerBusinessAccount,
        loginUser,
        logoutUser,
        closeAccount,
        justRegistered,
        dismissWelcomeChoice,
        uiState,
        setUiState,
        settings,
        updateSettings,
        updateCashRegisterMode,
        products,
        customers,
        sales,
        expenses,
        cart,
        cashSessions,
        activeCashSession,
        cashMovements,
        stockMovements,
        stockReceptions,
        stockCounts,
        recordStockReception,
        recordStockBreakage,
        recordStockLoss,
        recordStockCount,
        cancelStockMovement,
        activeTab,
        setActiveTab,
        activeMoreSubTab,
        setActiveMoreSubTab,
        customersDebtorsFilter,
        setCustomersDebtorsFilter,
        isNewSaleOpen,
        setIsNewSaleOpen,
        isNewProductOpen,
        setIsNewProductOpen,
        attemptNewSale,
        isWriteLocked,
        gateWrite,
        selectedSaleForReceipt,
        setSelectedSaleForReceipt,
        saleSuccessReceipt,
        setSaleSuccessReceipt,
        receiptDeliveries,
        recordReceiptDelivery,
        toastMessage,
        showToast,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        setCartQuantity,
        clearCart,
        cartTotal,
        cartItemCount,
        completeSale,
        cancelSale,
        assignCustomerToSale,
        addProduct,
        updateProduct,
        deleteProduct,
        findProductByCode,
        addProductCode,
        transferProductCode,
        removeProductCode,
        setPrimaryProductCode,
        addCustomer,
        recordDebtPayment,
        addExpense,
        employees,
        fetchEmployees,
        addEmployee,
        setEmployeeActive,
        mySessions,
        fetchMySessions,
        revokeMySession,
        revokeOtherMySessions,
        openCashRegister,
        closeCashRegister,
        addCashMovement,
        syncPendingOperations,
        toggleOfflineMode,
        resetToDefaultData,
        pendingMutations,
        isSyncing,
        isOnline,
        pendingFailure,
        dismissPendingFailure,
        lastSyncedCount,
        isSalePending,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
