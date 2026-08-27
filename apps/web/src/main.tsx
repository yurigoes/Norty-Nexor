import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { registerServiceWorker } from './app/pwa';

import './styles/tokens.css';
import './styles/base.css';
import './styles/utilities.css';
import './components/ui/ui.css';

/**
 * Build padrão: rotas limpas (`/app/visitantes`) servidas por um host que
 * sabe reescrever qualquer caminho para o index.
 *
 * Build `standalone` (`npm run build:standalone`): a aplicação vira um
 * único arquivo HTML que pode ser aberto de qualquer lugar — inclusive de
 * uma página hospedada em subcaminho ou de um arquivo local. Nesses casos
 * não há servidor para reescrever rotas, então a navegação passa a usar
 * hash (`#/app/visitantes`) e o service worker fica de fora.
 */
const STANDALONE = import.meta.env.VITE_STANDALONE === 'true';
const Router = STANDALONE ? HashRouter : BrowserRouter;

if (!STANDALONE) registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
);
