import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { TicketDetail, TicketStatus } from '@norty-desk/shared';

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
import { RespostasDoFormulario } from '../formulario/CamposDinamicos';
import { EscolherModelo } from '../modelo/EscolherModelo';
import { Tarefas } from '../tarefa/Tarefas';
import { ErrosConhecidosDoChamado } from '../problema/ErrosConhecidosDoChamado';
import { Sugestoes } from '../conhecimento/Sugestoes';
import { Conversa } from './Conversa';

export function Chamado() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can, revalidar, perfil } = useAutenticacao();
  const [erroDeAcao, setErroDeAcao] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);

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
          <Aprovacoes alvo={{ kind: 'CHAMADO', id: chamado.id }} aoMudar={revalidar} />
          <ErrosConhecidosDoChamado
            ticketId={chamado.id}
            problemaVinculado={chamado.problem?.id ?? null}
            aoVincular={revalidar}
          />
          <Sugestoes ticketId={chamado.id} />
          <Tarefas chamado={chamado} aoMudar={revalidar} />
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

            {chamado.spentSeconds > 0 ? (
              <Linha rotulo="Tempo apontado">
                <span className="num">{duracaoCurta(chamado.spentSeconds)}</span>
              </Linha>
            ) : null}

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

            {chamado.change ? (
              <Linha rotulo="Mudança">
                <Link to={`/mudancas/${chamado.change.id}`}>
                  <span className="mono">M#{chamado.change.number}</span> {chamado.change.title}
                </Link>
                {/* A janela é o que quem pergunta "quando isso vai ser
                    resolvido?" está querendo saber. */}
                {chamado.change.windowStart ? (
                  <span className="campo-ajuda" style={{ display: 'block' }}>
                    janela em {dataCurta(chamado.change.windowStart)}
                  </span>
                ) : null}
              </Linha>
            ) : null}

            {chamado.form && chamado.customFields ? (
              <>
                <div className="divisor-texto">
                  <span>{chamado.form.name}</span>
                </div>
                <RespostasDoFormulario
                  schema={chamado.form.schema}
                  respostas={chamado.customFields}
                />
              </>
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
                  onClick={() => setResolvendo(true)}
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

      {resolvendo && chamado ? (
        <ResolverChamado
          chamado={chamado}
          aoFechar={() => setResolvendo(false)}
          aoResolver={async (texto) => {
            await executar(() => api.resolver(chamado.id, texto));
            setResolvendo(false);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A solução, escrita.
 *
 * Antes o botão mandava "Resolvido pelo atendimento." — uma frase que
 * não diz nada a quem abriu o chamado nem a quem for ler daqui a seis
 * meses. O modelo de solução existe justamente para o texto certo custar
 * um clique.
 */
function ResolverChamado({
  chamado,
  aoFechar,
  aoResolver,
}: {
  chamado: TicketDetail;
  aoFechar: () => void;
  aoResolver: (texto: string) => Promise<void>;
}) {
  const [texto, setTexto] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Resolver chamado"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <div>
            <h3 className="card-titulo">Resolver</h3>
            <p className="card-sub">O que foi feito. É o que o solicitante vai ler.</p>
          </div>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setOcupado(true);
            void aoResolver(texto.trim()).finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha-sm">
            <label className="so-leitor" htmlFor="texto-solucao">
              Solução
            </label>
            <textarea
              id="texto-solucao"
              className="textarea"
              rows={5}
              required
              placeholder="O que resolveu, e o que fazer se voltar a acontecer."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <div className="linha" style={{ gap: 'var(--e-2)' }}>
              <EscolherModelo
                chamado={chamado}
                kind="SOLUCAO"
                rotulo="Modelo de solução"
                aoEscolher={(pronto) =>
                  setTexto((atual) => (atual.trim() ? `${atual.trimEnd()}\n\n${pronto}` : pronto))
                }
              />
            </div>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -sucesso" disabled={ocupado || !texto.trim()}>
              Resolver chamado
            </button>
          </div>
        </form>
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
