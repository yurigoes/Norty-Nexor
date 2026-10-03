import { Link } from 'react-router-dom';
import {
  ROTULO_FACE_DO_PAINEL,
  ROTULO_TIPO_DE_ZONA,
  type CelulaDoPainelDoAtivo,
  type FaceDoPainelDoAtivo,
  type PainelDoAtivo,
} from '@norty-desk/shared';

/**
 * O desenho do painel, em dois tamanhos.
 *
 * Mora aqui, e não dentro de uma tela, porque é o mesmo desenho em três
 * lugares: a ficha do equipamento, a elevação do rack (miúdo, dentro do
 * U) e o item escolhido no rack. Três cópias seriam três chances de o
 * painel discordar de si mesmo de uma tela para outra.
 */

/** O que a caixinha diz, em texto — é o `title`, e é o que o leitor de tela lê. */
function descreverCelula(c: CelulaDoPainelDoAtivo): string {
  const onde = `coluna ${c.column}, linha ${c.row}`;

  if (c.kind !== 'PORTA') {
    return `${c.label ?? ROTULO_TIPO_DE_ZONA[c.kind]} — ${onde}`;
  }
  if (c.numero === null) return `Sem porta — ${onde}`;

  const porta = c.ports[0];
  if (!porta) return `Porta ${c.numero} — ${onde}. Nenhuma porta cadastrada com este número.`;

  const cabo = porta.connectedTo
    ? `ligada a ${porta.connectedTo.asset.name} (${porta.connectedTo.name})`
    : 'sem cabo';

  const extra = [
    porta.vlan === null ? null : `VLAN ${porta.vlan}`,
    porta.currentIp,
    c.ports.length > 1 ? `${c.ports.length} portas com este número` : null,
  ].filter(Boolean);

  return `Porta ${c.numero} · ${porta.name} — ${cabo}${extra.length ? ` · ${extra.join(' · ')}` : ''} — ${onde}`;
}

/** As classes de uma posição, pelo que há nela. */
function classeDaCelula(c: CelulaDoPainelDoAtivo, extra = ''): string {
  const naoEPorta = c.kind !== 'PORTA';

  return [
    'painel-celula',
    c.ports[0]?.connectedTo ? '-ligada' : '',
    naoEPorta ? '-outro' : '',
    !naoEPorta && c.numero === null ? '-vazia' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

const estiloDaGrade = (face: FaceDoPainelDoAtivo, celula: string) => ({
  gridTemplateColumns: `repeat(${face.columns}, var(${celula}))`,
  gridTemplateRows: `repeat(${face.rows}, var(${celula}))`,
});

export function FaceDoPainel({ face }: { face: FaceDoPainelDoAtivo }) {
  return (
    <div className="pilha-sm">
      <strong className="campo-rotulo">{ROTULO_FACE_DO_PAINEL[face.face]}</strong>
      <div style={{ overflowX: 'auto' }}>
        <div className="painel" style={estiloDaGrade(face, '--painel-celula')}>
          {face.cells.map((c) => (
            <Celula key={`${c.column}:${c.row}`} celula={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Celula({ celula }: { celula: CelulaDoPainelDoAtivo }) {
  const porta = celula.ports[0];
  const dentro = celula.kind === 'PORTA' ? (celula.numero ?? '') : (celula.label ?? '·').slice(0, 3);

  // Com cabo, a caixinha leva ao equipamento do outro lado: é a pergunta
  // seguinte de quem está olhando o painel ("ligada em quê?").
  if (porta?.connectedTo) {
    return (
      <Link
        className={classeDaCelula(celula)}
        style={{ gridColumn: celula.column, gridRow: celula.row }}
        to={`/ativos/${porta.connectedTo.asset.id}`}
        title={descreverCelula(celula)}
      >
        {dentro}
      </Link>
    );
  }

  return (
    <span
      className={classeDaCelula(celula)}
      style={{ gridColumn: celula.column, gridRow: celula.row }}
      title={descreverCelula(celula)}
    >
      {dentro}
    </span>
  );
}

/**
 * O painel miúdo, do tamanho de caber dentro de um U na elevação do
 * rack.
 *
 * Sem número: em nove pixels não cabe algarismo legível, e número
 * ilegível é pior que número nenhum — passa a impressão de que se pode
 * ler. O que ele mostra é a **forma** do painel e quanto dele está em
 * uso; o número vem no `title` e no desenho grande, a um clique.
 */
export function PainelMiudo({ face }: { face: FaceDoPainelDoAtivo }) {
  return (
    <span
      className="painel -mini"
      style={estiloDaGrade(face, '--painel-celula-mini')}
      aria-hidden="true"
    >
      {face.cells.map((c) => (
        <span
          key={`${c.column}:${c.row}`}
          className={classeDaCelula(c)}
          style={{ gridColumn: c.column, gridRow: c.row }}
          title={descreverCelula(c)}
        />
      ))}
    </span>
  );
}

/** A legenda. Três estados, que é o que se decide olhando. */
export function LegendaDoPainel() {
  return (
    <div className="painel-legenda">
      <span className="painel-legenda-item">
        <span className="painel-amostra -ligada" aria-hidden="true" /> com cabo
      </span>
      <span className="painel-legenda-item">
        <span className="painel-amostra" aria-hidden="true" /> livre
      </span>
      <span className="painel-legenda-item">
        <span className="painel-amostra -outro" aria-hidden="true" /> não é porta de rede
      </span>
    </div>
  );
}

/**
 * O desenho inteiro: as faces, a legenda e o aviso das portas que não
 * têm lugar.
 *
 * O aviso existe porque esconder a porta sem lugar faria um desenho
 * incompleto parecer completo — que é o único jeito de um estêncil
 * mentir.
 */
export function DesenhoDoPainel({ painel }: { painel: NonNullable<PainelDoAtivo> }) {
  return (
    <div className="pilha-sm">
      {painel.faces.map((face) => (
        <FaceDoPainel key={face.face} face={face} />
      ))}

      <LegendaDoPainel />

      {painel.outside.length > 0 ? (
        <div className="alerta-bloco" role="status">
          <span aria-hidden="true">!</span>
          <span>
            {painel.outside.length === 1
              ? 'Uma porta não tem'
              : `${painel.outside.length} portas não têm`}{' '}
            lugar neste painel:{' '}
            <span className="mono">{painel.outside.map((p) => p.name).join(', ')}</span>. Confira a
            grade no catálogo do modelo, ou o nome da porta no equipamento.
          </span>
        </div>
      ) : null}
    </div>
  );
}
