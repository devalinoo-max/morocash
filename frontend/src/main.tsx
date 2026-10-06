import {StrictMode, Suspense, lazy} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {affiliateCodeFromPath, saveAffiliateCode} from './utils/affiliateRef';
import {REGISTER_PATH} from './utils/routes';
import './index.css';

// Lien d'affilié /a/CODE : le code est gardé pour l'inscription, et le
// visiteur arrive directement sur « Créer ma boutique ».
const affiliateCode = affiliateCodeFromPath(window.location.pathname);
if (affiliateCode) {
  saveAffiliateCode(affiliateCode);
  window.history.replaceState(null, '', REGISTER_PATH);
}

// Espace affilié : application à part, sans rapport avec la session boutique.
const AffiliateApp = lazy(() =>
  import('./components/affiliate/AffiliateApp').then((m) => ({default: m.AffiliateApp})),
);
const isAffiliateSpace = /^\/affilie\/?$/i.test(window.location.pathname);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAffiliateSpace ? (
      <Suspense fallback={null}>
        <AffiliateApp />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
