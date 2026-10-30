import React from 'react';
import { createRoot } from 'react-dom/client';
import './banc.css';
import { FauxAppProvider } from './fauxContexte';
import { ReceiptModal } from '../../src/components/pos/ReceiptModal';
import { ReceiptsTab } from '../../src/components/receipts/ReceiptsTab';
import { LabelPrintModal } from '../../src/components/products/LabelPrintModal';
import { HelpAssistant } from '../../src/components/assistant/HelpAssistant';
import { installerFauxClavier } from './fauxClavier';
import { PRODUITS_ETIQUETTES } from './produitsEtiquettes';
import { lirePdf, lireQr, ecartLuminance } from './lecturePdf';

// ?ecran=recu : la fenêtre du reçu juste après une vente.
// ?ecran=mes-recus : l'onglet « Mes reçus », dont le volet d'aperçu.
// ?ecran=etiquettes : la fenêtre « Imprimer vos étiquettes » sur le catalogue d'essai.
// ?ecran=assistant : la bulle d'aide et son panneau, avec un clavier simulé.
const ecran = new URLSearchParams(window.location.search).get('ecran') ?? 'recu';

// L'assistant se juge clavier ouvert : on pilote la zone visible depuis le test.
if (ecran === 'assistant') installerFauxClavier();

// Le test lit le PDF produit avec les outils de la page.
Object.assign(window, { lirePdf, lireQr, ecartLuminance });

createRoot(document.getElementById('root')!).render(
  <FauxAppProvider ouvrirRecu={ecran === 'recu'}>
    {ecran === 'etiquettes' ? (
      <LabelPrintModal isOpen onClose={() => undefined} productIds={PRODUITS_ETIQUETTES.map((p) => p.id)} />
    ) : ecran === 'mes-recus' ? (
      <main className="p-4">
        <ReceiptsTab />
      </main>
    ) : (
      <div className="min-h-screen bg-[#F4F4F8]" />
    )}
    {ecran === 'assistant' && <HelpAssistant />}
    {ecran !== 'etiquettes' && ecran !== 'assistant' && <ReceiptModal />}
  </FauxAppProvider>
);
