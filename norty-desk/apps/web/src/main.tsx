import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';

// A ordem importa: token antes de base, base antes de layout,
// layout antes de componente. É a mesma cascata do LICITA+.
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/publico.css';

const raiz = document.getElementById('app');
if (!raiz) throw new Error('Elemento #app não encontrado no index.html.');

createRoot(raiz).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
