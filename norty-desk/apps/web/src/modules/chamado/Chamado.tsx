import type { TicketListItem } from '@norty-desk/shared';

import { EVENTOS } from '../../lib/demonstracao';
import {
  MODIFICADOR_PRIORIDADE,
  ROTULO_CANAL,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS,
  dataCurta,
  duracaoCurta,
  estadoSla,
  modificadorCanal,
  seloStatus,
} from '../../lib/formato';
import { Conversa } from './Conversa';

/**
 * Tela do chamado: conversa à esquerda, propriedades no trilho da
 * direita (`docs/02-gap-analysis.md`, item 11).
 *
 * O layout é o `.grade-conteudo-trilho` do LICITA+ — a mesma grade que
 * lá serve a "edital + resumo" serve aqui a "conversa + propriedades".
 */
export function Chamado({ chamado }: { chamado: TicketListItem }) {
  const compromisso = chamado.commitments[0];

  return (
    <div className="grade-conteudo-trilho">
      <Conversa eventos={EVENTOS} />

      <aside className="card trilho-fixo" aria-label="Propriedades do chamado">
        <div className="card-corpo pilha-sm">
          <Linha rotulo="Status">
            <span className={`selo ${seloStatus(chamado.status)}`}>
              {ROTULO_STATUS[chamado.status]}
            </span>
          </Linha>

          <Linha rotulo="Prioridade">
            {/* Número e palavra: a informação nunca depende da cor. */}
            <span className={`prio ${MODIFICADOR_PRIORIDADE[chamado.priority]}`}>
              <span className="prio-ponto" aria-hidden="true" />
              {chamado.priority} · {ROTULO_PRIORIDADE[chamado.priority]}
            </span>
          </Linha>

          <Linha rotulo="Urgência × impacto">
            <span className="num">
              {chamado.urgency} × {chamado.impact}
            </span>
          </Linha>

          {compromisso ? (
            <Linha rotulo={`${compromisso.kind} ${compromisso.target}`}>
              <span className={`sla-selo ${estadoSla(compromisso.remainingSeconds)}`}>
                {duracaoCurta(compromisso.remainingSeconds)}
              </span>
            </Linha>
          ) : null}

          <Linha rotulo="Categoria">{chamado.category?.name ?? '—'}</Linha>
          <Linha rotulo="Solicitante">{chamado.requester?.name ?? '—'}</Linha>
          <Linha rotulo="Atribuído">
            {chamado.assignedUser?.name ?? chamado.assignedTeam?.name ?? '—'}
          </Linha>

          <Linha rotulo="Canal de origem">
            <span className="linha" style={{ gap: 6 }}>
              <span className={`canal ${modificadorCanal(chamado.originChannel)}`} />
              {ROTULO_CANAL[chamado.originChannel]}
            </span>
          </Linha>

          <Linha rotulo="Aberto em">
            <span className="num">{dataCurta(chamado.createdAt)}</span>
          </Linha>
        </div>

        <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
          <button type="button" className="btn -secundario -sm">
            Atribuir
          </button>
          <button type="button" className="btn -secundario -sm">
            Pausar
          </button>
          <button type="button" className="btn -sucesso -sm" style={{ marginLeft: 'auto' }}>
            Resolver
          </button>
        </div>
      </aside>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="linha-entre" style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}>
      <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)', flex: 'none' }}>
        {rotulo}
      </span>
      <span style={{ textAlign: 'right', fontSize: 'var(--t-corpo-sm)', minWidth: 0 }}>
        {children}
      </span>
    </div>
  );
}
