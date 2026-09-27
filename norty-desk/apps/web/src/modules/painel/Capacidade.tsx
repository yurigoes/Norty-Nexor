import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CapacidadeView, RelatorioDeCusto } from '@norty-desk/shared';
import { ticketTag } from '@norty-desk/shared';

import { relatorioDeCusto } from '../../api/contratos';
import { baixarCsvDeCapacidade, capacidade, type Periodo } from '../../api/paineis';
import { dataSimples } from '../../lib/formato';

const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: '7d', rotulo: '7 dias' },
  { valor: '30d', rotulo: '30 dias' },
  { valor: '90d', rotulo: '90 dias' },
  { valor: '12m', rotulo: '12 meses' },
];

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Quanto entra contra quanto o time dá conta, e quanto custou.
 *
 * Duas perguntas de gestão, e a mesma tela: "preciso contratar?" e
 * "quanto este cliente custa?". Elas se respondem com os mesmos
 * chamados, e separá-las faria a segunda nunca ser aberta.
 *
 * A ocupação aparece **sempre ao lado de quantos chamados não têm tempo
 * apontado**. Sem esse número ela é um percentual convincente e falso:
 * ela mede o que alguém lançou, não o que se trabalhou, e um relatório
 * que esconde a própria margem de erro é pior que relatório nenhum.
 */
export function Capacidade() {
  const [periodo, setPeriodo] = useState<Periodo>('30d');
  const [dados, setDados] = useState<CapacidadeView | null>(null);
  const [custo, setCusto] = useState<RelatorioDeCusto | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [c, k] = await Promise.all([capacidade(periodo), relatorioDeCusto()]);
    setDados(c);
    setCusto(k);
  }, [periodo]);

  useEffect(() => {
    setDados(null);
    void carregar().catch(() => setErro('Não foi possível carregar o relatório.'));
  }, [carregar]);

  const confianca =
    dados && dados.totalNoPeriodo > 0
      ? 1 - dados.semApontamento / dados.totalNoPeriodo
      : null;

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Capacidade e custo</h2>
          <p>Quanto trabalho entra, quanto o time dá conta, e quanto isso custou.</p>
        </div>
        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <label className="so-leitor" htmlFor="cap-periodo">
            Período
          </label>
          <select
            id="cap-periodo"
            className="select -auto"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
          >
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn -secundario -sm"
            onClick={() => void baixarCsvDeCapacidade(periodo)}
          >
            CSV
          </button>
        </div>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {/*
        O aviso vem antes da tabela de propósito: quem lê a ocupação
        primeiro já ancorou no número, e a ressalva depois não desfaz
        isso.
      */}
      {dados && dados.semApontamento > 0 ? (
        <div className="alerta-bloco -aviso">
          <span aria-hidden="true">!</span>
          <span>
            {dados.semApontamento} de {dados.totalNoPeriodo} chamados do período não têm tempo
            apontado
            {confianca !== null ? ` (${Math.round(confianca * 100)}% medidos)` : ''}. A ocupação
            abaixo é o <strong>piso</strong> do que o time trabalhou, não o total.
          </span>
        </div>
      ) : null}

      {!dados ? (
        <div className="sk sk-bloco" />
      ) : (
        <section className="card">
          <div className="card-topo">
            <h3 className="card-titulo">Por time</h3>
            <span className="campo-ajuda">
              {dados.calendario
                ? `Expediente: ${dados.calendario.name}`
                : 'Sem calendário: contando 24 h por dia'}
            </span>
          </div>

          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Time</th>
                  <th className="-num">Pessoas</th>
                  <th className="-num">Entraram</th>
                  <th className="-num">Saíram</th>
                  <th className="-num">Em aberto</th>
                  <th className="-num">Horas apontadas</th>
                  <th className="-num">Ocupação</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l) => (
                  <tr key={l.time?.id ?? 'sem-time'}>
                    <td className="tabela-titulo-celula">{l.time?.name ?? 'Sem time'}</td>
                    <td className="-num">{l.pessoas}</td>
                    <td className="-num">{l.abertos}</td>
                    <td className="-num">{l.fechados}</td>
                    <td className="-num">
                      {/* O que sobra é o que vira fila que não anda. */}
                      {l.backlog > 0 && l.fechados < l.abertos ? (
                        <span className="selo -aviso">{l.backlog}</span>
                      ) : (
                        l.backlog
                      )}
                    </td>
                    <td className="-num">
                      {l.horasApontadas}h
                      <span className="campo-ajuda"> / {l.horasDisponiveis}h</span>
                    </td>
                    <td className="-num">
                      {l.ocupacao === null ? (
                        <span className="campo-ajuda">—</span>
                      ) : (
                        `${Math.round(l.ocupacao * 100)}%`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {custo ? (
        <section className="card">
          <div className="card-topo">
            <h3 className="card-titulo">Custo por chamado</h3>
            <span className="campo-ajuda">
              {dataSimples(custo.de)} a {dataSimples(custo.ate)}
            </span>
          </div>

          <div className="card-corpo pilha-sm">
            <div className="linha" style={{ gap: 'var(--e-4)', flexWrap: 'wrap' }}>
              <div>
                <span className="campo-ajuda" style={{ display: 'block' }}>Total lançado</span>
                <strong style={{ fontSize: 'var(--t-titulo-sm)' }}>{dinheiro(custo.total)}</strong>
              </div>
              <div>
                <span className="campo-ajuda" style={{ display: 'block' }}>Médio por chamado</span>
                <strong style={{ fontSize: 'var(--t-titulo-sm)' }}>
                  {dinheiro(custo.medioPorChamado)}
                </strong>
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  sobre {custo.chamados} com lançamento
                </span>
              </div>
            </div>

            {custo.porCliente.length > 0 ? (
              <>
                <p className="campo-ajuda" style={{ margin: 0 }}>Por empresa:</p>
                <div className="tabela-rolagem">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Empresa</th>
                        <th className="-num">Chamados</th>
                        <th className="-num">Tempo</th>
                        <th className="-num">Material</th>
                        <th className="-num">Total</th>
                        <th className="-num">Médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custo.porCliente.map((l) => (
                        <tr key={l.chave}>
                          <td className="tabela-titulo-celula">{l.rotulo}</td>
                          <td className="-num">{l.chamados}</td>
                          <td className="-num">{dinheiro(l.tempo)}</td>
                          <td className="-num">{dinheiro(l.material + l.fixo)}</td>
                          <td className="-num">{dinheiro(l.total)}</td>
                          <td className="-num">{dinheiro(l.medioPorChamado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {custo.maisCaros.length > 0 ? (
              <>
                <p className="campo-ajuda" style={{ margin: 0 }}>Os mais caros:</p>
                <ul className="lista-simples">
                  {custo.maisCaros.map((c) => (
                    <li key={c.id}>
                      <Link to={`/chamados/${c.id}`}>
                        {ticketTag(c.number)} {c.subject}
                      </Link>
                      <span className="campo-ajuda"> · {dinheiro(c.total)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
