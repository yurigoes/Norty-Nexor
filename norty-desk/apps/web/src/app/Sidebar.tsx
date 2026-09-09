import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { useAutenticacao } from '../auth/Autenticacao';
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
    { rotulo: 'Categorias', permissao: 'config:categorias' as const },
    { rotulo: 'SLA e calendários', permissao: 'config:sla' as const },
    { rotulo: 'Canais', permissao: 'config:canais' as const },
    { rotulo: 'Pessoas e times', permissao: 'pessoa:gerenciar' as const },
  ].filter((item) => can(item.permissao));

  return (
    <aside className="sidebar">
      <div className="sidebar-topo">
        <span className="avatar -sm" aria-hidden="true">
          ND
        </span>
        <span className="marca-texto conta-nome">Norty Desk</span>
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

        {configuracao.length > 0 ? (
          <>
            <div className="nav-grupo-rotulo">Configuração</div>
            {configuracao.map((item) => (
              <span key={item.rotulo} className="nav-item" aria-disabled="true">
                <span>{item.rotulo}</span>
              </span>
            ))}
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
