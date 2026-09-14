import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Customer, Sale, ShopSettings } from '../../src/types';
import { initialSettings } from '../../src/data/mockInitialData';

/**
 * Remplace context/AppContext pour le banc d'essai de l'écran reçu (alias
 * Vite) : les VRAIS composants s'affichent, avec une session et des données
 * fixes, sans serveur ni connexion.
 */

const params = new URLSearchParams(window.location.search);
const nbArticles = Number(params.get('articles') ?? '3');
const nomsLongs = params.get('noms') === 'longs';

const settings: ShopSettings = {
  ...initialSettings,
  businessId: 'cmbusiness0001',
  shopName: nomsLongs ? 'Boutique Étoile d’Afrique et Frères de Treichville' : 'Allo',
  ownerName: 'Moussa Traoré',
  ownerPhone: '0700000000',
  telephone: '0707070707',
  adresse: 'Cocody, Abidjan',
  city: 'Abidjan',
  receiptMessage: 'Merci pour votre confiance ! À bientôt chez {boutique}.',
  role: 'OWNER',
};

const customer: Customer = {
  id: 'cmcustomer0001',
  name: nomsLongs ? 'Awa Marie-Christine Diallo Kouassi' : 'Awa Diallo',
  phone: '0708091011',
  totalDebt: 125_000,
  debtAgeDays: 3,
} as Customer;

const sale: Sale = {
  id: 'cmorder000001',
  clientUuid: '3f1c2a4e-8b7d-4c1e-9a2b-5d6e7f8a9b0c',
  reference: 'CMD-20260914-0042',
  items: Array.from({ length: nbArticles }, (_, i) => ({
    productId: `p${i}`,
    name: nomsLongs
      ? `Pagne wax hollandais double face motif traditionnel édition limitée n°${i + 1}`
      : `Riz parfumé 5kg n°${i + 1}`,
    unitPrice: 12_500,
    quantity: 2,
    total: 25_000,
  })),
  subtotal: 25_000 * nbArticles,
  discount: 2_500,
  discountMode: 'AMOUNT',
  discountValue: 2_500,
  totalAmount: 25_000 * nbArticles - 2_500,
  paidAmount: 10_000,
  remainingAmount: 25_000 * nbArticles - 12_500,
  paymentStatus: 'PARTIAL',
  paymentMethod: 'CASH',
  payments: [],
  customerId: customer.id,
  customerName: customer.name,
  customerPhone: customer.phone,
  createdAt: new Date().toISOString(),
  sellerName: 'Moussa Traoré',
  syncStatus: 'SYNCED',
} as Sale;

const noop = () => undefined;

type Ctx = Record<string, unknown>;
const Contexte = createContext<Ctx | null>(null);

export const FauxAppProvider: React.FC<{ children: React.ReactNode; ouvrirRecu: boolean }> = ({ children, ouvrirRecu }) => {
  const [saleSuccessReceipt, setSaleSuccessReceipt] = useState<Sale | null>(ouvrirRecu ? sale : null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);
  const value = useMemo<Ctx>(
    () => ({
      settings,
      sales: [sale],
      customers: [customer],
      receiptDeliveries: [],
      saleSuccessReceipt,
      setSaleSuccessReceipt,
      selectedSaleForReceipt,
      setSelectedSaleForReceipt,
      recordReceiptDelivery: noop,
      showToast: noop,
      updateSettings: noop,
      updateCustomerPhone: async () => true,
    }),
    [saleSuccessReceipt, selectedSaleForReceipt]
  );
  return <Contexte.Provider value={value}>{children}</Contexte.Provider>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useApp = (): any => {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('FauxAppProvider manquant');
  return ctx;
};
