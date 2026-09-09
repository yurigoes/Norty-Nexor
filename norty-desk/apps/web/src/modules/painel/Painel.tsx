import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FatiaDeContagem, PainelView, RelatorioSlaView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  baixarCsvDeSla,
  painelDaOrganizacao,
  painelDoAgente,
  painelDoTime,
  relatorioDeSla,
  type Periodo,
} from '../../api/paineis';
import { useAutenticacao } from '../../auth/Autenticacao';

const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: '7d', rotulo: '7 dias' },
  { chave: '30d', rotulo: '30 dias' },
  { chave: '90d', rotulo: '90 dias' },
  { chave: '12m', rotulo: '12 meses' },
];

type Escopo = 'agente' | 'time' | 'organizacao';

/**
 * O painel.
 *
 * Cada número traz o filtro que o reproduz: clicar em "com SLA
 * estourado" abre a fila com exatamente aqueles chamados. O painel do
 * GLPI é um mostrador — dá o número e não diz de onde ele veio, e por
 * isso ninguém confia nele o suficiente para agir.
 */
export function Painel() {
  const { can } = useAutenticacao();

  const escopos = useMemo(
    () =>
      (
        [
          { chave: 'agente' as const, rotulo: 'Meu trabalho', permissao: 'painel:proprio' as const },
          { chave: 'time' as const, rotulo: 'Meu time', permissao: 'painel:time' as const },
          {
            chave: 'organizacao' as const,
            rotulo: 'Organização',
            permissao: 'painel:organizacao' as const,
          },
        ] as const
      ).filter((e) => can(e.permissao)),
    [can],
  );

  const [escopo, setEscopo] = useState<Escopo>(escopos[0]?.chave ?? 'agente');
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [painel, setPainel] = useState<PainelView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const busca =
      escopo === 'agente'
        ? painelDoAgente(periodo)
        : escopo === 'time'
          ? painelDoTime(periodo)
          : painelDaOrganizacao(periodo);

    setPainel(await busca);
  }, [escopo, periodo]);

  useEffect(() => {
    setPainel(null);
    setErro(null);
    void carregar().catch((e: unknown) =>
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar o painel.'),
    );
  }, [carregar]);

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Painel</h2>
          <p>
            Cada número leva à fila que o formou. Sem esse caminho de volta, indicador é
            adivinhação.
          </p>
        </div>

        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <select
            className="select -auto"
            aria-label="Período"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
          >
            {PERIODOS.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      {escopos.length > 1 ? (
        <div className="abas" role="tablist" aria-label="Escopo do painel">
          {escopos.map((e) => (
            <button
              key={e.chave}
              type="button"
              role="tab"
              className="aba"
              aria-selected={escopo === e.chave}
              onClick={() => setEscopo(e.chave)}
            >
              {e.rotulo}
            </button>
          ))}
        </div>
      ) : null}

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!painel ? (
        <div className="grade grade-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="sk sk-bloco" />
          ))}
        </div>
      ) : (
        <>
          <div className="grade grade-4">
            {painel.indicadores.map((indicador) => (
              <Numero key={indicador.rotulo} indicador={indicador} />
            ))}
          </div>

          <div className="grade grade-2">
            <Barras titulo="Em aberto por status" fatias={painel.porStatus} />
            <Barras titulo="Em aberto por prioridade" fatias={painel.porPrioridade} />
          </div>

          <div className="grade grade-2">
            <Barras titulo="Abertos por canal" fatias={painel.porCanal} />
            <Linha titulo="Abertos e resolvidos por dia" dias={painel.porDia} />
          </div>

          {can('relatorio:exportar') ? <Sla periodo={periodo} /> : null}
        </>
      )}
    </div>
  );
}

function Numero({ indicador }: { indicador: PainelView['indicadores'][number] }) {
  const corpo = (
    <div className="stat">
      <div className="stat-topo">
        <span className="stat-rotulo">{indicador.rotulo}</span>
      </div>
      <span className="stat-num">
        {indicador.valor}
        {indicador.unidade ? (
          <span style={{ fontSize: 'var(--t-corpo)', marginLeft: 3 }}>{indicador.unidade}</span>
        ) : null}
      </span>
    </div>
  );

  // O indicador que sabe se reproduzir vira link para a fila.
  return indicador.filtro ? (
    <Link to={`/${indicador.filtro}`} style={{ textDecoration: 'none' }}>
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

function Barras({ titulo, fatias }: { titulo: string; fatias: FatiaDeContagem[] }) {
  const maior = Math.max(...fatias.map((f) => f.total), 1);

  return (
    <section className="card">
      <div className="card-topo">
        <h3 className="card-titulo">{titulo}</h3>
      </div>
      <div className="card-corpo pilha-sm">
        {fatias.length === 0 ? (
          <p className="campo-ajuda">Nada no período.</p>
        ) : (
          fatias.map((fatia) => (
            <div key={fatia.chave} className="pilha-sm" style={{ gap: 4 }}>
              <div className="linha-entre" style={{ flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 'var(--t-corpo-sm)' }}>{fatia.rotulo}</span>
                <span className="num" style={{ fontSize: 'var(--t-corpo-sm)' }}>
                  {fatia.total}
                </span>
              </div>
              <div className="progresso-trilho">
                <span
                  className="progresso-fill"
                  style={{ width: `${(fatia.total / maior) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/**
 * O volume diário.
 *
 * SVG desenhado à mão em vez de uma biblioteca de gráficos: são duas
 * polilinhas, e trazer 200 KB de dependência para isso encarece cada
 * carregamento do aplicativo pelo resto da vida dele.
 */
function Linha({
  titulo,
  dias,
}: {
  titulo: string;
  dias: { dia: string; abertos: number; resolvidos: number }[];
}) {
  const maior = Math.max(...dias.flatMap((d) => [d.abertos, d.resolvidos]), 1);
  const largura = 100;
  const altura = 40;

  const caminho = (pegar: (d: (typeof dias)[number]) => number) =>
    dias
      .map((d, i) => {
        const x = dias.length === 1 ? 0 : (i / (dias.length - 1)) * largura;
        const y = altura - (pegar(d) / maior) * altura;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">{titulo}</h3>
          <p className="card-sub">
            <span style={{ color: 'var(--azul-600)' }}>■</span> abertos ·{' '}
            <span style={{ color: 'var(--verde-600)' }}>■</span> resolvidos
          </p>
        </div>
      </div>
      <div className="card-corpo">
        {dias.length === 0 ? (
          <p className="campo-ajuda">Nada no período.</p>
        ) : (
          <svg
            viewBox={`0 0 ${largura} ${altura}`}
            preserveAspectRatio="none"
            style={{ width: '100%', height: 140 }}
            role="img"
            aria-label={`${titulo}: pico de ${maior} num dia`}
          >
            <path
              d={caminho((d) => d.abertos)}
              fill="none"
              stroke="var(--azul-600)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={caminho((d) => d.resolvidos)}
              fill="none"
              stroke="var(--verde-600)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {/* Um ponto em cada dia com movimento. Sem eles, um único dia
                acima de zero no meio de trinta zerados vira uma parede
                vertical que não se lê como "dois chamados na terça". */}
            {dias.map((d, i) =>
              d.abertos > 0 || d.resolvidos > 0 ? (
                <Ponto
                  key={d.dia}
                  x={dias.length === 1 ? 0 : (i / (dias.length - 1)) * largura}
                  yAbertos={altura - (d.abertos / maior) * altura}
                  yResolvidos={altura - (d.resolvidos / maior) * altura}
                />
              ) : null,
            )}
          </svg>
        )}
      </div>
    </section>
  );
}

function Sla({ periodo }: { periodo: Periodo }) {
  const [agrupar, setAgrupar] = useState<RelatorioSlaView['agrupamento']>('categoria');
  const [relatorio, setRelatorio] = useState<RelatorioSlaView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setRelatorio(null);
    void relatorioDeSla(periodo, agrupar)
      .then(setRelatorio)
      .catch(() => setErro('Não foi possível carregar o relatório de SLA.'));
  }, [periodo, agrupar]);

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Cumprimento de SLA</h3>
          <p className="card-sub">
            O que ainda corre aparece como “em aberto” e não entra no percentual — contá-lo
            como cumprido inflaria o número.
          </p>
        </div>

        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <select
            className="select -auto"
            aria-label="Agrupar por"
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as RelatorioSlaView['agrupamento'])}
          >
            <option value="categoria">Por categoria</option>
            <option value="time">Por time</option>
            <option value="prioridade">Por prioridade</option>
            <option value="acordo">Por acordo</option>
          </select>

          <button
            type="button"
            className="btn -secundario -sm"
            onClick={() => void baixarCsvDeSla(periodo, agrupar).catch(() => setErro('Exportação falhou.'))}
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {!relatorio ? (
        <div className="card-corpo">
          <div className="sk sk-bloco" />
        </div>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>{agrupar}</th>
                <th className="-num">Total</th>
                <th className="-num">Cumpridos</th>
                <th className="-num">Violados</th>
                <th className="-num">Em aberto</th>
                <th className="-num">Cumprimento</th>
              </tr>
            </thead>
            <tbody>
              {relatorio.linhas.map((linha) => (
                <tr key={linha.chave}>
                  <td className="tabela-titulo-celula">{linha.rotulo}</td>
                  <td className="-num">{linha.total}</td>
                  <td className="-num">{linha.cumpridos}</td>
                  <td className="-num">{linha.violados}</td>
                  <td className="-num">{linha.emAberto}</td>
                  <td className="-num">
                    <span className={`sla-selo ${faixa(linha.percentual)}`}>
                      {linha.percentual}%
                    </span>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="tabela-titulo-celula">Geral</td>
                <td className="-num">{relatorio.geral.total}</td>
                <td className="-num">{relatorio.geral.cumpridos}</td>
                <td className="-num">{relatorio.geral.violados}</td>
                <td className="-num">{relatorio.geral.emAberto}</td>
                <td className="-num">
                  <span className={`sla-selo ${faixa(relatorio.geral.percentual)}`}>
                    {relatorio.geral.percentual}%
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * O ponto de um dia.
 *
 * O `viewBox` é esticado (`preserveAspectRatio: none`), então um
 * `<circle>` viraria elipse. Um retângulo minúsculo com
 * `vector-effect` sobrevive à distorção.
 */
function Ponto({
  x,
  yAbertos,
  yResolvidos,
}: {
  x: number;
  yAbertos: number;
  yResolvidos: number;
}) {
  return (
    <>
      <line
        x1={x}
        y1={yAbertos}
        x2={x}
        y2={yAbertos}
        stroke="var(--azul-600)"
        strokeWidth="5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={x}
        y1={yResolvidos}
        x2={x}
        y2={yResolvidos}
        stroke="var(--verde-600)"
        strokeWidth="5"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </>
  );
}

/** 95% é o corte de contrato mais comum; abaixo de 85% é vermelho. */
function faixa(percentual: number): string {
  if (percentual >= 95) return '-ok';
  if (percentual >= 85) return '-atencao';
  return '-estourado';
}
