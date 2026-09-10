import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ProvedorDeAutenticacao, useAutenticacao } from '../auth/Autenticacao';
import { Login } from '../modules/auth/Login';
import { MinhaConta } from '../modules/conta/MinhaConta';
import { TrocaObrigatoria } from '../modules/conta/TrocarSenha';
import { MinhasAprovacoes } from '../modules/aprovacao/MinhasAprovacoes';
import { Canais } from '../modules/canais/Canais';
import { Auditoria } from '../modules/auditoria/Auditoria';
import { Categorias } from '../modules/configuracao/Categorias';
import { Pessoas } from '../modules/configuracao/Pessoas';
import { Software } from '../modules/software/Software';
import { Softwares } from '../modules/software/Softwares';
import { Diretorios } from '../modules/configuracao/Diretorios';
import { Formularios } from '../modules/configuracao/Formularios';
import { CatalogoDoAtivo } from '../modules/configuracao/CatalogoDoAtivo';
import { Contratos } from '../modules/configuracao/Contratos';
import { Modelos } from '../modules/configuracao/Modelos';
import { Recorrencias } from '../modules/configuracao/Recorrencias';
import { Sla } from '../modules/configuracao/Sla';
import { Ativo } from '../modules/ativo/Ativo';
import { Ativos } from '../modules/ativo/Ativos';
import { Pesquisa } from '../modules/ativo/Pesquisa';
import { Artigo } from '../modules/conhecimento/Artigo';
import { Conhecimento } from '../modules/conhecimento/Conhecimento';
import { Diagnostico } from '../modules/canais/Diagnostico';
import { Chamado } from '../modules/chamado/Chamado';
import { NovoChamado } from '../modules/chamado/NovoChamado';
import { MarcaConfig } from '../modules/config/MarcaConfig';
import { Fila } from '../modules/fila/Fila';
import { Painel } from '../modules/painel/Painel';
import { Mudanca } from '../modules/mudanca/Mudanca';
import { Mudancas } from '../modules/mudanca/Mudancas';
import { ErrosConhecidos } from '../modules/problema/ErrosConhecidos';
import { Problema } from '../modules/problema/Problema';
import { Problemas } from '../modules/problema/Problemas';
import { Webhooks } from '../modules/webhook/Webhooks';
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
  const local = useLocation();

  // A pesquisa de satisfação vem antes de tudo: quem clica no link do
  // e-mail não tem conta, e mandá-lo para o login é o mesmo que não
  // receber a nota. Fica fora do portão porque a autorização dela é o
  // token da URL, não a sessão.
  if (local.pathname.startsWith('/pesquisa/')) {
    return (
      <Routes>
        <Route path="/pesquisa/:token" element={<Pesquisa />} />
      </Routes>
    );
  }

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

  // Senha provisória (conta nova ou redefinida): nada abre antes da troca.
  if (perfil.user.mustChangePassword) return <TrocaObrigatoria />;

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
            <Route path="/painel" element={<Painel />} />
            <Route path="/ativos" element={<Ativos />} />
            <Route path="/ativos/:id" element={<Ativo />} />
            <Route path="/software" element={<Softwares />} />
            <Route path="/software/:id" element={<Software />} />
            {/* `erros-conhecidos` antes de `:id`, ou casaria com ele. */}
            <Route path="/problemas/erros-conhecidos" element={<ErrosConhecidos />} />
            <Route path="/problemas/:id" element={<Problema />} />
            <Route path="/problemas" element={<Problemas />} />
            <Route path="/mudancas/:id" element={<Mudanca />} />
            <Route path="/mudancas" element={<Mudancas />} />
            <Route path="/aprovacoes" element={<MinhasAprovacoes />} />
            <Route path="/conhecimento" element={<Conhecimento />} />
            <Route path="/conhecimento/novo" element={<Artigo novo />} />
            <Route path="/conhecimento/:id" element={<Artigo />} />
            <Route path="/chamados/novo" element={<NovoChamado />} />
            <Route path="/chamados/:id" element={<Chamado />} />
            <Route path="/config/marca" element={<MarcaConfig />} />
            <Route path="/config/categorias" element={<Categorias />} />
            <Route path="/config/pessoas" element={<Pessoas />} />
            <Route path="/config/autenticacao" element={<Diretorios />} />
            <Route path="/config/sla" element={<Sla />} />
            <Route path="/config/recorrencias" element={<Recorrencias />} />
            <Route path="/config/formularios" element={<Formularios />} />
            <Route path="/config/modelos" element={<Modelos />} />
            <Route path="/config/contratos" element={<Contratos />} />
            <Route path="/config/catalogo-ativos" element={<CatalogoDoAtivo />} />
            <Route path="/config/canais" element={<Canais />} />
            <Route path="/config/canais/diagnostico" element={<Diagnostico />} />
            <Route path="/config/webhooks" element={<Webhooks />} />
            <Route path="/config/auditoria" element={<Auditoria />} />
            <Route path="/conta" element={<MinhaConta />} />
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
          <Link to="/conta" className="btn -fantasma -sm" title="Minha conta">
            {perfil?.user.name}
          </Link>
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
          <Route path="/conta" element={<MinhaConta />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
