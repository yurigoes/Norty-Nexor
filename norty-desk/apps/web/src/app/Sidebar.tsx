import { iniciais } from '../lib/formato';

type Contadores = {
  meus: number;
  time: number;
  semAtribuicao: number;
  slaEstourando: number;
};

/**
 * Navegação do agente.
 *
 * As visões de fila vêm primeiro, com contador — é o que o agente olha
 * ao chegar. Configuração fica no fim: entra-se lá uma vez por mês.
 */
export function Sidebar({
  contadores,
  aoNavegar,
}: {
  contadores: Contadores;
  aoNavegar: () => void;
}) {
  const visoes = [
    { chave: 'meus', rotulo: 'Meus chamados', contador: contadores.meus },
    { chave: 'time', rotulo: 'Do meu time', contador: contadores.time, atual: true },
    { chave: 'sem-atribuicao', rotulo: 'Sem atribuição', contador: contadores.semAtribuicao },
    // O único contador que pode gritar: SLA estourando exige ação agora.
    { chave: 'sla', rotulo: 'SLA estourando', contador: contadores.slaEstourando, alerta: true },
  ];

  const trabalho = [
    { chave: 'aprovacoes', rotulo: 'Aprovações' },
    { chave: 'tarefas', rotulo: 'Minhas tarefas' },
    { chave: 'artigos', rotulo: 'Base de conhecimento' },
    { chave: 'paineis', rotulo: 'Painéis' },
  ];

  const configuracao = [
    { chave: 'categorias', rotulo: 'Categorias e formulários' },
    { chave: 'sla-config', rotulo: 'SLA e calendários' },
    { chave: 'canais', rotulo: 'Canais' },
    { chave: 'regras', rotulo: 'Regras de entrada' },
    { chave: 'pessoas', rotulo: 'Pessoas e times' },
  ];

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
          <a
            key={visao.chave}
            href={`#${visao.chave}`}
            className="nav-item"
            aria-current={visao.atual ? 'page' : undefined}
            onClick={(evento) => {
              evento.preventDefault();
              aoNavegar();
            }}
          >
            <span>{visao.rotulo}</span>
            <span
              className={`nav-item-contagem ${visao.alerta && visao.contador > 0 ? '-alerta' : ''}`}
            >
              {visao.contador}
            </span>
          </a>
        ))}

        <div className="nav-grupo-rotulo">Trabalho</div>
        {trabalho.map((item) => (
          <a key={item.chave} href={`#${item.chave}`} className="nav-item">
            <span>{item.rotulo}</span>
          </a>
        ))}

        <div className="nav-grupo-rotulo">Configuração</div>
        {configuracao.map((item) => (
          <a key={item.chave} href={`#${item.chave}`} className="nav-item">
            <span>{item.rotulo}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-rodape">
        <button type="button" className="conta">
          <span className="avatar -sm" aria-hidden="true">
            {iniciais('Diego Prado')}
          </span>
          <span className="conta-texto">
            <span className="conta-nome">Diego Prado</span>
            <span className="conta-empresa">Suporte N1 · Norty</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
