import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ProblemaDetalhe, ProblemStatus, TicketEventView } from '@norty-desk/shared';
import {
  ALLOWED_PROBLEM_TRANSITIONS,
  ROTULO_PRIORIDADE,
  ROTULO_PROBLEMA_STATUS,
  podeSerErroConhecido,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  anotarProblema,
  desvincularChamadoDoProblema,
  editarProblema,
  eventosDoProblema,
  obterProblema,
} from '../../api/problemas';
import { useAutenticacao } from '../../auth/Autenticacao';
import { MODIFICADOR_PRIORIDADE, ROTULO_STATUS, dataCurta, seloStatus } from '../../lib/formato';
import { seloDoProblema } from './formato';

/**
 * O problema por dentro.
 *
 * As duas caixas de texto do meio são a razão de a tela existir: causa
 * raiz e solução de contorno, uma ao lado da outra, com o interruptor de
 * erro conhecido logo abaixo. A regra que libera o interruptor é a mesma
 * função de `packages/shared` que a API usa — o botão explica antes de a
 * API recusar.
 */
export function Problema() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can } = useAutenticacao();

  const [problema, setProblema] = useState<ProblemaDetalhe | null>(null);
  const [eventos, setEventos] = useState<TicketEventView[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const [detalhe, linha] = await Promise.all([obterProblema(id), eventosDoProblema(id)]);
    setProblema(detalhe);
    setEventos(linha);
  }, [id]);

  useEffect(() => {
    void recarregar().catch((e: unknown) =>
      setErro(e instanceof ErroDaApi ? e.message : 'Problema não encontrado.'),
    );
  }, [recarregar]);

  if (erro) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  if (!problema) return <div className="sk sk-bloco" />;

  const podeEditar = can('problema:gerenciar');

  return (
    <div className="pilha">
      <div className="linha-entre">
        <button type="button" className="btn -fantasma -sm" onClick={() => navegar('/problemas')}>
          ← Voltar para os problemas
        </button>
        <span className="mono">P#{problema.number}</span>
      </div>

      <h2 style={{ fontSize: 'var(--t-h3)' }}>{problema.title}</h2>

      <div className="grade-conteudo-trilho">
        <div className="pilha">
          <Diagnostico problema={problema} podeEditar={podeEditar} aoSalvar={recarregar} />
          <Chamados problema={problema} aoMudar={recarregar} />
          <LinhaDoTempo
            problema={problema}
            eventos={eventos}
            podeAnotar={podeEditar}
            aoMudar={recarregar}
          />
        </div>

        <aside className="card trilho-fixo" aria-label="Propriedades do problema">
          <div className="card-corpo pilha-sm">
            <Linha rotulo="Situação">
              {podeEditar ? (
                <SeletorDeStatus problema={problema} aoMudar={recarregar} />
              ) : (
                <span className={`selo ${seloDoProblema(problema.status)}`}>
                  {ROTULO_PROBLEMA_STATUS[problema.status]}
                </span>
              )}
            </Linha>

            <Linha rotulo="Prioridade">
              <span className={`prio ${MODIFICADOR_PRIORIDADE[problema.priority]}`}>
                <span className="prio-ponto" aria-hidden="true" />
                {problema.priority} · {ROTULO_PRIORIDADE[problema.priority]}
              </span>
            </Linha>

            <Linha rotulo="Urgência × impacto">
              <span className="num">
                {problema.urgency} × {problema.impact}
              </span>
            </Linha>

            <Linha rotulo="Erro conhecido">
              {problema.isKnownError ? (
                <span className="selo -sucesso">publicado</span>
              ) : (
                <span className="selo -contorno">não</span>
              )}
            </Linha>

            <Linha rotulo="Categoria">{problema.category?.name ?? '—'}</Linha>
            <Linha rotulo="Responsável">
              {problema.assignedUser?.name ?? problema.assignedTeam?.name ?? '—'}
            </Linha>
            <Linha rotulo="Chamados">
              <span className="num">{problema.ticketCount}</span>
            </Linha>
            <Linha rotulo="Aberto em">
              <span className="num">{dataCurta(problema.createdAt)}</span>
            </Linha>
            {problema.knownErrorAt ? (
              <Linha rotulo="Publicado em">
                <span className="num">{dataCurta(problema.knownErrorAt)}</span>
              </Linha>
            ) : null}
            {problema.resolvedAt ? (
              <Linha rotulo="Resolvido em">
                <span className="num">{dataCurta(problema.resolvedAt)}</span>
              </Linha>
            ) : null}
            {problema.article ? (
              <Linha rotulo="Artigo">
                <Link to={`/conhecimento/${problema.article.id}`}>{problema.article.title}</Link>
              </Linha>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="linha-entre" style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}>
      <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
        {rotulo}
      </span>
      <span style={{ textAlign: 'right', minWidth: 0 }}>{children}</span>
    </div>
  );
}

/** Só os destinos que a máquina de estados aceita — o resto seria 409. */
function SeletorDeStatus({
  problema,
  aoMudar,
}: {
  problema: ProblemaDetalhe;
  aoMudar: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);

  return (
    <select
      className="select -auto"
      aria-label="Situação do problema"
      value={problema.status}
      disabled={ocupado}
      onChange={(e) => {
        setOcupado(true);
        void editarProblema(problema.id, { status: e.target.value as ProblemStatus })
          .then(aoMudar)
          .finally(() => setOcupado(false));
      }}
    >
      <option value={problema.status}>{ROTULO_PROBLEMA_STATUS[problema.status]}</option>
      {ALLOWED_PROBLEM_TRANSITIONS[problema.status].map((s) => (
        <option key={s} value={s}>
          {ROTULO_PROBLEMA_STATUS[s]}
        </option>
      ))}
    </select>
  );
}

/**
 * Causa e contorno.
 *
 * Os dois campos salvam juntos porque a regra do erro conhecido lê os
 * dois: salvar um de cada vez faria o interruptor recusar a metade do
 * caminho.
 */
function Diagnostico({
  problema,
  podeEditar,
  aoSalvar,
}: {
  problema: ProblemaDetalhe;
  podeEditar: boolean;
  aoSalvar: () => Promise<void>;
}) {
  const [rootCause, setRootCause] = useState(problema.rootCause ?? '');
  const [workaround, setWorkaround] = useState(problema.workaround ?? '');
  const [erroConhecido, setErroConhecido] = useState(problema.isKnownError);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const podePublicar = podeSerErroConhecido({ rootCause, workaround });
  const sujo =
    rootCause !== (problema.rootCause ?? '') ||
    workaround !== (problema.workaround ?? '') ||
    erroConhecido !== problema.isKnownError;

  if (!podeEditar) {
    return (
      <section className="card">
        <div className="card-topo">
          <h3 className="card-titulo">Causa e contorno</h3>
        </div>
        <div className="card-corpo pilha-sm">
          <Texto rotulo="Causa raiz" valor={problema.rootCause} />
          <Texto rotulo="Solução de contorno" valor={problema.workaround} />
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Causa e contorno</h3>
          <p className="card-sub">
            Com as duas escritas, o problema vira erro conhecido — e passa a aparecer para quem
            abre um chamado parecido.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setOcupado(true);
          void editarProblema(problema.id, {
            rootCause: rootCause.trim() || null,
            workaround: workaround.trim() || null,
            isKnownError: erroConhecido,
          })
            .then(aoSalvar)
            .catch((e2: unknown) =>
              setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
            )
            .finally(() => setOcupado(false));
        }}
      >
        <div className="card-corpo pilha">
          {erro ? (
            <div className="alerta-bloco -erro">
              <span aria-hidden="true">!</span>
              <span>{erro}</span>
            </div>
          ) : null}

          <div className="campo">
            <label className="campo-rotulo" htmlFor="causa-raiz">
              Causa raiz
            </label>
            <textarea
              id="causa-raiz"
              className="textarea"
              rows={3}
              placeholder="O que faz isto acontecer."
              value={rootCause}
              onChange={(e) => setRootCause(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="contorno">
              Solução de contorno
            </label>
            <textarea
              id="contorno"
              className="textarea"
              rows={3}
              placeholder="O que fazer enquanto a causa não é removida."
              value={workaround}
              onChange={(e) => setWorkaround(e.target.value)}
            />
          </div>

          <label className="switch">
            <input
              type="checkbox"
              checked={erroConhecido}
              disabled={!podePublicar && !erroConhecido}
              onChange={(e) => setErroConhecido(e.target.checked)}
            />
            <span className="switch-trilho" aria-hidden="true">
            <span className="switch-bolinha" />
          </span>
            <span>Publicar como erro conhecido</span>
          </label>

          {!podePublicar ? (
            <span className="campo-ajuda">
              Erro conhecido exige as duas coisas escritas: sem contorno, quem atende continua
              sem ter o que fazer.
            </span>
          ) : null}
        </div>

        <div className="card-rodape linha-entre">
          <span className="campo-ajuda">{sujo ? 'Há mudanças não salvas.' : ' '}</span>
          <button type="submit" className="btn -primario" disabled={ocupado || !sujo}>
            Salvar
          </button>
        </div>
      </form>
    </section>
  );
}

function Texto({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="pilha-sm">
      <span className="campo-rotulo">{rotulo}</span>
      <p style={{ whiteSpace: 'pre-wrap' }}>{valor ?? '—'}</p>
    </div>
  );
}

/** Os chamados que sofrem deste problema. É a medida do estrago. */
function Chamados({
  problema,
  aoMudar,
}: {
  problema: ProblemaDetalhe;
  aoMudar: () => Promise<void>;
}) {
  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Chamados vinculados</h3>
          <p className="card-sub">
            {problema.ticketCount === 0
              ? 'Nenhum ainda. Vincule pela tela do chamado.'
              : `${problema.ticketCount} chamado(s) apontam para esta causa.`}
          </p>
        </div>
      </div>

      {problema.tickets.length > 0 ? (
        <div className="card-corpo pilha-sm">
          {problema.tickets.map((c) => (
            <div
              key={c.id}
              className="linha-entre"
              style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}
            >
              <Link to={`/chamados/${c.id}`} style={{ minWidth: 0 }}>
                <span className="mono">#{c.number}</span> {c.subject}
              </Link>
              <span className="linha" style={{ gap: 'var(--e-2)', flex: 'none' }}>
                <span className={`selo ${seloStatus(c.status)}`}>{ROTULO_STATUS[c.status]}</span>
                <button
                  type="button"
                  className="btn-icone"
                  aria-label={`Desvincular chamado ${c.number}`}
                  onClick={() => {
                    void desvincularChamadoDoProblema(problema.id, c.id).then(aoMudar);
                  }}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function LinhaDoTempo({
  problema,
  eventos,
  podeAnotar,
  aoMudar,
}: {
  problema: ProblemaDetalhe;
  eventos: TicketEventView[];
  podeAnotar: boolean;
  aoMudar: () => Promise<void>;
}) {
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Investigação</h3>
          <p className="card-sub">
            O registro do que já foi tentado. Sempre interno: problema não tem portal.
          </p>
        </div>
      </div>

      <div className="card-corpo conversa">
        {eventos.map((evento) => (
          <article key={evento.id} className="conversa-evento -sistema">
            <header className="conversa-topo">
              <span className="conversa-autor">{evento.author?.name ?? 'Sistema'}</span>
              <span className="conversa-sep">·</span>
              <span>{dataCurta(evento.createdAt)}</span>
            </header>
            <p className="conversa-corpo">{corpoDoEvento(evento)}</p>
          </article>
        ))}
      </div>

      {podeAnotar ? (
        <form
          className="card-rodape pilha-sm"
          onSubmit={(e) => {
            e.preventDefault();
            setOcupado(true);
            void anotarProblema(problema.id, nota)
              .then(() => setNota(''))
              .then(aoMudar)
              .finally(() => setOcupado(false));
          }}
        >
          <label className="so-leitor" htmlFor="nota-problema">
            Nota de investigação
          </label>
          <textarea
            id="nota-problema"
            className="textarea"
            rows={2}
            placeholder="O que foi testado, e o que se descobriu."
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
          <div className="linha-entre">
            <span />
            <button
              type="submit"
              className="btn -primario -sm"
              disabled={ocupado || nota.trim().length === 0}
            >
              Registrar
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function corpoDoEvento(evento: TicketEventView): string {
  if (evento.body) return evento.body;

  const payload = evento.payload;
  if (payload?.type === 'MUDANCA_STATUS_PROBLEMA') {
    return `Situação alterada de ${ROTULO_PROBLEMA_STATUS[payload.from]} para ${
      ROTULO_PROBLEMA_STATUS[payload.to]
    }.`;
  }
  return '—';
}
