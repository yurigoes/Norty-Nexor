import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { TicketQuery, TicketStatus } from '@norty-desk/shared';

import { useRecurso } from '../../auth/Autenticacao';
import * as api from '../../api/endpoints';
import {
  MODIFICADOR_PRIORIDADE,
  ROTULO_CANAL,
  ROTULO_STATUS,
  dataCurta,
  duracaoCurta,
  estadoSla,
  modificadorCanal,
  seloStatus,
} from '../../lib/formato';

type Visao = { chave: string; rotulo: string; filtro: Record<string, string> };

const VISOES: Visao[] = [
  { chave: 'time', rotulo: 'Do meu time', filtro: {} },
  { chave: 'meus', rotulo: 'Meus', filtro: { assignedUserId: 'me' } },
  { chave: 'sem', rotulo: 'Sem atribuição', filtro: { semAtribuicao: 'true' } },
  { chave: 'sla', rotulo: 'SLA estourado', filtro: { slaBreached: 'true' } },
  { chave: 'abertos', rotulo: 'Em aberto', filtro: { status: 'NOVO,ATRIBUIDO,PLANEJADO,PENDENTE' } },
];

/**
 * A fila de trabalho.
 *
 * O filtro mora na URL: um agente manda o link da visão para o colega e
 * o colega vê a mesma coisa. Estado de tela em `useState` não sobrevive
 * a um F5 nem cabe num link.
 */
export function Fila() {
  const navegar = useNavigate();
  const [parametros, definirParametros] = useSearchParams();

  const filtro = useMemo<TicketQuery & { semAtribuicao?: boolean }>(() => {
    const f: Record<string, unknown> = {};
    for (const [chave, valor] of parametros.entries()) f[chave] = valor;
    return f as TicketQuery;
  }, [parametros]);

  const chave = parametros.toString();
  const { dado, erro, carregando } = useRecurso(() => api.listarChamados(filtro), [chave]);

  function aplicar(visao: Visao) {
    const proximos = new URLSearchParams();
    // A busca sobrevive à troca de visão; o resto do filtro, não.
    const q = parametros.get('q');
    if (q) proximos.set('q', q);
    for (const [k, v] of Object.entries(visao.filtro)) proximos.set(k, v);
    definirParametros(proximos);
  }

  const visaoAtual =
    VISOES.find((v) =>
      Object.entries(v.filtro).every(([k, valor]) => parametros.get(k) === valor),
    ) ?? VISOES[0];

  return (
    <div className="pilha">
      <div className="abas" role="tablist" aria-label="Visões da fila">
        {VISOES.map((visao) => (
          <button
            key={visao.chave}
            type="button"
            role="tab"
            className="aba"
            aria-selected={visao.chave === visaoAtual.chave}
            onClick={() => aplicar(visao)}
          >
            {visao.rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro.message}</span>
        </div>
      ) : null}

      {carregando ? (
        <div className="tabela-caixa" style={{ padding: 'var(--e-5)' }}>
          <div className="pilha-sm">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="sk sk-linha" />
            ))}
          </div>
        </div>
      ) : !dado || dado.data.length === 0 ? (
        <div className="tabela-caixa">
          <div className="vazio">
            <div className="vazio-arte" aria-hidden="true">
              <span style={{ transform: 'rotate(-45deg)' }}>✓</span>
            </div>
            <h3>Nada nesta visão</h3>
            <p>Quando um chamado cair neste filtro, ele aparece aqui.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="tabela-caixa fila-tabela">
            <div className="tabela-rolagem">
              <table className="tabela -densa">
                <thead>
                  <tr>
                    <th scope="col">Nº</th>
                    <th scope="col">Assunto</th>
                    <th scope="col">Status</th>
                    <th scope="col">Prioridade</th>
                    <th scope="col">Solicitante</th>
                    <th scope="col">Atribuído</th>
                    <th scope="col">SLA</th>
                    <th scope="col">Atualizado</th>
                  </tr>
                </thead>
                <tbody>
                  {dado.data.map((chamado) => {
                    const compromisso = chamado.commitments[0];
                    return (
                      <tr key={chamado.id} onClick={() => navegar(`/chamados/${chamado.id}`)}>
                        <td className="mono">#{chamado.number}</td>
                        <td>
                          <span className="linha" style={{ gap: 'var(--e-2)' }}>
                            <span
                              className={`canal ${modificadorCanal(chamado.originChannel)}`}
                              title={`Aberto por ${ROTULO_CANAL[chamado.originChannel]}`}
                            />
                            <span className="tabela-titulo-celula">{chamado.subject}</span>
                          </span>
                        </td>
                        <td>
                          <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
                            {ROTULO_STATUS[chamado.status]}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`prio -traco ${MODIFICADOR_PRIORIDADE[chamado.priority]}`}
                          >
                            <span className="prio-ponto" aria-hidden="true" />
                            {chamado.priority}
                          </span>
                        </td>
                        <td>{chamado.requester?.name ?? '—'}</td>
                        <td>{chamado.assignedUser?.name ?? chamado.assignedTeam?.name ?? '—'}</td>
                        <td>
                          {compromisso ? (
                            <span className={`sla ${estadoSla(compromisso.remainingSeconds)}`}>
                              {duracaoCurta(compromisso.remainingSeconds)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="num">{dataCurta(chamado.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="fila-cartoes pilha-sm">
            {dado.data.map((chamado) => {
              const compromisso = chamado.commitments[0];
              return (
                <button
                  key={chamado.id}
                  type="button"
                  className="chamado-card"
                  onClick={() => navegar(`/chamados/${chamado.id}`)}
                >
                  <div className="pilha-sm" style={{ textAlign: 'left', minWidth: 0 }}>
                    <span className="chamado-card-titulo">
                      <span className="mono">#{chamado.number}</span> {chamado.subject}
                    </span>
                    <span className="chamado-card-meta">
                      <span className="linha" style={{ gap: 5 }}>
                        <span className={`canal ${modificadorCanal(chamado.originChannel)}`} />
                        {ROTULO_CANAL[chamado.originChannel]}
                      </span>
                      <span>{chamado.requester?.name ?? '—'}</span>
                      <span className="num">{dataCurta(chamado.updatedAt)}</span>
                    </span>
                  </div>
                  <div className="chamado-card-lado">
                    <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
                      {ROTULO_STATUS[chamado.status]}
                    </span>
                    {compromisso ? (
                      <span className={`sla ${estadoSla(compromisso.remainingSeconds)}`}>
                        {duracaoCurta(compromisso.remainingSeconds)}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {dado.nextCursor ? (
            <div className="paginacao">
              <span className="suave" style={{ fontSize: 'var(--t-micro)' }}>
                {dado.data.length} chamados nesta página
              </span>
              <button
                type="button"
                className="btn -secundario -sm"
                onClick={() => {
                  const proximos = new URLSearchParams(parametros);
                  proximos.set('cursor', dado.nextCursor!);
                  definirParametros(proximos);
                }}
              >
                Próxima página
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
