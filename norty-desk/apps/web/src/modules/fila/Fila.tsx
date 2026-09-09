import { useMemo, useState } from 'react';
import type { TicketListItem } from '@norty-desk/shared';

import {
  ROTULO_CANAL,
  ROTULO_STATUS,
  classeStatus,
  dataCurta,
  duracaoCurta,
  estadoSla,
} from '../../lib/formato';

type Visao = 'todos' | 'meus' | 'sem-atribuicao' | 'sla';

const VISOES: { chave: Visao; rotulo: string }[] = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'meus', rotulo: 'Meus' },
  { chave: 'sem-atribuicao', rotulo: 'Sem atribuição' },
  { chave: 'sla', rotulo: 'SLA estourando' },
];

/**
 * A fila de trabalho.
 *
 * Não é a tela de busca genérica do GLPI: é a lista onde o agente passa
 * o dia, com visões salvas e densidade alta
 * (`docs/02-gap-analysis.md`, item 10).
 */
export function Fila({
  chamados,
  aoAbrir,
}: {
  chamados: TicketListItem[];
  aoAbrir: (id: string) => void;
}) {
  const [visao, setVisao] = useState<Visao>('todos');

  const visiveis = useMemo(() => {
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
  }, [chamados, visao]);

  return (
    <section className="fila">
      <header className="fila__cabecalho">
        <div className="fila__visoes">
          {VISOES.map((item) => (
            <button
              key={item.chave}
              type="button"
              className="fila__visao"
              aria-pressed={visao === item.chave}
              onClick={() => setVisao(item.chave)}
            >
              {item.rotulo}
            </button>
          ))}
        </div>
        <span className="sidebar__contador">
          {visiveis.length} {visiveis.length === 1 ? 'chamado' : 'chamados'}
        </span>
      </header>

      {visiveis.length === 0 ? (
        <p className="vazio">Nenhum chamado nesta visão.</p>
      ) : (
        <table className="tabela">
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
              const estado = compromisso ? estadoSla(compromisso.remainingSeconds) : null;

              return (
                <tr key={chamado.id} onClick={() => aoAbrir(chamado.id)}>
                  <td className="tabela__numero">#{chamado.number}</td>
                  <td>
                    <span
                      className={`canal canal--${chamado.originChannel}`}
                      title={`Aberto por ${ROTULO_CANAL[chamado.originChannel]}`}
                    />{' '}
                    <span className="tabela__assunto">{chamado.subject}</span>
                  </td>
                  <td>
                    <span className={`etiqueta ${classeStatus(chamado.status)}`}>
                      {ROTULO_STATUS[chamado.status]}
                    </span>
                  </td>
                  <td>
                    <span className={`prioridade prioridade--${chamado.priority}`}>
                      {chamado.priority}
                    </span>
                  </td>
                  <td>{chamado.requester?.name ?? '—'}</td>
                  <td>{chamado.assignedUser?.name ?? chamado.assignedTeam?.name ?? '—'}</td>
                  <td>
                    {compromisso && estado ? (
                      <span className={`sla sla--${estado}`}>
                        {duracaoCurta(compromisso.remainingSeconds)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{dataCurta(chamado.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
