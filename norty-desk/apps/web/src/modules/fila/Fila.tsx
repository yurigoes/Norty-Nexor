import { useMemo, useState } from 'react';
import type { TicketListItem } from '@norty-desk/shared';

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

type Visao = 'todos' | 'meus' | 'sem-atribuicao' | 'sla';

const VISOES: { chave: Visao; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'meus', rotulo: 'Meus' },
  { chave: 'sem-atribuicao', rotulo: 'Sem atribuição' },
  { chave: 'sla', rotulo: 'SLA estourando' },
];

function filtrar(chamados: TicketListItem[], visao: Visao): TicketListItem[] {
  switch (visao) {
    case 'sem-atribuicao':
      return chamados.filter((c) => !c.assignedTeam && !c.assignedUser);
    case 'sla':
      return chamados.filter((c) => (c.commitments[0]?.remainingSeconds ?? Infinity) < 3600);
    case 'meus':
      return chamados.filter((c) => c.assignedUser !== null);
    default:
      return chamados;
  }
}

/**
 * A fila de trabalho.
 *
 * Não é a tela de busca genérica do GLPI: é a lista onde o agente passa
 * o dia, com visões salvas e `.tabela.-densa`
 * (`docs/02-gap-analysis.md`, item 10).
 *
 * Abaixo de 760px a tabela de oito colunas não sobrevive, então a mesma
 * lista sai em `.chamado-card`.
 */
export function Fila({
  chamados,
  aoAbrir,
}: {
  chamados: TicketListItem[];
  aoAbrir: (id: string) => void;
}) {
  const [visao, setVisao] = useState<Visao>('todos');
  const visiveis = useMemo(() => filtrar(chamados, visao), [chamados, visao]);

  return (
    <div className="pilha">
      <div className="abas" role="tablist" aria-label="Visões da fila">
        {VISOES.map((item) => (
          <button
            key={item.chave}
            type="button"
            role="tab"
            className="aba"
            aria-selected={visao === item.chave}
            onClick={() => setVisao(item.chave)}
          >
            {item.rotulo}
            <span className="aba-contagem">{filtrar(chamados, item.chave).length}</span>
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
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
                  {visiveis.map((chamado) => {
                    const compromisso = chamado.commitments[0];

                    return (
                      <tr key={chamado.id} onClick={() => aoAbrir(chamado.id)}>
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
                          <span className={`selo ${seloStatus(chamado.status)}`}>
                            {ROTULO_STATUS[chamado.status]}
                          </span>
                        </td>

                        <td>
                          <span className={`prio -traco ${MODIFICADOR_PRIORIDADE[chamado.priority]}`}>
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
            {visiveis.map((chamado) => {
              const compromisso = chamado.commitments[0];

              return (
                <button
                  key={chamado.id}
                  type="button"
                  className="chamado-card"
                  onClick={() => aoAbrir(chamado.id)}
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
                    <span className={`selo ${seloStatus(chamado.status)}`}>
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
        </>
      )}
    </div>
  );
}
