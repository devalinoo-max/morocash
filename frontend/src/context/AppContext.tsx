import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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
  SyncQueueItem,
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
import {
  generateInternalCode,
  validateBarcodeChecksum,
} from '../utils/barcodeEngine';
import confetti from 'canvas-confetti';
import { PLANS } from '../data/plans';
import * as authApi from '../api/auth';
import * as productsApi from '../api/products';
import * as customersApi from '../api/customers';
import * as ordersApi from '../api/orders';
import * as cashApi from '../api/cash';
import * as expensesApi from '../api/expenses';
import * as stockApi from '../api/stock';
import * as usersApi from '../api/users';
import { ApiError } from '../api/client';

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Impossible de joindre le serveur. Réessaie.';
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
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  expenses: Expense[];
  cart: CartItem[];
  syncQueue: SyncQueueItem[];
  cashSessions: CashRegisterSession[];
  activeCashSession: CashRegisterSession | null;
  cashMovements: CashMovement[];
  activeTab: NavigationTab;
  setActiveTab: (tab: NavigationTab) => void;
  activeMoreSubTab: 'expenses' | 'reports' | 'subscription' | 'settings' | 'help' | 'export' | 'employees' | 'permissions' | null;
  setActiveMoreSubTab: (subTab: 'expenses' | 'reports' | 'subscription' | 'settings' | 'help' | 'export' | 'employees' | 'permissions' | null) => void;
  // Piloté depuis l'extérieur de l'onglet Clients (liens "Qui me doit" du tableau
  // de bord, de la caisse, du menu Plus et de la barre latérale) pour ouvrir la
  // liste déjà filtrée sur les débiteurs plutôt que la liste complète des clients.
  customersDebtorsFilter: boolean;
  setCustomersDebtorsFilter: (value: boolean) => void;
  
  // Modals & Flows
  isNewSaleOpen: boolean;
  setIsNewSaleOpen: (open: boolean) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SETTINGS: 'morocash_settings_v3',
  PRODUCTS: 'morocash_products_v3',
  CUSTOMERS: 'morocash_customers_v3',
  SALES: 'morocash_sales_v3',
  EXPENSES: 'morocash_expenses_v3',
  CART: 'morocash_cart_v3',
  SYNC_QUEUE: 'morocash_sync_queue_v3',
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
      let counter = settings.lastInternalCodeNumber || 12;

      return loaded.map((p, idx) => {
        let internalCode = p.internalCode;
        let codes = p.productCodes ? [...p.productCodes] : [];

        if (!internalCode) {
          counter += 1;
          internalCode = generateInternalCode(shopCode, counter);
        }

        const hasHouseCode = codes.some((c) => c.origine === 'GENERE' || c.code === internalCode);
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
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SYNC_QUEUE);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

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
  const [activeTab, setActiveTab] = useState<NavigationTab>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      const hash = window.location.hash;
      if (path === '/recus' || hash === '#recus') return 'receipts';
      if (path === '/sales' || hash === '#sales' || path === '/commandes') return 'sales';
      if (path === '/products' || hash === '#products') return 'products';
      if (path === '/customers' || hash === '#customers') return 'customers';
    }
    return 'home';
  });
  const [activeMoreSubTab, setActiveMoreSubTab] = useState<'expenses' | 'reports' | 'subscription' | 'settings' | 'help' | 'export' | 'employees' | 'permissions' | null>(null);
  const [customersDebtorsFilter, setCustomersDebtorsFilter] = useState(false);
  const [isNewSaleOpen, setIsNewSaleOpen] = useState(false);
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

  // URL sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const targetPath = activeTab === 'home' ? '/' : `/${activeTab === 'receipts' ? 'recus' : activeTab}`;
    if (window.location.pathname !== targetPath && !window.location.pathname.startsWith('/api')) {
      window.history.pushState(null, '', targetPath);
    }
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path === '/recus' || path.startsWith('/recus')) {
        setActiveTab('receipts');
      } else if (path === '/sales' || path === '/commandes') {
        setActiveTab('sales');
      } else if (path === '/' || path === '') {
        setActiveTab('home');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Network online/offline automatic detection and sync (BLOC 11 & 12)
  useEffect(() => {
    const handleOnline = () => {
      showToast('Connexion Internet rétablie ! Synchronisation en cours...', 'info');
      setSettings((prev) => ({ ...prev, isOfflineMode: false }));
      setUiState('SYNCING');
      // Trigger sync
      setTimeout(() => {
        syncPendingOperations();
      }, 1000);
    };

    const handleOffline = () => {
      showToast('Connexion Internet perdue. Mode hors-ligne activé (tes données sont protégées).', 'warning');
      setSettings((prev) => ({ ...prev, isOfflineMode: true }));
      setUiState('OFFLINE');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSettings((prev) => ({ ...prev, isOfflineMode: true }));
      setUiState('OFFLINE');
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
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
    localStorage.setItem(STORAGE_KEYS.SYNC_QUEUE, JSON.stringify(syncQueue));
  }, [syncQueue]);

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
  const loadRealData = async (userName: string) => {
    try {
      const [apiProducts, apiCustomers, apiOrders, currentRegister, apiMovements] = await Promise.all([
        productsApi.listProducts(),
        customersApi.listCustomers(),
        ordersApi.listOrders(),
        cashApi.getCurrentRegister(),
        cashApi.listMovements(),
      ]);

      const productCategories = await productsApi.listProductCategories().catch(() => []);
      const productCategoryName = (id: string | null) =>
        productCategories.find((c) => c.id === id)?.nom ?? 'Général';
      setProducts(apiProducts.map((p) => productsApi.toFrontendProduct(p, productCategoryName(p.categoryId))));

      const balances = await Promise.all(
        apiCustomers.map((c) => customersApi.fetchCustomerBalance(c.id).catch(() => 0))
      );
      setCustomers(apiCustomers.map((c, i) => customersApi.toFrontendCustomer(c, balances[i])));

      setSales(
        apiOrders.map((o) => {
          const customer = apiCustomers.find((c) => c.id === o.customerId);
          return ordersApi.toFrontendSale(o, {
            customerName: customer?.nom,
            customerPhone: customer?.telephone ?? undefined,
            sellerName: userName,
          });
        })
      );

      setCashMovements(apiMovements.map((m) => cashApi.toFrontendCashMovement(m, userName)));

      // /cash/history est réservé OWNER/ACCOUNTANT (FORBIDDEN_ROLE pour un
      // SELLER) — on retombe sur la seule caisse courante dans ce cas.
      let registers: cashApi.ApiCashRegister[] = [];
      try {
        registers = await cashApi.listHistory();
      } catch {
        registers = currentRegister ? [currentRegister] : [];
      }
      setCashSessions(registers.map((r) => cashApi.toFrontendCashSession(r, {})));

      // Catégories accessibles à tous les rôles (non sensibles en elles-mêmes) —
      // sert à afficher un nom de catégorie lisible sur chaque dépense.
      const categories = await expensesApi.listCategories('DEPENSE');
      const categoryName = (id: string) => categories.find((c) => c.id === id)?.nom ?? 'Autre';

      // /expenses, /stock/receptions et /stock/counts sont réservés
      // OWNER/ACCOUNTANT (FORBIDDEN_ROLE pour un SELLER, spec §0 règle 7) —
      // repli sur une liste vide dans ce cas plutôt que de faire échouer tout
      // le chargement.
      let apiExpenses: expensesApi.ApiExpense[] = [];
      try {
        apiExpenses = await expensesApi.listExpenses();
      } catch {
        apiExpenses = [];
      }
      setExpenses(apiExpenses.map((e) => expensesApi.toFrontendExpense(e, categoryName(e.categoryId))));

      let apiReceptions: stockApi.ApiStockReception[] = [];
      try {
        apiReceptions = await stockApi.listReceptions();
      } catch {
        apiReceptions = [];
      }
      setStockReceptions(apiReceptions.map((r) => stockApi.toFrontendStockReception(r, userName)));

      let apiCounts: stockApi.ApiStockCount[] = [];
      try {
        apiCounts = await stockApi.listCounts();
      } catch {
        apiCounts = [];
      }
      setStockCounts(apiCounts.map((c) => stockApi.toFrontendStockCount(c, userName)));

      const apiStockMovements = await stockApi.listMovements();
      const productName = (id: string) => apiProducts.find((p) => p.id === id)?.nom;
      setStockMovements(
        apiStockMovements.map((m) =>
          stockApi.toFrontendStockMovement(m, {
            productName: productName(m.productId),
            userName,
            orders: apiOrders,
            receptions: apiReceptions,
          })
        )
      );
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

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
    });
    setAuthStatus('authenticated');
    await loadRealData(session.user.nom);
  };

  useEffect(() => {
    authApi
      .fetchCurrentSession()
      .then((session) => {
        if (session) {
          bootstrapSession(session);
        } else {
          setAuthStatus('anonymous');
        }
      })
      .catch(() => setAuthStatus('anonymous'));
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

    try {
      const order = await ordersApi.createOrder(
        ordersApi.toCreateOrderInput({
          customerId: params.customerId,
          items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
          remiseMode: params.discountMode,
          remiseValeur: params.discountValue,
          montantRecu: Math.max(0, Math.round(params.paidAmount)),
          methode: params.paymentMethod,
        })
      );

      const sale = ordersApi.toFrontendSale(order, {
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        sellerName: currentUser?.nom ?? 'Vendeur',
      });

      clearCart();
      setIsNewSaleOpen(false);
      setSelectedSaleForReceipt(sale);
      setSaleSuccessReceipt(sale);

      try {
        confetti({
          particleCount: 40,
          spread: 60,
          origin: { y: 0.8 },
        });
      } catch {
        // Ignored if confetti fails
      }

      showToast(`Commande ${sale.reference} validée !`, 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return sale;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
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
    try {
      const categoryName = productData.category?.trim();
      const categoryId = categoryName ? await productsApi.resolveProductCategoryId(categoryName) : undefined;
      const created = await productsApi.createProduct(
        productsApi.toCreateProductInput({ ...productData, categoryId })
      );
      const product = productsApi.toFrontendProduct(created, categoryName || 'Général');
      // Le produit créé contient déjà tout ce qu'il faut : on l'ajoute
      // directement à la liste plutôt que de recharger tout loadRealData()
      // (produits + clients + commandes + caisse + dépenses + stock...), qui
      // ajoutait ~1s de latence perceptible pour un simple ajout de produit.
      setProducts((prev) => [product, ...prev]);
      showToast(`${productData.name} ajouté au catalogue`, 'success');
      return product;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
  };

  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      const categoryName = updates.category?.trim();
      const categoryId = categoryName ? await productsApi.resolveProductCategoryId(categoryName) : undefined;
      await productsApi.updateProduct(id, {
        ...(updates.name !== undefined ? { nom: updates.name } : {}),
        ...(updates.salePrice !== undefined ? { prixVente: updates.salePrice } : {}),
        ...(updates.purchasePrice !== undefined ? { prixAchat: updates.purchasePrice } : {}),
        ...(updates.stock !== undefined ? { stock: updates.stock } : {}),
        ...(updates.alertThreshold !== undefined ? { seuilAlerte: updates.alertThreshold } : {}),
        ...(updates.unit !== undefined ? { unite: updates.unit } : {}),
        ...(updates.isService !== undefined ? { type: updates.isService ? 'SERVICE' : 'PRODUIT' } : {}),
        ...(categoryId ? { categoryId } : {}),
      });
      showToast('Produit mis à jour', 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      const result = await productsApi.deleteOrDeactivateProduct(id);
      showToast(
        result === 'DELETED' ? 'Produit supprimé' : 'Produit désactivé (il a un historique de ventes)',
        'info'
      );
      await loadRealData(currentUser?.nom ?? 'Vendeur');
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
    try {
      const created = await customersApi.createCustomer({
        nom: customerData.name,
        telephone: customerData.phone || undefined,
        note: customerData.notes || undefined,
      });
      const customer = customersApi.toFrontendCustomer(created, 0);
      showToast(`Client ${customerData.name} ajouté`, 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return customer;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
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
    try {
      const categoryId = await expensesApi.resolveExpenseCategoryId(expenseData.category);
      const created = await expensesApi.createExpense({
        montant: expenseData.amount,
        categoryId,
        note: expenseData.note,
        methode: expensesApi.toApiExpenseMethode(expenseData.paymentMethod ?? 'CASH'),
        date: expenseData.date,
      });
      const expense = expensesApi.toFrontendExpense(created, expenseData.category);
      showToast(`Frais de ${expenseData.amount} F enregistrés`, 'success');
      await loadRealData(currentUser?.nom ?? 'Vendeur');
      return expense;
    } catch (error) {
      showToast(apiErrorMessage(error), 'error');
      return null;
    }
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

  // Sync Pending Operations (§14 of spec)
  const syncPendingOperations = async () => {
    if (syncQueue.length === 0) {
      showToast('Toutes tes données sont déjà synchronisées !', 'info');
      return;
    }
    const count = syncQueue.length;
    setUiState('SYNCING');

    await new Promise((resolve) => setTimeout(resolve, 1400));

    // Resolve queued sales
    setSales((prev) =>
      prev.map((sale) => {
        if (sale.syncStatus === 'PENDING_SYNC') {
          return {
            ...sale,
            syncStatus: 'SYNCED',
            reference: sale.reference.startsWith('LOC-')
              ? sale.reference.replace('LOC-', 'CMD-')
              : sale.reference,
          };
        }
        return sale;
      })
    );

    setProducts((prev) =>
      prev.map((p) => ({ ...p, syncStatus: 'SYNCED' }))
    );
    setCustomers((prev) =>
      prev.map((c) => ({ ...c, syncStatus: 'SYNCED' }))
    );
    setExpenses((prev) =>
      prev.map((e) => ({ ...e, syncStatus: 'SYNCED' }))
    );

    setSyncQueue([]);
    setUiState('SYNCED');
    showToast(`Synchronisation réussie : ${count} opération${count > 1 ? 's' : ''} envoyée${count > 1 ? 's' : ''} au serveur !`, 'success');

    setTimeout(() => {
      setUiState(settings.isOfflineMode ? 'OFFLINE' : 'READY');
    }, 2500);
  };

  const toggleOfflineMode = () => {
    const nextMode = !settings.isOfflineMode;
    updateSettings({ isOfflineMode: nextMode });
    setUiState(nextMode ? 'OFFLINE' : 'READY');
    if (!nextMode && syncQueue.length > 0) {
      syncPendingOperations();
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
    setSyncQueue([]);
    setUiState('READY');
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
        products,
        customers,
        sales,
        expenses,
        cart,
        syncQueue,
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
