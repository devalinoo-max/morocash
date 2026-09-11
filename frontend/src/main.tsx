import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {applyStoredTheme} from './components/landing/useLandingTheme.ts';
import './index.css';

// Le thème choisi est une préférence de compte, pas un réglage de la page
// publique : on le pose sur <html> avant le premier rendu, quel que soit
// l'écran d'arrivée.
applyStoredTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
