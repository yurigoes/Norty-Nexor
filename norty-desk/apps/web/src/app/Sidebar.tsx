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
    { chave: 'sla', rotulo: 'SLA estourando', contador: contadores.slaEstourando },
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
      <div className="sidebar__marca">
        Norty Desk<span className="sidebar__marca-acento">.</span>
      </div>

      <nav className="sidebar__nav" aria-label="Navegação principal">
        <div className="sidebar__grupo">Fila</div>
        {visoes.map((visao) => (
          <a
            key={visao.chave}
            href={`#${visao.chave}`}
            className="sidebar__item"
            aria-current={visao.atual ? 'page' : undefined}
            onClick={(evento) => {
              evento.preventDefault();
              aoNavegar();
            }}
          >
            <span>{visao.rotulo}</span>
            <span className="sidebar__contador">{visao.contador}</span>
          </a>
        ))}

        <div className="sidebar__grupo">Trabalho</div>
        {trabalho.map((item) => (
          <a key={item.chave} href={`#${item.chave}`} className="sidebar__item">
            {item.rotulo}
          </a>
        ))}

        <div className="sidebar__grupo">Configuração</div>
        {configuracao.map((item) => (
          <a key={item.chave} href={`#${item.chave}`} className="sidebar__item">
            {item.rotulo}
          </a>
        ))}
      </nav>
    </aside>
  );
}
