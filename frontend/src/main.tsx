import {StrictMode, Suspense, lazy, type ComponentType} from 'react';
import {createRoot} from 'react-dom/client';
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

// Espace affilié et pages publiques de l'affiliation : à part de l'app
// boutique, sans rapport avec sa session, chargés seulement à leur adresse.
const AffiliateApp = lazy(() =>
  import('./components/affiliate/AffiliateApp').then((m) => ({default: m.AffiliateApp})),
);
const AffiliationLanding = lazy(() =>
  import('./components/affiliate/AffiliationLanding').then((m) => ({default: m.AffiliationLanding})),
);
const AffiliationTerms = lazy(() =>
  import('./components/affiliate/LegalPages').then((m) => ({default: m.AffiliationTerms})),
);
const PrivacyPolicy = lazy(() =>
  import('./components/affiliate/LegalPages').then((m) => ({default: m.PrivacyPolicy})),
);

// App boutique chargée à part : les pages ci-dessous (dont /affiliation, publique)
// ne téléchargent pas son code.
const App = lazy(() => import('./App.tsx'));

const STANDALONE_PAGES: [RegExp, ComponentType][] = [
  [/^\/affilie\/?$/i, AffiliateApp],
  [/^\/affiliation\/?$/i, AffiliationLanding],
  [/^\/affiliation\/conditions\/?$/i, AffiliationTerms],
  [/^\/confidentialite\/?$/i, PrivacyPolicy],
];
const StandalonePage = STANDALONE_PAGES.find(([pattern]) => pattern.test(window.location.pathname))?.[1];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{StandalonePage ? <StandalonePage /> : <App />}</Suspense>
  </StrictMode>,
);
