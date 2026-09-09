import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TicketStatus } from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';
import { useAutenticacao, useRecurso } from '../../auth/Autenticacao';
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
import { Aprovacoes } from '../aprovacao/Aprovacoes';
import { AtivosDoChamado } from '../ativo/AtivosDoChamado';
import { ErrosConhecidosDoChamado } from '../problema/ErrosConhecidosDoChamado';
import { Sugestoes } from '../conhecimento/Sugestoes';
import { Conversa } from './Conversa';

export function Chamado() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can, revalidar, perfil } = useAutenticacao();
  const [erroDeAcao, setErroDeAcao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const { dado: chamado, erro, carregando } = useRecurso(() => api.obterChamado(id), [id]);
  const { dado: times } = useRecurso(() => api.listarTimes().catch(() => []), []);

  async function executar(acao: () => Promise<unknown>) {
    setErroDeAcao(null);
    setOcupado(true);
    try {
      await acao();
      revalidar();
    } catch (e) {
      setErroDeAcao(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setOcupado(false);
    }
  }

  if (carregando) {
    return (
      <div className="pilha">
        <div className="sk sk-titulo" />
        <div className="sk sk-bloco" />
      </div>
    );
  }

  if (erro || !chamado) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro?.message ?? 'Chamado não encontrado.'}</span>
      </div>
    );
  }

  const compromissos = chamado.commitments;
  const fechado = chamado.status === 'FECHADO';

  return (
    <div className="pilha">
      <div className="linha-entre">
        <button type="button" className="btn -fantasma -sm" onClick={() => navegar('/')}>
          ← Voltar para a fila
        </button>
        <span className="mono">#{chamado.number}</span>
      </div>

      <h2 style={{ fontSize: 'var(--t-h3)' }}>{chamado.subject}</h2>

      {erroDeAcao ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erroDeAcao}</span>
        </div>
      ) : null}

      <div className="grade-conteudo-trilho">
        <div className="pilha">
          <Aprovacoes ticketId={chamado.id} aoMudar={revalidar} />
          <ErrosConhecidosDoChamado
            ticketId={chamado.id}
            problemaVinculado={chamado.problem?.id ?? null}
            aoVincular={revalidar}
          />
          <Sugestoes ticketId={chamado.id} />
          <Conversa chamado={chamado} aoMudar={revalidar} />
        </div>

        <aside className="card trilho-fixo" aria-label="Propriedades do chamado">
          <div className="card-corpo pilha-sm">
            <Linha rotulo="Status">
              <span className={`selo ${seloStatus(chamado.status as TicketStatus)}`}>
                {ROTULO_STATUS[chamado.status]}
              </span>
            </Linha>

            <Linha rotulo="Prioridade">
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

            {compromissos.map((c) => (
              <Linha key={`${c.kind}-${c.target}`} rotulo={`${c.kind} ${c.target}`}>
                {c.achievedAt ? (
                  <span className="selo -sucesso">cumprido</span>
                ) : (
                  <span className={`sla-selo ${estadoSla(c.remainingSeconds)}`}>
                    {duracaoCurta(c.remainingSeconds)}
                  </span>
                )}
              </Linha>
            ))}

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

            {chamado.pendingReason ? (
              <Linha rotulo="Pendente por">{chamado.pendingReason.name}</Linha>
            ) : null}

            {chamado.problem ? (
              <Linha rotulo="Problema">
                <Link to={`/problemas/${chamado.problem.id}`}>
                  <span className="mono">P#{chamado.problem.number}</span>{' '}
                  {chamado.problem.title}
                </Link>
              </Linha>
            ) : null}

            <AtivosDoChamado ticketId={chamado.id} />
          </div>

          <div className="card-rodape pilha-sm">
            {can('chamado:atribuir') && times && times.length > 0 && !fechado ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="atribuir-time">
                  Atribuir ao time
                </label>
                <select
                  id="atribuir-time"
                  className="select"
                  value={chamado.assignedTeam?.id ?? ''}
                  disabled={ocupado}
                  onChange={(e) =>
                    void executar(() => api.atribuir(chamado.id, { teamId: e.target.value }))
                  }
                >
                  <option value="">Sem time</option>
                  {times.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
              {can('chamado:atribuir:a-mim') && !fechado ? (
                <button
                  type="button"
                  className="btn -secundario -sm"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(() =>
                      api.atribuir(chamado.id, { userId: perfil!.user.id }),
                    )
                  }
                >
                  Pegar para mim
                </button>
              ) : null}

              {can('chamado:resolver') && !fechado && chamado.status !== 'SOLUCIONADO' ? (
                <button
                  type="button"
                  className="btn -sucesso -sm"
                  disabled={ocupado}
                  onClick={() =>
                    void executar(() => api.resolver(chamado.id, 'Resolvido pelo atendimento.'))
                  }
                >
                  Resolver
                </button>
              ) : null}

              {can('chamado:fechar') && !fechado ? (
                <button
                  type="button"
                  className="btn -secundario -sm"
                  disabled={ocupado}
                  onClick={() => void executar(() => api.fechar(chamado.id))}
                >
                  Fechar
                </button>
              ) : null}

              {can('chamado:reabrir') && fechado ? (
                <button
                  type="button"
                  className="btn -primario -sm"
                  disabled={ocupado}
                  onClick={() => void executar(() => api.reabrir(chamado.id, 'Reaberto.'))}
                >
                  Reabrir
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
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
