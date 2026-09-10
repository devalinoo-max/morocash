export type ActivityType = 'COMMERCE' | 'SERVICES' | 'MIXTE';
export type UserRole = 'OWNER' | 'SELLER' | 'ACCOUNTANT';

export type UIState = 
  | 'READY'
  | 'LOADING'
  | 'EMPTY'
  | 'OFFLINE'
  | 'SYNCING'
  | 'SYNCED'
  | 'SYNC_ERROR'
  | 'READ_ONLY'
  | 'QUOTA_REACHED'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR';

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'CREDIT';
export type PaymentMethod = 'CASH' | 'WAVE' | 'ORANGE_MONEY' | 'MTN' | 'MOOV' | 'VIREMENT';
export type SyncStatus = 'SYNCED' | 'PENDING_SYNC' | 'SYNC_ERROR';

export type NavigationTab = 'home' | 'sales' | 'receipts' | 'products' | 'movements' | 'customers' | 'cash' | 'more';

export type ReceiptDeliveryChannel = 'WHATSAPP' | 'IMPRESSION' | 'TELECHARGEMENT' | 'COPIE_TEXTE';

export interface ReceiptDelivery {
  id: string;
  businessId: string;
  orderId: string; // sale id or reference
  orderReference?: string;
  canal: ReceiptDeliveryChannel;
  userId: string;
  userName?: string;
  createdAt: string;
}

export type BarcodeFormat =
  | 'EAN13'
  | 'EAN8'
  | 'UPCA'
  | 'UPCE'
  | 'CODE128'
  | 'CODE39'
  | 'ITF14'
  | 'QR'
  | 'DATAMATRIX'
  | 'INTERNE';

export type CodeOrigin = 'GENERE' | 'SCANNE' | 'PHOTO' | 'MANUEL';

export interface ProductCode {
  id: string;
  business_id: string;
  product_id: string;
  code: string;
  format: BarcodeFormat;
  origine: CodeOrigin;
  est_principal: boolean;
  created_at: string;
  created_by?: string;
}

export interface Product {
  id: string;
  name: string;
  salePrice: number; // in FCFA integer
  previousPrice?: number; // in FCFA integer (ancien prix barré)
  purchasePrice: number; // in FCFA integer (hidden from SELLER)
  stock: number;
  alertThreshold: number;
  category: string;
  unit: string;
  photo?: string;
  photos?: string[];
  // Identifiants serveur des photos (ProductImage) — indispensables pour
  // supprimer une photo retirée du formulaire.
  photoRefs?: { id: string; url: string }[];
  barcode?: string;
  internalCode?: string; // e.g. MC-A7K2X-000148
  productCodes?: ProductCode[];
  isService?: boolean;
  salesCount: number;
  createdAt: string;
  syncStatus?: SyncStatus;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  unitPrice: number;
  costPrice?: number; // Cost unit fixed at order creation (BLOC 13)
  quantity: number;
  total: number;
}

export interface Sale {
  id: string;
  clientUuid: string;
  reference: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  discountMode?: 'PERCENTAGE' | 'AMOUNT';
  discountValue?: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
  createdAt: string;
  sellerName: string;
  syncStatus: SyncStatus;
  isCancelled?: boolean;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  city?: string;
  totalDebt: number; // in FCFA
  debtAgeDays: number;
  lastActivity: string;
  notes?: string;
  syncStatus?: SyncStatus;
}

export interface Expense {
  id: string;
  amount: number;
  category: string;
  note?: string;
  date: string;
  isAuto?: boolean;
  paymentMethod?: PaymentMethod;
  syncStatus?: SyncStatus;
}

export interface CashRegisterSession {
  id: string;
  ouvertePar: string;
  ouverteLe: string;
  fondDepart: number;
  fermeePar?: string;
  fermeeLe?: string;
  montantAttendu?: number;
  montantCompte?: number;
  ecart?: number;
  commentaireEcart?: string;
  statut: 'OUVERTE' | 'FERMEE';
}

export interface CashMovement {
  id: string;
  cashRegisterId: string;
  clientUuid: string;
  type: 'ENTREE' | 'SORTIE';
  origine: 'COMMANDE' | 'REMBOURSEMENT' | 'DEPENSE' | 'APPORT' | 'RETRAIT';
  referenceId?: string;
  montant: number;
  methode: PaymentMethod;
  motif?: string;
  userName: string;
  createdAt: string;
}

export interface ReceiptSettings {
  showLogo: boolean;
  showShopName: boolean;
  showPhone: boolean;
  showAddress: boolean;
  showSellerName: boolean;
  showCustomerName: boolean;
  showQrCode: boolean;
  showMessage: boolean;
  showWatermark: boolean; // "Reçu généré avec MoroCash"
  defaultFormat: 'TEXT' | 'IMAGE' | 'PDF';
  prefix: string; // CMD par défaut
}

export interface ShopSettings {
  shopName: string;
  activityType: ActivityType;
  city: string;
  ownerName: string;
  ownerPhone: string;
  pinCode: string;
  currency: string;
  receiptMessage: string;
  showLogo: boolean;
  compactReceipt: boolean;
  showPhone: boolean;
  planStatus: 'TRIAL' | 'SOLO' | 'BUSINESS' | 'EXPIRED';
  trialDaysLeft: number;
  role: UserRole;
  isOfflineMode: boolean;
  quotaMaxProducts: number;
  maxDiscountPercent?: number; // Plafond remise vendeur
  shopCode?: string; // 5 characters (e.g., 'A7K2X')
  currentSellerName?: string; // Nom du vendeur actif quand role === 'SELLER'
  lastInternalCodeNumber?: number; // counter for sequential MC- codes
  labelSettings?: LabelSettings;

  // New fields according to POINT 11
  logoUrl?: string;
  logoTransparentUrl?: string;
  telephone?: string;
  whatsapp?: string;
  adresse?: string;
  fuseauHoraire?: string;
  receiptSettings?: ReceiptSettings;
  remiseMaxVendeur?: number;
  // LIBRE (défaut) : aucune notion d'ouverte/fermée, jamais bloquant. STRICT :
  // le commerçant doit explicitement ouvrir/fermer sa caisse (comportement
  // historique) — un paiement encaissé sans caisse ouverte est refusé.
  cashRegisterMode?: 'LIBRE' | 'STRICT';
  autoriserStockNegatif?: boolean;
  seuilEcartComptage?: number;
  depenseAutoReception?: boolean;
  fondCaisseHabituel?: number;
  rappelFermetureCaisse?: string | null;
  dashboardMode?: 'SIMPLE' | 'DETAILED';
  periodeParDefaut?: 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH';
  comparerParDefaut?: boolean;
  productCategories?: string[];
  expenseCategories?: string[];
}

export type LabelField =
  | 'nom'
  | 'prix'
  | 'code'
  | 'photo'
  | 'boutique'
  | 'logo'
  | 'stock'
  | 'unite'
  | 'categorie'
  | 'codeChiffres'
  | 'dateImpression'
  | 'ancienPrix';

export type LabelFormat =
  | '24_63x34'
  | '21_70x42'
  | '12_105x48'
  | '65_38x21'
  | 'thermal_58'
  | 'custom';

export type LabelTextSize = 'PETIT' | 'NORMAL' | 'GRAND';
export type LabelCodeType = 'QR' | 'BARCODE' | 'BOTH';

export interface LabelSettings {
  champs: LabelField[];
  format: LabelFormat;
  tailleTexte: LabelTextSize;
  typeCode: LabelCodeType;
  traitsDecoupe: boolean;
  customWidth?: number; // in mm
  customHeight?: number; // in mm
}

export interface SyncQueueItem {
  clientUuid: string;
  deviceId: string;
  operationType:
    | 'CREATE_SALE'
    | 'UPDATE_STOCK'
    | 'CREATE_CUSTOMER'
    | 'RECORD_DEBT_PAYMENT'
    | 'CREATE_EXPENSE'
    | 'CASH_MOVEMENT'
    | 'STOCK_MOVEMENT'
    | 'STOCK_RECEPTION'
    | 'STOCK_COUNT';
  payload: any;
  createdAt: string;
  syncStatus: SyncStatus;
  retryCount: number;
}

export type StockMovementType =
  | 'ENTREE'
  | 'SORTIE'
  | 'RETOUR'
  | 'CASSE'
  | 'PERTE'
  | 'INVENTAIRE';

export interface StockMovement {
  id: string;
  business_id: string;
  product_id: string;
  product_name?: string;
  client_uuid: string;
  type: StockMovementType;
  quantite: number; // signée : positive en entrée (+), négative en sortie (-)
  stock_avant: number;
  stock_apres: number;
  prix_achat_unitaire?: number; // renseigné sur ENTREE uniquement
  cout_unitaire: number; // CMP au moment du mouvement, pour valoriser
  motif?: string;
  fournisseur?: string;
  note?: string;
  justificatif_url?: string;
  order_id?: string;
  order_reference?: string;
  stock_reception_id?: string;
  expense_id?: string;
  annule?: boolean;
  mouvement_inverse_id?: string;
  user_id?: string;
  user_name: string;
  created_at: string;
}

export interface StockReceptionLine {
  productId: string;
  productName: string;
  quantity: number;
  purchasePrice: number;
}

export interface StockReception {
  id: string;
  business_id: string;
  fournisseur?: string;
  note?: string;
  justificatif_url?: string;
  total_articles: number;
  total_montant: number;
  expense_id: string;
  lines?: StockReceptionLine[];
  user_id?: string;
  user_name: string;
  created_at: string;
}

export interface StockCountItem {
  productId: string;
  productName: string;
  stockTheorique: number;
  stockCompte: number;
  ecart: number;
  valeurEcart: number;
  commentaire?: string;
}

export interface StockCount {
  id: string;
  business_id: string;
  perimetre: string; // 'TOUT' | 'CATEGORIE' | 'SELECTION'
  nb_produits: number;
  nb_ecarts: number;
  ecart_unites: number;
  ecart_valeur: number;
  commentaire?: string;
  items?: StockCountItem[];
  user_id?: string;
  user_name: string;
  created_at: string;
}


