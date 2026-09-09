import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { useMarca } from '../api/marca';
import { useAutenticacao } from '../auth/Autenticacao';
import { MarcaCompleta } from '../components/Marca';
import { iniciais } from '../lib/formato';

/**
 * Navegação do agente.
 *
 * O menu é filtrado pela mesma matriz que protege a rota na API
 * (CLAUDE.md, regra 2). Esconder o item é conveniência; o guard é a
 * proteção — mas mostrar um item que sempre dá 403 é pior que não
 * mostrar.
 */
export function Sidebar() {
  const { perfil, can, sair } = useAutenticacao();
  const marca = useMarca();
  const local = useLocation();
  const [parametros] = useSearchParams();

  /**
   * As quatro visões apontam para a mesma rota e diferem só no filtro.
   * `NavLink` marca todas como ativas — ele compara o caminho e ignora a
   * query — e a barra inteira acende. Comparar o filtro é o que
   * distingue uma visão da outra.
   */
  const visoes: { para: string; rotulo: string; filtro: Record<string, string> }[] = [
    { para: '/', rotulo: 'Fila do time', filtro: {} },
    { para: '/?assignedUserId=me', rotulo: 'Meus chamados', filtro: { assignedUserId: 'me' } },
    { para: '/?semAtribuicao=true', rotulo: 'Sem atribuição', filtro: { semAtribuicao: 'true' } },
    { para: '/?slaBreached=true', rotulo: 'SLA estourado', filtro: { slaBreached: 'true' } },
  ];

  const naFila = local.pathname === '/';
  const chavesDeFiltro = ['assignedUserId', 'semAtribuicao', 'slaBreached'];

  const ehAtual = (filtro: Record<string, string>): boolean => {
    if (!naFila) return false;
    // A visão base é a que não tem nenhum dos filtros ligados.
    const presentes = chavesDeFiltro.filter((k) => parametros.has(k));
    const esperados = Object.keys(filtro);
    if (presentes.length !== esperados.length) return false;
    return esperados.every((k) => parametros.get(k) === filtro[k]);
  };

  const configuracao = [
    { rotulo: 'Marca', para: '/config/marca', permissao: 'organizacao:gerenciar' as const },
    { rotulo: 'Categorias', para: '/config/categorias', permissao: 'config:categorias' as const },
    { rotulo: 'SLA e calendários', para: '/config/sla', permissao: 'config:sla' as const },
    { rotulo: 'Canais', para: '/config/canais', permissao: 'config:canais' as const },
    {
      rotulo: 'Diagnóstico',
      para: '/config/canais/diagnostico',
      permissao: 'config:canais' as const,
    },
    { rotulo: 'Webhooks', para: '/config/webhooks', permissao: 'config:webhooks' as const },
    { rotulo: 'Pessoas e times', para: null, permissao: 'pessoa:gerenciar' as const },
    { rotulo: 'Auditoria', para: '/config/auditoria', permissao: 'auditoria:ler' as const },
  ].filter((item) => can(item.permissao));

  return (
    <aside className="sidebar">
      <div className="sidebar-topo">
        {/* `MarcaCompleta` com `inversa`: o nome ao lado do símbolo
            precisa do modificador claro. Antes a barra emprestava a cor
            de `.conta-nome`, e `publico.css` — que vem depois na
            cascata — a devolvia para `--azul-900`: azul-marinho sobre
            azul-marinho. */}
        <MarcaCompleta
          logoUrl={marca.logoUrl}
          nome={marca.productName}
          tamanho={28}
          inversa
        />
      </div>

      <nav className="sidebar-nav" aria-label="Navegação principal">
        <div className="nav-grupo-rotulo">Fila</div>
        {visoes.map((visao) => (
          <Link
            key={visao.para}
            to={visao.para}
            className="nav-item"
            aria-current={ehAtual(visao.filtro) ? 'page' : undefined}
          >
            <span>{visao.rotulo}</span>
          </Link>
        ))}

        <div className="nav-grupo-rotulo">Trabalho</div>
        <Link
          to="/chamados/novo"
          className="nav-item"
          aria-current={local.pathname === '/chamados/novo' ? 'page' : undefined}
        >
          <span>Abrir chamado</span>
        </Link>

        {can('painel:proprio') ? (
          <Link
            to="/painel"
            className="nav-item"
            aria-current={local.pathname === '/painel' ? 'page' : undefined}
          >
            <span>Painel</span>
          </Link>
        ) : null}

        {can('ativo:ler') ? (
          <Link
            to="/ativos"
            className="nav-item"
            aria-current={local.pathname === '/ativos' ? 'page' : undefined}
          >
            <span>Ativos</span>
          </Link>
        ) : null}

        {can('problema:ler') ? (
          <Link
            to="/problemas"
            className="nav-item"
            aria-current={local.pathname.startsWith('/problemas') ? 'page' : undefined}
          >
            <span>Problemas</span>
          </Link>
        ) : null}

        {can('mudanca:ler') ? (
          <Link
            to="/mudancas"
            className="nav-item"
            aria-current={local.pathname.startsWith('/mudancas') ? 'page' : undefined}
          >
            <span>Mudanças</span>
          </Link>
        ) : null}

        {can('artigo:ler') ? (
          <Link
            to="/conhecimento"
            className="nav-item"
            aria-current={local.pathname.startsWith('/conhecimento') ? 'page' : undefined}
          >
            <span>Conhecimento</span>
          </Link>
        ) : null}

        {can('aprovacao:decidir') ? (
          <Link
            to="/aprovacoes"
            className="nav-item"
            aria-current={local.pathname === '/aprovacoes' ? 'page' : undefined}
          >
            <span>Aprovações</span>
          </Link>
        ) : null}

        {configuracao.length > 0 ? (
          <>
            <div className="nav-grupo-rotulo">Configuração</div>
            {configuracao.map((item) =>
              item.para ? (
                <Link
                  key={item.rotulo}
                  to={item.para}
                  className="nav-item"
                  aria-current={local.pathname === item.para ? 'page' : undefined}
                >
                  <span>{item.rotulo}</span>
                </Link>
              ) : (
                // Ainda não implementado: aparece apagado em vez de
                // sumir, para o operador saber que está por vir.
                <span key={item.rotulo} className="nav-item" aria-disabled="true" style={{ opacity: 0.45 }}>
                  <span>{item.rotulo}</span>
                </span>
              ),
            )}
          </>
        ) : null}
      </nav>

      <div className="sidebar-rodape">
        <button type="button" className="conta" onClick={() => void sair()}>
          <span className="avatar -sm" aria-hidden="true">
            {iniciais(perfil?.user.name ?? '?')}
          </span>
          <span className="conta-texto">
            <span className="conta-nome">{perfil?.user.name}</span>
            <span className="conta-empresa">
              {perfil?.organization.name} · {perfil?.role.toLowerCase()}
            </span>
          </span>
        </button>
      </div>
    </aside>
  );
}
