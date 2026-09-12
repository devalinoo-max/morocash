import {
  Product,
  Customer,
  Sale,
  Expense,
  ShopSettings,
  CashRegisterSession,
  CashMovement,
  StockMovement,
  StockReception,
  StockCount,
} from '../types';

/*
 * Réglages de départ.
 *
 * Tout ce qui identifie une boutique ou une personne est vide : ces champs
 * sont remplis par bootstrapSession() depuis la base, et une valeur de
 * démonstration laissée là s'affiche telle quelle entre l'ouverture de l'app
 * et la réponse du serveur — le commerçant voit alors le nom de quelqu'un
 * d'autre sur son propre écran, et jusque sur ses reçus si le réseau tarde.
 * Seuls restent les réglages neutres (devise, fuseau, préférences).
 */
export const initialSettings: ShopSettings = {
  shopName: '',
  activityType: 'COMMERCE',
  city: '',
  ownerName: '',
  ownerPhone: '',
  telephone: '',
  whatsapp: '',
  adresse: '',
  fuseauHoraire: 'Africa/Abidjan',
  pinCode: '',
  currency: 'FCFA',
  receiptMessage: 'Merci pour votre confiance !',
  showLogo: true,
  compactReceipt: false,
  showPhone: true,
  planStatus: 'TRIAL',
  trialDaysLeft: 12,
  role: 'OWNER',
  isOfflineMode: false,
  quotaMaxProducts: 500,
  remiseMaxVendeur: 0,
  autoriserStockNegatif: true,
  seuilEcartComptage: 5,
  depenseAutoReception: true,
  fondCaisseHabituel: 10000,
  rappelFermetureCaisse: '20:00',
  dashboardMode: 'SIMPLE',
  periodeParDefaut: 'TODAY',
  comparerParDefaut: true,
  shopCode: '',
  lastInternalCodeNumber: 12,
  receiptSettings: {
    showLogo: true,
    showShopName: true,
    showPhone: true,
    showAddress: false,
    showSellerName: true,
    showCustomerName: true,
    showQrCode: false,
    showMessage: true,
    showWatermark: true,
    defaultFormat: 'TEXT',
    prefix: 'CMD',
  },
  labelSettings: {
    champs: ['nom', 'prix', 'code', 'boutique'],
    format: '24_63x34',
    tailleTexte: 'NORMAL',
    typeCode: 'QR',
    traitsDecoupe: true,
  },
  productCategories: ['Alimentation', 'Boissons', 'Entretien', 'Accessoires', 'Services'],
  expenseCategories: [
    'Achat marchandise',
    'Transport',
    'Publicité',
    'Loyer',
    'Facture CIE / Électricité',
    'Autre charge',
  ],
};

/* ==========================================================================
   Etat de depart : vide.

   Ces listes portaient une boutique de demonstration complete — une quinzaine
   de produits, quatre clients, des ventes, des mouvements de stock, des
   sessions de caisse. Elles servaient d'etat initial, donc sur un telephone
   neuf, apres une reinstallation, ou simplement pendant que le reseau
   repondait, le commercant ouvrait son app et y lisait le stock et les
   clients de quelqu'un d'autre. Rien ne distinguait ces lignes des siennes.

   La verite vient de la base, et hors ligne de l'instantane local
   (offline/cache), qui lui contient de vraies donnees. Entre les deux, un
   ecran vide est la reponse honnete — chaque liste sait deja le dire.
   ========================================================================== */

export const initialProducts: Product[] = [];
export const initialCustomers: Customer[] = [];
export const initialSales: Sale[] = [];
export const initialExpenses: Expense[] = [];
export const initialCashSessions: CashRegisterSession[] = [];
export const initialCashMovements: CashMovement[] = [];
export const initialStockMovements: StockMovement[] = [];
export const initialStockReceptions: StockReception[] = [];
export const initialStockCounts: StockCount[] = [];
