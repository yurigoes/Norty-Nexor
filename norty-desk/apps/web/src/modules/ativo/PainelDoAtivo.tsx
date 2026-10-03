import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ROTULO_FACE_DO_PAINEL,
  ROTULO_TIPO_DE_ZONA,
  type CelulaDoPainelDoAtivo,
  type FaceDoPainelDoAtivo,
  type PainelDoAtivo,
} from '@norty-desk/shared';

import { painelDoAtivo } from '../../api/painel';

/**
 * O painel do equipamento desenhado: uma caixinha por posição, na grade
 * do modelo.
 *
 * Para que serve, numa frase: o chamado diz "a internet da sala 3 caiu",
 * o cadastro diz que a sala 3 vai para a porta 17, e o painel diz que a
 * porta 17 é a nona de cima na segunda fileira. Sem o desenho, o técnico
 * de plantão conta RJ45 com o dedo dentro de um rack escuro.
 *
 * Fica calado quando não há painel: equipamento sem modelo, ou modelo sem
 * estêncil cadastrado. Desenhar uma grade vazia pareceria defeito.
 */
export function PainelDoAtivoCard({ assetId }: { assetId: string }) {
  const [painel, setPainel] = useState<PainelDoAtivo | 'carregando'>('carregando');

  useEffect(() => {
    let vivo = true;
    void painelDoAtivo(assetId)
      .then((p) => {
        if (vivo) setPainel(p);
      })
      .catch(() => {
        if (vivo) setPainel(null);
      });
    return () => {
      vivo = false;
    };
  }, [assetId]);

  if (painel === 'carregando' || painel === null) return null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h2>Painel</h2>
          <p className="suave">
            Como as portas ficam no equipamento, pelo painel do modelo{' '}
            <strong>{painel.model.name}</strong>.
          </p>
        </div>
      </div>

      <div className="card-corpo pilha-sm">
        {painel.faces.map((face) => (
          <Face key={face.face} face={face} />
        ))}

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

        {painel.outside.length > 0 ? (
          /*
           * O aviso de que o painel e o equipamento discordam: porta 25
           * num switch de 24, ou porta sem número no nome. Esconder seria
           * fazer um desenho incompleto parecer completo.
           */
          <div className="alerta-bloco" role="status">
            <span aria-hidden="true">!</span>
            <span>
              {painel.outside.length === 1 ? 'Uma porta não tem' : `${painel.outside.length} portas não têm`}{' '}
              lugar neste painel:{' '}
              <span className="mono">{painel.outside.map((p) => p.name).join(', ')}</span>. Confira a
              grade no catálogo do modelo, ou o nome da porta no equipamento.
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Face({ face }: { face: FaceDoPainelDoAtivo }) {
  return (
    <div className="pilha-sm">
      <strong className="campo-rotulo">{ROTULO_FACE_DO_PAINEL[face.face]}</strong>
      <div style={{ overflowX: 'auto' }}>
        <div
          className="painel"
          style={{
            gridTemplateColumns: `repeat(${face.columns}, var(--painel-celula))`,
            gridTemplateRows: `repeat(${face.rows}, var(--painel-celula))`,
          }}
        >
          {face.cells.map((c) => (
            <Celula key={`${c.column}:${c.row}`} celula={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** O que a caixinha diz, em texto — é o `title`, e é o que o leitor de tela lê. */
function descrever(c: CelulaDoPainelDoAtivo): string {
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

function Celula({ celula }: { celula: CelulaDoPainelDoAtivo }) {
  const porta = celula.ports[0];
  const ligada = Boolean(porta?.connectedTo);
  const naoEPorta = celula.kind !== 'PORTA';
  const vazia = !naoEPorta && celula.numero === null;

  const classe = [
    'painel-celula',
    ligada ? '-ligada' : '',
    naoEPorta ? '-outro' : '',
    vazia ? '-vazia' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dentro = naoEPorta ? (celula.label ?? '·').slice(0, 3) : (celula.numero ?? '');

  // Com cabo, a caixinha leva ao equipamento do outro lado: é a pergunta
  // seguinte de quem está olhando o painel ("ligada em quê?").
  if (ligada && porta?.connectedTo) {
    return (
      <Link
        className={classe}
        style={{ gridColumn: celula.column, gridRow: celula.row }}
        to={`/ativos/${porta.connectedTo.asset.id}`}
        title={descrever(celula)}
      >
        {dentro}
      </Link>
    );
  }

  return (
    <span
      className={classe}
      style={{ gridColumn: celula.column, gridRow: celula.row }}
      title={descrever(celula)}
    >
      {dentro}
    </span>
  );
}
