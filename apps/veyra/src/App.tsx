import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { EsqueletoLista, ProvedorAvisos } from './components';
import { ProvedorSessao } from './app/sessao';
import { Apresentacao } from './apresentacao/Apresentacao';

/* A apresentação é a porta de entrada e precisa abrir rápido; o
   aplicativo e a área administrativa vêm em pedaços separados, buscados
   só quando alguém realmente navega até eles. */
const CascaApp = lazy(() => import('./layouts/CascaApp').then((m) => ({ default: m.CascaApp })));
const Dashboard = lazy(() => import('./modules/Dashboard').then((m) => ({ default: m.Dashboard })));
const Intelligence = lazy(() => import('./modules/Intelligence').then((m) => ({ default: m.Intelligence })));
const Leads = lazy(() => import('./modules/Leads').then((m) => ({ default: m.Leads })));
const Funil = lazy(() => import('./modules/Funil').then((m) => ({ default: m.Funil })));
const Clientes = lazy(() => import('./modules/Clientes').then((m) => ({ default: m.Clientes })));
const Cliente360 = lazy(() => import('./modules/Clientes').then((m) => ({ default: m.Cliente360 })));
const Conversas = lazy(() => import('./modules/Conversas').then((m) => ({ default: m.Conversas })));
const Cotacoes = lazy(() => import('./modules/Comercial').then((m) => ({ default: m.Cotacoes })));
const Propostas = lazy(() => import('./modules/Comercial').then((m) => ({ default: m.Propostas })));
const Contratos = lazy(() => import('./modules/Comercial').then((m) => ({ default: m.Contratos })));
const Produtos = lazy(() => import('./modules/Comercial').then((m) => ({ default: m.Produtos })));
const Campanhas = lazy(() => import('./modules/Crescimento').then((m) => ({ default: m.Campanhas })));
const Automacoes = lazy(() => import('./modules/Crescimento').then((m) => ({ default: m.Automacoes })));
const Tarefas = lazy(() => import('./modules/Crescimento').then((m) => ({ default: m.Tarefas })));
const Agenda = lazy(() => import('./modules/Crescimento').then((m) => ({ default: m.Agenda })));
const Financeiro = lazy(() => import('./modules/Financeiro').then((m) => ({ default: m.Financeiro })));
const Comissoes = lazy(() => import('./modules/Financeiro').then((m) => ({ default: m.Comissoes })));
const Partners = lazy(() => import('./modules/Financeiro').then((m) => ({ default: m.Partners })));
const Suporte = lazy(() => import('./modules/Suporte').then((m) => ({ default: m.Suporte })));
const Relatorios = lazy(() => import('./modules/Plataforma').then((m) => ({ default: m.Relatorios })));
const Integracoes = lazy(() => import('./modules/Plataforma').then((m) => ({ default: m.Integracoes })));
const Configuracoes = lazy(() => import('./modules/Plataforma').then((m) => ({ default: m.Configuracoes })));
const Auditoria = lazy(() => import('./modules/Plataforma').then((m) => ({ default: m.Auditoria })));
const Ajuda = lazy(() => import('./modules/Plataforma').then((m) => ({ default: m.Ajuda })));
const CascaAdmin = lazy(() => import('./admin/Admin').then((m) => ({ default: m.CascaAdmin })));
const AdminVisaoGeral = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminVisaoGeral })));
const AdminEmpresas = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminEmpresas })));
const AdminPlanos = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminPlanos })));
const AdminConsumo = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminConsumo })));
const AdminReceita = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminReceita })));
const AdminAuditoria = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminAuditoria })));
const AdminChaves = lazy(() => import('./admin/Admin').then((m) => ({ default: m.AdminChaves })));

/**
 * Rotas
 *
 * Três áreas com cascas diferentes, e a separação é proposital:
 *
 *   /            apresentação pública do produto
 *   /app/*       o produto, sob a sessão da empresa cliente
 *   /admin/*     VEYRA Admin — do dono da plataforma, nunca do cliente
 *
 * A área administrativa não é uma tela a mais dentro de `/app`. Ela vive
 * fora do tenant porque quem entra nela enxerga *todas* as organizações
 * — misturá-la com o aplicativo do cliente seria a forma mais fácil de,
 * um dia, vazar dado de uma organização para outra.
 */
/**
 * O build autocontido roda como arquivo único, sem servidor para
 * reescrever a URL: ali a navegação vai por hash. No build normal, com
 * a API servindo o `index.html` em qualquer caminho, a URL fica limpa.
 */
const Roteador = import.meta.env.VITE_STANDALONE === 'true' ? HashRouter : BrowserRouter;

export function App() {
  return (
    <Roteador>
      <ProvedorSessao>
        <ProvedorAvisos>
          {/* O esqueleto tem a altura do conteúdo que substitui, para a
              página não pular quando o pedaço chega. */}
          <Suspense fallback={<EsqueletoLista linhas={6} />}>
            <Routes>
            <Route path="/" element={<Apresentacao />} />

            <Route path="/app" element={<CascaApp />}>
              <Route index element={<Dashboard />} />
              <Route path="intelligence" element={<Intelligence />} />
              <Route path="leads" element={<Leads />} />
              <Route path="funil" element={<Funil />} />
              <Route path="clientes" element={<Clientes />} />
              <Route path="clientes/:id" element={<Cliente360 />} />
              <Route path="conversas" element={<Conversas />} />
              <Route path="cotacoes" element={<Cotacoes />} />
              <Route path="propostas" element={<Propostas />} />
              <Route path="contratos" element={<Contratos />} />
              <Route path="produtos" element={<Produtos />} />
              <Route path="campanhas" element={<Campanhas />} />
              <Route path="automacoes" element={<Automacoes />} />
              <Route path="tarefas" element={<Tarefas />} />
              <Route path="agenda" element={<Agenda />} />
              <Route path="financeiro" element={<Financeiro />} />
              <Route path="comissoes" element={<Comissoes />} />
              <Route path="partners" element={<Partners />} />
              <Route path="suporte" element={<Suporte />} />
              <Route path="conhecimento" element={<Suporte />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="integracoes" element={<Integracoes />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="auditoria" element={<Auditoria />} />
              <Route path="ajuda" element={<Ajuda />} />
            </Route>

            <Route path="/admin" element={<CascaAdmin />}>
              <Route index element={<AdminVisaoGeral />} />
              <Route path="empresas" element={<AdminEmpresas />} />
              <Route path="planos" element={<AdminPlanos />} />
              <Route path="consumo" element={<AdminConsumo />} />
              <Route path="receita" element={<AdminReceita />} />
              <Route path="auditoria" element={<AdminAuditoria />} />
              <Route path="chaves" element={<AdminChaves />} />
            </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ProvedorAvisos>
      </ProvedorSessao>
    </Roteador>
  );
}
