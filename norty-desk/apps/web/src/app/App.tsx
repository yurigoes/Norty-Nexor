import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';

import { ProvedorDeAutenticacao, useAutenticacao } from '../auth/Autenticacao';
import { Login } from '../modules/auth/Login';
import { MinhasAprovacoes } from '../modules/aprovacao/MinhasAprovacoes';
import { Canais } from '../modules/canais/Canais';
import { Artigo } from '../modules/conhecimento/Artigo';
import { Conhecimento } from '../modules/conhecimento/Conhecimento';
import { Diagnostico } from '../modules/canais/Diagnostico';
import { Chamado } from '../modules/chamado/Chamado';
import { NovoChamado } from '../modules/chamado/NovoChamado';
import { MarcaConfig } from '../modules/config/MarcaConfig';
import { Fila } from '../modules/fila/Fila';
import { PortalChamado } from '../modules/portal/PortalChamado';
import { PortalLista } from '../modules/portal/PortalLista';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

export function App() {
  return (
    <ProvedorDeAutenticacao>
      <BrowserRouter>
        <Raiz />
      </BrowserRouter>
    </ProvedorDeAutenticacao>
  );
}

function Raiz() {
  const { carregando, perfil } = useAutenticacao();

  if (carregando) {
    return (
      <div className="tela-publica" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="pilha-sm" style={{ width: 240 }}>
          <div className="sk sk-titulo" />
          <div className="sk sk-linha" />
          <div className="sk sk-linha" />
        </div>
      </div>
    );
  }

  if (!perfil) return <Login />;

  // Duas superfícies distintas, não uma com "modo simplificado": o
  // solicitante nunca vê a fila, e o agente nunca vê o portal
  // (`docs/02-gap-analysis.md`, item 9).
  return perfil.role === 'SOLICITANTE' ? <Portal /> : <Aplicativo />;
}

function Aplicativo() {
  return (
    <div className="shell">
      <Sidebar />

      <div className="principal">
        <Header />

        <main className="conteudo" id="conteudo">
          <Routes>
            <Route path="/" element={<Fila />} />
            <Route path="/aprovacoes" element={<MinhasAprovacoes />} />
            <Route path="/conhecimento" element={<Conhecimento />} />
            <Route path="/conhecimento/novo" element={<Artigo novo />} />
            <Route path="/conhecimento/:id" element={<Artigo />} />
            <Route path="/chamados/novo" element={<NovoChamado />} />
            <Route path="/chamados/:id" element={<Chamado />} />
            <Route path="/config/marca" element={<MarcaConfig />} />
            <Route path="/config/canais" element={<Canais />} />
            <Route path="/config/canais/diagnostico" element={<Diagnostico />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function Portal() {
  const { perfil, sair } = useAutenticacao();

  return (
    <div className="tela-publica">
      <header className="header">
        <div className="header-titulo">
          <h1>Meus chamados</h1>
        </div>
        <div className="header-acoes">
          {/* O portal não tem barra lateral: sem este link, quem só
              aprova não teria como chegar às suas aprovações. */}
          <Link to="/aprovacoes" className="btn -fantasma -sm">
            Aprovações
          </Link>
          <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
            {perfil?.user.name}
          </span>
          <button type="button" className="btn -fantasma -sm" onClick={() => void sair()}>
            Sair
          </button>
        </div>
      </header>

      <main className="conteudo" id="conteudo" style={{ maxWidth: 880 }}>
        <Routes>
          <Route path="/" element={<PortalLista />} />
          <Route path="/aprovacoes" element={<MinhasAprovacoes noPortal />} />
          <Route path="/conhecimento" element={<Conhecimento />} />
          <Route path="/conhecimento/:id" element={<Artigo />} />
          <Route path="/chamados/novo" element={<NovoChamado noPortal />} />
          <Route path="/chamados/:id" element={<PortalChamado />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
