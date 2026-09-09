import { Link, useNavigate } from 'react-router-dom';
import type { TicketStatus } from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { useRecurso } from '../../auth/Autenticacao';
import {
  ROTULO_STATUS,
  dataCurta,
  duracaoCurta,
  estadoSla,
  seloStatus,
} from '../../lib/formato';

/**
 * O portal do solicitante.
 *
 * Sem fila, sem prioridade, sem canal, sem nota interna. O solicitante
 * quer saber uma coisa: em que pé está o pedido dele.
 */
export function PortalLista() {
  const navegar = useNavigate();
  const { dado, carregando } = useRecurso(() => api.listarChamados({ limit: 50 }), []);

  return (
    <div className="pilha">
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Seus chamados</h2>
          <p>Acompanhe o andamento e responda quando a equipe precisar de algo.</p>
        </div>
        <button
          type="button"
          className="btn -primario"
          onClick={() => navegar('/chamados/novo')}
        >
          Abrir chamado
        </button>
      </div>

      {carregando ? (
        <div className="pilha-sm">
          <div className="sk sk-bloco" />
          <div className="sk sk-bloco" />
        </div>
      ) : !dado || dado.data.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <div className="vazio-arte" aria-hidden="true">
              <span style={{ transform: 'rotate(-45deg)' }}>+</span>
            </div>
            <h3>Você ainda não abriu chamados</h3>
            <p>Quando abrir, eles aparecem aqui com o status e o prazo.</p>
            <button
              type="button"
              className="btn -primario"
              onClick={() => navegar('/chamados/novo')}
            >
              Abrir o primeiro
            </button>
          </div>
        </div>
      ) : (
        <div className="pilha-sm">
          {dado.data.map((chamado) => {
            const compromisso = chamado.commitments.find((c) => !c.achievedAt);

            return (
              <Link
                key={chamado.id}
                to={`/chamados/${chamado.id}`}
                className="chamado-card"
                style={{ textDecoration: 'none' }}
              >
                <div className="pilha-sm" style={{ minWidth: 0 }}>
                  <span className="chamado-card-titulo">
                    <span className="mono">#{chamado.number}</span> {chamado.subject}
                  </span>
                  <span className="chamado-card-meta">
                    <span>Aberto em {dataCurta(chamado.createdAt)}</span>
                    {chamado.assignedTeam ? <span>{chamado.assignedTeam.name}</span> : null}
                  </span>
                </div>

                <div className="chamado-card-lado">
                  <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
                    {ROTULO_STATUS[chamado.status]}
                  </span>
                  {/* O solicitante vê "resposta em até", não "SLA TTO". */}
                  {compromisso ? (
                    <span className={`sla ${estadoSla(compromisso.remainingSeconds)}`}>
                      {compromisso.remainingSeconds >= 0
                        ? `resposta em ${duracaoCurta(compromisso.remainingSeconds)}`
                        : 'prazo excedido'}
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
