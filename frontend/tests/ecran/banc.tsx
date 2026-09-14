import React from 'react';
import { createRoot } from 'react-dom/client';
import './banc.css';
import { FauxAppProvider } from './fauxContexte';
import { ReceiptModal } from '../../src/components/pos/ReceiptModal';
import { ReceiptsTab } from '../../src/components/receipts/ReceiptsTab';

// ?ecran=recu : la fenêtre du reçu juste après une vente.
// ?ecran=mes-recus : l'onglet « Mes reçus », dont le volet d'aperçu.
const ecran = new URLSearchParams(window.location.search).get('ecran') ?? 'recu';

createRoot(document.getElementById('root')!).render(
  <FauxAppProvider ouvrirRecu={ecran === 'recu'}>
    {ecran === 'mes-recus' ? (
      <main className="p-4">
        <ReceiptsTab />
      </main>
    ) : (
      <div className="min-h-screen bg-[#F4F4F8]" />
    )}
    <ReceiptModal />
  </FauxAppProvider>
);
