import type { TicketListItem } from '@norty-desk/shared';

import { EVENTOS } from '../../lib/demonstracao';
import {
  ROTULO_CANAL,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  classeStatus,
  dataCurta,
  duracaoCurta,
  estadoSla,
} from '../../lib/formato';
import { Timeline } from './Timeline';

/**
 * Tela do chamado: timeline à esquerda, propriedades à direita
 * (`docs/02-gap-analysis.md`, item 11).
 */
export function Chamado({
  chamado,
  aoVoltar,
}: {
  chamado: TicketListItem;
  aoVoltar: () => void;
}) {
  const compromisso = chamado.commitments[0];
  const estado = compromisso ? estadoSla(compromisso.remainingSeconds) : null;

  return (
    <div>
      <button type="button" className="botao botao--secundario" onClick={aoVoltar}>
        ← Voltar para a fila
      </button>

      <h1 className="titulo-tela" style={{ marginTop: 'var(--space-4)' }}>
        <span className="tabela__numero">#{chamado.number}</span> {chamado.subject}
      </h1>

      <div className="chamado">
        <Timeline eventos={EVENTOS} />

        <aside className="painel">
          <div className="painel__linha">
            <span className="painel__rotulo">Status</span>
            <span className={`etiqueta ${classeStatus(chamado.status)}`}>
              {ROTULO_STATUS[chamado.status]}
            </span>
          </div>
          <div className="painel__linha">
            <span className="painel__rotulo">Prioridade</span>
            <span className={`prioridade prioridade--${chamado.priority}`}>
              {ROTULO_PRIORIDADE[chamado.priority]}
            </span>
          </div>
          <div className="painel__linha">
            <span className="painel__rotulo">Urgência × impacto</span>
            <span>
              {chamado.urgency} × {chamado.impact}
            </span>
          </div>
          {compromisso && estado ? (
            <div className="painel__linha">
              <span className="painel__rotulo">
                {compromisso.kind} {compromisso.target}
              </span>
              <span className={`sla sla--${estado}`}>
                {duracaoCurta(compromisso.remainingSeconds)}
              </span>
            </div>
          ) : null}
          <div className="painel__linha">
            <span className="painel__rotulo">Categoria</span>
            <span>{chamado.category?.name ?? '—'}</span>
          </div>
          <div className="painel__linha">
            <span className="painel__rotulo">Solicitante</span>
            <span>{chamado.requester?.name ?? '—'}</span>
          </div>
          <div className="painel__linha">
            <span className="painel__rotulo">Atribuído</span>
            <span>{chamado.assignedUser?.name ?? chamado.assignedTeam?.name ?? '—'}</span>
          </div>
          <div className="painel__linha">
            <span className="painel__rotulo">Canal de origem</span>
            <span>
              <span className={`canal canal--${chamado.originChannel}`} />{' '}
              {ROTULO_CANAL[chamado.originChannel]}
            </span>
          </div>
          <div className="painel__linha">
            <span className="painel__rotulo">Aberto em</span>
            <span>{dataCurta(chamado.createdAt)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
