type Contadores = {
  meus: number;
  time: number;
  semAtribuicao: number;
  slaEstourando: number;
};

/**
 * Navegação do agente.
 *
 * As visões de fila vêm primeiro porque é o que o agente abre ao chegar.
 * Configuração fica no fim: entra-se lá uma vez por mês.
 */
export function Sidebar({
  atual,
  aoNavegar,
  contadores,
}: {
  atual: string;
  aoNavegar: () => void;
  contadores: Contadores;
}) {
  const visoes = [
    { chave: 'meus', rotulo: 'Meus chamados', contador: contadores.meus },
    { chave: 'time', rotulo: 'Do meu time', contador: contadores.time },
    { chave: 'sem-atribuicao', rotulo: 'Sem atribuição', contador: contadores.semAtribuicao },
    { chave: 'sla', rotulo: 'SLA estourando', contador: contadores.slaEstourando },
  ];

  const secoes = [
    { rotulo: 'Base de conhecimento', chave: 'artigos' },
    { rotulo: 'Aprovações', chave: 'aprovacoes' },
    { rotulo: 'Painéis', chave: 'paineis' },
  ];

  const configuracao = [
    { rotulo: 'Categorias', chave: 'categorias' },
    { rotulo: 'SLA e calendários', chave: 'sla-config' },
    { rotulo: 'Canais', chave: 'canais' },
    { rotulo: 'Regras de entrada', chave: 'regras' },
    { rotulo: 'Pessoas e times', chave: 'pessoas' },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar__marca">
        Norty <strong>Desk</strong>
      </div>

      <nav className="sidebar__nav">
        <div className="sidebar__grupo">Fila</div>
        {visoes.map((visao) => (
          <a
            key={visao.chave}
            href={`#${visao.chave}`}
            className="sidebar__item"
            aria-current={atual === 'fila' && visao.chave === 'time' ? 'page' : undefined}
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
        {secoes.map((secao) => (
          <a key={secao.chave} href={`#${secao.chave}`} className="sidebar__item">
            {secao.rotulo}
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
