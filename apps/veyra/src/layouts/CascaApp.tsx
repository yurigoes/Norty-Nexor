import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  BarChart3,
  Calculator,
  Calendar,
  CheckSquare,
  Columns3,
  CornerDownLeft,
  FileSignature,
  FileText,
  Handshake,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Megaphone,
  MessagesSquare,
  Moon,
  Package,
  Percent,
  PanelLeftClose,
  PanelLeft,
  Plug,
  ScrollText,
  Search,
  Settings,
  Sparkles,
  Sun,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { GRUPO_LABELS, ROLE_LABELS, type ModuleDefinition, type RoleKey } from '@veyra/core';
import { VeyraMark, VeyraWordmark } from '../brand/Logo';
import { Avatar, BotaoIcone, Selo } from '../components';
import { useSessao } from '../app/sessao';
import { CHAMADOS, CLIENTES, CONTRATOS, COTACOES, LEADS, NOTIFICACOES, PROPOSTAS } from '../data/base';
import './casca.css';

/** Ícone por chave do catálogo. O catálogo guarda o nome; o mapa resolve. */
const ICONES: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  sparkles: Sparkles,
  'user-plus': UserPlus,
  'columns-3': Columns3,
  users: Users,
  'messages-square': MessagesSquare,
  mail: Mail,
  calculator: Calculator,
  'file-text': FileText,
  'file-signature': FileSignature,
  package: Package,
  megaphone: Megaphone,
  workflow: Workflow,
  'check-square': CheckSquare,
  calendar: Calendar,
  wallet: Wallet,
  percent: Percent,
  handshake: Handshake,
  'life-buoy': LifeBuoy,
  'book-open': BookOpen,
  'bar-chart-3': BarChart3,
  plug: Plug,
  settings: Settings,
  'scroll-text': ScrollText,
};

const PAPEIS_DEMO: RoleKey[] = ['administrador', 'gestor', 'supervisor', 'vendedor', 'financeiro', 'suporte', 'marketing', 'auditor'];

export function CascaApp() {
  const { usuario, organizacao, modulosVisiveis, tema, alternarTema, trocarPapel } = useSessao();
  const [recolhida, setRecolhida] = useState(false);
  const [paletaAberta, setPaletaAberta] = useState(false);

  const naoLidas = NOTIFICACOES.filter((n) => !n.lida).length;

  /* ⌘K / Ctrl+K abre a busca global de qualquer lugar do aplicativo. */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletaAberta((a) => !a);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const grupos = useMemo(() => {
    const mapa = new Map<ModuleDefinition['grupo'], ModuleDefinition[]>();
    for (const modulo of modulosVisiveis) {
      const atual = mapa.get(modulo.grupo) ?? [];
      atual.push(modulo);
      mapa.set(modulo.grupo, atual);
    }
    return [...mapa.entries()];
  }, [modulosVisiveis]);

  /* No celular a barra inferior leva os cinco destinos mais usados. */
  const atalhosMobile = useMemo(
    () => modulosVisiveis.filter((m) => ['dashboard', 'leads', 'conversas', 'clientes', 'suporte'].includes(m.chave)).slice(0, 5),
    [modulosVisiveis],
  );

  return (
    <div className="vy-casca" data-recolhida={recolhida}>
      <aside className="vy-lateral">
        <div className="vy-lateral__marca">
          <VeyraMark size={28} />
          {!recolhida && <VeyraWordmark size={17} />}
        </div>

        <nav className="vy-lateral__nav" aria-label="Módulos">
          {grupos.map(([grupo, modulos]) => (
            <div key={grupo}>
              <div className="vy-lateral__grupo">{GRUPO_LABELS[grupo]}</div>
              {modulos.map((modulo) => {
                const Icone = ICONES[modulo.icone] ?? LayoutDashboard;
                return (
                  <NavLink
                    key={modulo.chave}
                    to={modulo.rota}
                    end={modulo.rota === '/app'}
                    className="vy-item"
                    title={recolhida ? modulo.nome : undefined}
                  >
                    <span className="vy-item__icone">
                      <Icone size={17} strokeWidth={2} />
                    </span>
                    <span className="vy-item__rotulo">{modulo.nome}</span>
                    {modulo.premium && (
                      <span className="vy-item__selo">
                        <Selo tom="marca">IA</Selo>
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="vy-lateral__rodape">
          <NavLink to="/app/ajuda" className="vy-item">
            <span className="vy-item__icone">
              <HelpCircle size={17} strokeWidth={2} />
            </span>
            <span className="vy-item__rotulo">Ajuda</span>
          </NavLink>
          <button className="vy-item" style={{ width: '100%' }} onClick={() => setRecolhida((r) => !r)}>
            <span className="vy-item__icone">
              {recolhida ? <PanelLeft size={17} strokeWidth={2} /> : <PanelLeftClose size={17} strokeWidth={2} />}
            </span>
            <span className="vy-item__rotulo">Recolher</span>
          </button>
        </div>
      </aside>

      <div className="vy-conteudo">
        <header className="vy-topo">
          <button className="vy-topo__busca" onClick={() => setPaletaAberta(true)}>
            <Search size={15} />
            <span>Buscar cliente, lead, proposta, protocolo…</span>
            <kbd className="vy-topo__atalho">⌘K</kbd>
          </button>

          <div className="vy-row" style={{ marginLeft: 'auto', gap: 'var(--space-2)' }}>
            {/* O seletor de papel é da demonstração: mostra a mesma
                operação sob permissões diferentes sem recarregar. */}
            <label className="vy-row vy-only-desktop" style={{ gap: 'var(--space-2)' }}>
              <span className="vy-eyebrow">Ver como</span>
              <select
                className="vy-select"
                style={{ width: 'auto', height: 32, fontSize: 'var(--text-xs)' }}
                value={usuario.papel}
                onChange={(e) => trocarPapel(e.target.value as RoleKey)}
              >
                {PAPEIS_DEMO.map((p) => (
                  <option key={p} value={p}>
                    {ROLE_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>

            <BotaoIcone
              icone={tema === 'escuro' ? Sun : Moon}
              rotulo={tema === 'escuro' ? 'Usar tema claro' : 'Usar tema escuro'}
              onClick={alternarTema}
            />

            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <BotaoIcone icone={Bell} rotulo={`Notificações (${naoLidas} não lidas)`} />
              {naoLidas > 0 && <span className="vy-topo__ponto" />}
            </span>

            <span className="vy-row" style={{ gap: 'var(--space-2)', paddingLeft: 'var(--space-2)' }}>
              <Avatar nome={usuario.nome} cor={usuario.avatarCor} tamanho={30} />
              <span className="vy-only-desktop" style={{ lineHeight: 1.2 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-strong)' }}>
                  {usuario.nome}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--text-subtle)' }}>
                  {organizacao.nome}
                </span>
              </span>
            </span>
          </div>
        </header>

        <main className="vy-pagina">
          <Outlet />
        </main>
      </div>

      <nav className="vy-barra-inferior" aria-label="Navegação principal">
        {atalhosMobile.map((modulo) => {
          const Icone = ICONES[modulo.icone] ?? LayoutDashboard;
          return (
            <NavLink key={modulo.chave} to={modulo.rota} end={modulo.rota === '/app'} className="vy-barra-inferior__item">
              <Icone size={19} strokeWidth={2} />
              {modulo.nome}
            </NavLink>
          );
        })}
      </nav>

      {paletaAberta && <PaletaComandos aoFechar={() => setPaletaAberta(false)} />}
    </div>
  );
}

/* =========================================================
   Busca global
   Um índice só, montado das entidades que a pessoa procura pelo
   número ou pelo nome: cliente, lead, proposta, cotação, contrato
   e protocolo. Procurar em seis telas diferentes é o que ela faz
   hoje — e é justamente isso que precisa desaparecer.
   ========================================================= */

interface ItemBusca {
  id: string;
  tipo: string;
  titulo: string;
  detalhe: string;
  rota: string;
}

function PaletaComandos({ aoFechar }: { aoFechar: () => void }) {
  const [termo, setTermo] = useState('');
  const [indiceAtivo, setIndiceAtivo] = useState(0);
  const navegar = useNavigate();
  const { modulosVisiveis, versaoDados } = useSessao();

  const indice = useMemo<ItemBusca[]>(
    () => [
      ...modulosVisiveis.map((m) => ({ id: m.chave, tipo: 'Ir para', titulo: m.nome, detalhe: m.resumo, rota: m.rota })),
      ...CLIENTES.map((c) => ({ id: c.id, tipo: 'Cliente', titulo: c.nome, detalhe: `${c.documento} · ${c.cidade}/${c.uf}`, rota: `/app/clientes/${c.id}` })),
      ...LEADS.slice(0, 20).map((l) => ({ id: l.id, tipo: 'Lead', titulo: l.nome, detalhe: `${l.telefone} · score ${l.score}`, rota: `/app/leads?lead=${l.id}` })),
      ...COTACOES.map((q) => ({ id: q.id, tipo: 'Cotação', titulo: q.numero, detalhe: `${q.opcoes.length} opções · ${q.status}`, rota: '/app/cotacoes' })),
      ...PROPOSTAS.map((p) => ({ id: p.id, tipo: 'Proposta', titulo: p.numero, detalhe: `${p.status} · ${p.segmento}`, rota: '/app/propostas' })),
      ...CONTRATOS.map((c) => ({ id: c.id, tipo: 'Contrato', titulo: c.numero, detalhe: `${c.segmento} · ${c.status}`, rota: '/app/contratos' })),
      ...CHAMADOS.map((t) => ({ id: t.id, tipo: 'Protocolo', titulo: t.protocolo, detalhe: t.assunto, rota: '/app/suporte' })),
    ],
    [modulosVisiveis, versaoDados],
  );

  const resultados = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return indice.filter((i) => i.tipo === 'Ir para').slice(0, 8);
    return indice.filter((i) => `${i.titulo} ${i.detalhe} ${i.tipo}`.toLowerCase().includes(t)).slice(0, 12);
  }, [termo, indice]);

  useEffect(() => setIndiceAtivo(0), [termo]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setIndiceAtivo((i) => Math.min(i + 1, resultados.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setIndiceAtivo((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && resultados[indiceAtivo]) {
        navegar(resultados[indiceAtivo].rota);
        aoFechar();
      }
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [resultados, indiceAtivo, navegar, aoFechar]);

  return (
    <>
      <div className="vy-overlay" onClick={aoFechar} />
      <div className="vy-paleta" role="dialog" aria-modal="true" aria-label="Busca global">
        <div className="vy-paleta__campo">
          <Search size={18} color="var(--text-subtle)" />
          <input
            autoFocus
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar cliente, lead, proposta, cotação, contrato ou protocolo…"
            aria-label="Termo de busca"
          />
          <kbd className="vy-topo__atalho">esc</kbd>
        </div>

        <div className="vy-paleta__lista">
          {resultados.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              Nada encontrado para “{termo}”.
            </div>
          ) : (
            <>
              <div className="vy-paleta__secao">{termo ? 'Resultados' : 'Ir para'}</div>
              {resultados.map((item, i) => (
                <button
                  key={`${item.tipo}-${item.id}`}
                  className="vy-paleta__item"
                  data-ativo={i === indiceAtivo}
                  onMouseEnter={() => setIndiceAtivo(i)}
                  onClick={() => {
                    navegar(item.rota);
                    aoFechar();
                  }}
                >
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontWeight: 600 }} className="vy-truncate">
                      {item.titulo}
                    </span>
                    <span className="vy-truncate" style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>
                      {item.detalhe}
                    </span>
                  </span>
                  <span className="vy-paleta__tipo">{item.tipo}</span>
                  {i === indiceAtivo && <CornerDownLeft size={14} color="var(--text-subtle)" />}
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
