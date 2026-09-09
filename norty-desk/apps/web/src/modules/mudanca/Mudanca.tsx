import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  ChangeStatus,
  MudancaDetalhe,
  TicketEventView,
  TicketListItem,
} from '@norty-desk/shared';
import {
  ALLOWED_CHANGE_TRANSITIONS,
  ROTULO_MUDANCA_RISCO,
  ROTULO_MUDANCA_STATUS,
  ROTULO_MUDANCA_TIPO,
  exigeAprovacaoAntesDeExecutar,
  podeSairDoRascunho,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { listarChamados } from '../../api/endpoints';
import {
  anotarMudanca,
  desvincularChamadoDaMudanca,
  editarMudanca,
  eventosDaMudanca,
  executarMudanca,
  obterMudanca,
  vincularChamadoAMudanca,
} from '../../api/mudancas';
import { useAutenticacao } from '../../auth/Autenticacao';
import { ROTULO_STATUS, dataCurta, seloStatus } from '../../lib/formato';
import { Aprovacoes } from '../aprovacao/Aprovacoes';
import { janelaCurta, seloDaMudanca, seloDoRisco } from './formato';

/**
 * A mudança por dentro.
 *
 * Os três planos ficam lado a lado no topo porque são o objeto da
 * conversa: o de recuo é o que separa mudança de aposta, e escondê-lo
 * numa aba seria dizer o contrário. A barra de execução só aparece
 * quando a mudança pode mesmo andar — botão que sempre dá 409 ensina a
 * ignorar a tela.
 */
export function Mudanca() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can } = useAutenticacao();

  const [mudanca, setMudanca] = useState<MudancaDetalhe | null>(null);
  const [eventos, setEventos] = useState<TicketEventView[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    const [detalhe, linha] = await Promise.all([obterMudanca(id), eventosDaMudanca(id)]);
    setMudanca(detalhe);
    setEventos(linha);
  }, [id]);

  useEffect(() => {
    void recarregar().catch((e: unknown) =>
      setErro(e instanceof ErroDaApi ? e.message : 'Mudança não encontrada.'),
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

  if (!mudanca) return <div className="sk sk-bloco" />;

  const podeEditar = can('mudanca:gerenciar');

  return (
    <div className="pilha">
      <div className="linha-entre">
        <button type="button" className="btn -fantasma -sm" onClick={() => navegar('/mudancas')}>
          ← Voltar para as mudanças
        </button>
        <span className="mono">M#{mudanca.number}</span>
      </div>

      <h2 style={{ fontSize: 'var(--t-h3)' }}>{mudanca.title}</h2>

      <div className="grade-conteudo-trilho">
        <div className="pilha">
          <Execucao mudanca={mudanca} aoMudar={recarregar} />
          <Planos mudanca={mudanca} podeEditar={podeEditar} aoSalvar={recarregar} />
          <Aprovacoes alvo={{ kind: 'MUDANCA', id: mudanca.id }} aoMudar={recarregar} />
          <Chamados mudanca={mudanca} aoMudar={recarregar} />
          <LinhaDoTempo
            mudanca={mudanca}
            eventos={eventos}
            podeAnotar={can('mudanca:ler')}
            aoMudar={recarregar}
          />
        </div>

        <aside className="card trilho-fixo" aria-label="Propriedades da mudança">
          <div className="card-corpo pilha-sm">
            <Linha rotulo="Situação">
              {podeEditar ? (
                <SeletorDeStatus mudanca={mudanca} aoMudar={recarregar} />
              ) : (
                <span className={`selo ${seloDaMudanca(mudanca.status)}`}>
                  {ROTULO_MUDANCA_STATUS[mudanca.status]}
                </span>
              )}
            </Linha>

            <Linha rotulo="Tipo">
              {ROTULO_MUDANCA_TIPO[mudanca.kind]}
              {!exigeAprovacaoAntesDeExecutar(mudanca.kind) ? (
                <span className="campo-ajuda" style={{ display: 'block' }}>
                  {mudanca.kind === 'PADRAO' ? 'pré-aprovada' : 'aval depois da execução'}
                </span>
              ) : null}
            </Linha>

            <Linha rotulo="Risco">
              <span className={`selo ${seloDoRisco(mudanca.risk)}`}>
                {ROTULO_MUDANCA_RISCO[mudanca.risk]}
              </span>
            </Linha>

            <Janela mudanca={mudanca} podeEditar={podeEditar} aoSalvar={recarregar} />

            <Linha rotulo="Categoria">{mudanca.category?.name ?? '—'}</Linha>
            <Linha rotulo="Responsável">
              {mudanca.assignedUser?.name ?? mudanca.assignedTeam?.name ?? '—'}
            </Linha>
            <Linha rotulo="Chamados">
              <span className="num">{mudanca.ticketCount}</span>
            </Linha>
            {mudanca.problem ? (
              <Linha rotulo="Problema">
                <Link to={`/problemas/${mudanca.problem.id}`}>
                  <span className="mono">P#{mudanca.problem.number}</span> {mudanca.problem.title}
                </Link>
              </Linha>
            ) : null}
            {mudanca.startedAt ? (
              <Linha rotulo="Começou">
                <span className="num">{dataCurta(mudanca.startedAt)}</span>
              </Linha>
            ) : null}
            {mudanca.finishedAt ? (
              <Linha rotulo="Terminou">
                <span className="num">{dataCurta(mudanca.finishedAt)}</span>
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

function SeletorDeStatus({
  mudanca,
  aoMudar,
}: {
  mudanca: MudancaDetalhe;
  aoMudar: () => Promise<void>;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Execução tem barra própria: oferecê-la também aqui daria dois
  // caminhos para o mesmo ato, e só um deles pede o desfecho escrito.
  const destinos = ALLOWED_CHANGE_TRANSITIONS[mudanca.status].filter(
    (s) => s !== 'EM_EXECUCAO' && s !== 'CONCLUIDA' && s !== 'REVERTIDA',
  );

  return (
    <span className="pilha-sm">
      <select
        className="select -auto"
        aria-label="Situação da mudança"
        value={mudanca.status}
        disabled={ocupado || destinos.length === 0}
        onChange={(e) => {
          setErro(null);
          setOcupado(true);
          void editarMudanca(mudanca.id, { status: e.target.value as ChangeStatus })
            .then(aoMudar)
            .catch((e2: unknown) =>
              setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível mudar.'),
            )
            .finally(() => setOcupado(false));
        }}
      >
        <option value={mudanca.status}>{ROTULO_MUDANCA_STATUS[mudanca.status]}</option>
        {destinos.map((s) => (
          <option key={s} value={s}>
            {ROTULO_MUDANCA_STATUS[s]}
          </option>
        ))}
      </select>
      {erro ? <span className="campo-ajuda">{erro}</span> : null}
    </span>
  );
}

/**
 * A janela de execução.
 *
 * Fica no trilho e não nos planos porque é o que se consulta de relance
 * — "isso passa hoje?" — e porque agendar sem ela é 400.
 */
function Janela({
  mudanca,
  podeEditar,
  aoSalvar,
}: {
  mudanca: MudancaDetalhe;
  podeEditar: boolean;
  aoSalvar: () => Promise<void>;
}) {
  const [editando, setEditando] = useState(false);
  const [inicio, setInicio] = useState(paraCampoLocal(mudanca.windowStart));
  const [fim, setFim] = useState(paraCampoLocal(mudanca.windowEnd));
  const [erro, setErro] = useState<string | null>(null);

  if (!editando) {
    return (
      <Linha rotulo="Janela">
        <span className="num">{janelaCurta(mudanca.windowStart, mudanca.windowEnd)}</span>
        {podeEditar ? (
          <button
            type="button"
            className="btn-link"
            style={{ display: 'block', marginLeft: 'auto' }}
            onClick={() => setEditando(true)}
          >
            {mudanca.windowStart ? 'mudar' : '+ definir'}
          </button>
        ) : null}
      </Linha>
    );
  }

  return (
    <form
      className="pilha-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        void editarMudanca(mudanca.id, {
          windowStart: inicio ? new Date(inicio).toISOString() : null,
          windowEnd: fim ? new Date(fim).toISOString() : null,
        })
          .then(aoSalvar)
          .then(() => setEditando(false))
          .catch((e2: unknown) =>
            setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar a janela.'),
          );
      }}
    >
      <label className="campo-rotulo" htmlFor="janela-inicio">
        Janela — início
      </label>
      <input
        id="janela-inicio"
        className="input"
        type="datetime-local"
        value={inicio}
        onChange={(e) => setInicio(e.target.value)}
      />
      <label className="campo-rotulo" htmlFor="janela-fim">
        Fim
      </label>
      <input
        id="janela-fim"
        className="input"
        type="datetime-local"
        value={fim}
        onChange={(e) => setFim(e.target.value)}
      />
      {erro ? <span className="campo-ajuda">{erro}</span> : null}
      <div className="linha" style={{ gap: 'var(--e-2)' }}>
        <button type="submit" className="btn -primario -sm">
          Salvar
        </button>
        <button type="button" className="btn -fantasma -sm" onClick={() => setEditando(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** `datetime-local` quer `AAAA-MM-DDTHH:MM` na hora local, não ISO em UTC. */
function paraCampoLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

/**
 * Iniciar, concluir, reverter.
 *
 * Concluir e reverter pedem o desfecho escrito — é o registro que a
 * próxima mudança parecida vai ler, e o campo em branco é justamente o
 * que o GLPI aceita.
 */
function Execucao({
  mudanca,
  aoMudar,
}: {
  mudanca: MudancaDetalhe;
  aoMudar: () => Promise<void>;
}) {
  const { can } = useAutenticacao();
  const [outcome, setOutcome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (!can('mudanca:executar')) return null;

  const podeIniciar =
    (mudanca.status === 'APROVADA' ||
      mudanca.status === 'AGENDADA' ||
      (mudanca.status === 'RASCUNHO' && !exigeAprovacaoAntesDeExecutar(mudanca.kind))) &&
    podeSairDoRascunho(mudanca);
  const podeFechar = mudanca.status === 'EM_EXECUCAO';
  const podeReverter = mudanca.status === 'EM_EXECUCAO' || mudanca.status === 'CONCLUIDA';

  if (!podeIniciar && !podeFechar && !podeReverter) return null;

  async function agir(acao: 'INICIAR' | 'CONCLUIR' | 'REVERTER') {
    setErro(null);
    setOcupado(true);
    try {
      await executarMudanca(mudanca.id, { acao, outcome: outcome.trim() || undefined });
      setOutcome('');
      await aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível executar.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Execução</h3>
          <p className="card-sub">
            {podeIniciar
              ? 'A mudança está liberada para ir a campo.'
              : 'Escreva o que aconteceu antes de fechar.'}
          </p>
        </div>
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {podeFechar || podeReverter ? (
        <div className="card-corpo pilha-sm">
          <label className="campo-rotulo" htmlFor="desfecho">
            O que aconteceu
          </label>
          <textarea
            id="desfecho"
            className="textarea"
            rows={2}
            placeholder="O registro que a próxima mudança parecida vai ler."
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </div>
      ) : null}

      <div className="card-rodape linha" style={{ gap: 'var(--e-2)' }}>
        {podeIniciar ? (
          <button
            type="button"
            className="btn -primario"
            disabled={ocupado}
            onClick={() => void agir('INICIAR')}
          >
            Iniciar execução
          </button>
        ) : null}
        {podeFechar ? (
          <button
            type="button"
            className="btn -primario"
            disabled={ocupado}
            onClick={() => void agir('CONCLUIR')}
          >
            Concluir
          </button>
        ) : null}
        {podeReverter ? (
          <button
            type="button"
            className="btn -perigo"
            disabled={ocupado}
            onClick={() => void agir('REVERTER')}
          >
            Reverter
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Os três planos. O de recuo é o que separa mudança de aposta. */
function Planos({
  mudanca,
  podeEditar,
  aoSalvar,
}: {
  mudanca: MudancaDetalhe;
  podeEditar: boolean;
  aoSalvar: () => Promise<void>;
}) {
  const [implementationPlan, setImplementacao] = useState(mudanca.implementationPlan ?? '');
  const [testPlan, setTeste] = useState(mudanca.testPlan ?? '');
  const [rollbackPlan, setRecuo] = useState(mudanca.rollbackPlan ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const pronta = podeSairDoRascunho({ implementationPlan, rollbackPlan });
  const sujo =
    implementationPlan !== (mudanca.implementationPlan ?? '') ||
    testPlan !== (mudanca.testPlan ?? '') ||
    rollbackPlan !== (mudanca.rollbackPlan ?? '');

  if (!podeEditar) {
    return (
      <section className="card">
        <div className="card-topo">
          <h3 className="card-titulo">Planos</h3>
        </div>
        <div className="card-corpo pilha-sm">
          <Texto rotulo="Implementação" valor={mudanca.implementationPlan} />
          <Texto rotulo="Teste" valor={mudanca.testPlan} />
          <Texto rotulo="Recuo" valor={mudanca.rollbackPlan} />
          {mudanca.outcome ? <Texto rotulo="O que aconteceu" valor={mudanca.outcome} /> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Planos</h3>
          <p className="card-sub">
            Sem o de implementação e o de recuo, a mudança não sai do rascunho.
          </p>
        </div>
        {pronta ? <span className="selo -sucesso">pronta para pedir aval</span> : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setOcupado(true);
          void editarMudanca(mudanca.id, {
            implementationPlan: implementationPlan.trim() || null,
            testPlan: testPlan.trim() || null,
            rollbackPlan: rollbackPlan.trim() || null,
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
            <label className="campo-rotulo" htmlFor="plano-implementacao">
              Plano de implementação
            </label>
            <textarea
              id="plano-implementacao"
              className="textarea"
              rows={3}
              placeholder="Os passos, na ordem em que serão executados."
              value={implementationPlan}
              onChange={(e) => setImplementacao(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="plano-teste">
              Plano de teste
            </label>
            <textarea
              id="plano-teste"
              className="textarea"
              rows={2}
              placeholder="Como saber que deu certo."
              value={testPlan}
              onChange={(e) => setTeste(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="plano-recuo">
              Plano de recuo
            </label>
            <textarea
              id="plano-recuo"
              className="textarea"
              rows={3}
              placeholder="Como desfazer, se não der."
              value={rollbackPlan}
              onChange={(e) => setRecuo(e.target.value)}
            />
            {!pronta ? (
              <span className="campo-ajuda">
                É o que separa mudança de aposta — e sem ele a mudança não anda.
              </span>
            ) : null}
          </div>

          {mudanca.outcome ? <Texto rotulo="O que aconteceu" valor={mudanca.outcome} /> : null}
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

/**
 * Os chamados que esperam por esta mudança.
 *
 * Vincular vive aqui, e não na tela do chamado: quem monta a mudança é
 * quem sabe o que ela resolve, e é olhando a lista inteira que se
 * percebe que ela cresceu além do que a janela aguenta.
 */
function Chamados({
  mudanca,
  aoMudar,
}: {
  mudanca: MudancaDetalhe;
  aoMudar: () => Promise<void>;
}) {
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState('');
  const [achados, setAchados] = useState<TicketListItem[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!buscando) return;
    const alarme = setTimeout(() => {
      void listarChamados({ q: termo || undefined, limit: 8 })
        .then((p) => setAchados(p.data))
        .catch(() => setAchados([]));
    }, 250);
    return () => clearTimeout(alarme);
  }, [termo, buscando]);

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Chamados que esta mudança carrega</h3>
          <p className="card-sub">
            {mudanca.ticketCount === 0
              ? 'Nenhum ainda.'
              : `${mudanca.ticketCount} chamado(s) esperam por ela.`}
          </p>
        </div>
        <button
          type="button"
          className="btn -secundario -sm"
          onClick={() => {
            setBuscando((b) => !b);
            setTermo('');
          }}
        >
          {buscando ? 'fechar' : 'vincular chamado'}
        </button>
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {buscando ? (
        <div className="card-corpo pilha-sm">
          <label className="so-leitor" htmlFor="busca-chamado-mudanca">
            Buscar chamado
          </label>
          <input
            id="busca-chamado-mudanca"
            className="input"
            type="search"
            placeholder="Número ou assunto"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
          {achados
            .filter((c) => !mudanca.tickets.some((v) => v.id === c.id))
            .map((c) => (
              <button
                key={c.id}
                type="button"
                className="btn -secundario -sm"
                style={{ justifyContent: 'flex-start' }}
                onClick={() => {
                  setErro(null);
                  void vincularChamadoAMudanca(mudanca.id, c.id)
                    .then(aoMudar)
                    .then(() => setBuscando(false))
                    .catch((e: unknown) =>
                      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível vincular.'),
                    );
                }}
              >
                #{c.number} · {c.subject}
              </button>
            ))}
        </div>
      ) : null}

      <div className="card-corpo pilha-sm">
        {mudanca.tickets.map((c) => (
          <div key={c.id} className="linha-entre" style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}>
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
                  void desvincularChamadoDaMudanca(mudanca.id, c.id).then(aoMudar);
                }}
              >
                ×
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinhaDoTempo({
  mudanca,
  eventos,
  podeAnotar,
  aoMudar,
}: {
  mudanca: MudancaDetalhe;
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
          <h3 className="card-titulo">Registro</h3>
          <p className="card-sub">
            O que foi decidido e o que foi feito. Sempre interno: mudança não tem portal.
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
            void anotarMudanca(mudanca.id, nota)
              .then(() => setNota(''))
              .then(aoMudar)
              .finally(() => setOcupado(false));
          }}
        >
          <label className="so-leitor" htmlFor="nota-mudanca">
            Nota
          </label>
          <textarea
            id="nota-mudanca"
            className="textarea"
            rows={2}
            placeholder="O que foi combinado, o que ficou pendente."
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
  if (payload?.type === 'MUDANCA_STATUS_MUDANCA') {
    return `Situação alterada de ${ROTULO_MUDANCA_STATUS[payload.from]} para ${
      ROTULO_MUDANCA_STATUS[payload.to]
    }.`;
  }
  if (payload?.type === 'APROVACAO') {
    return payload.decision === 'APROVADO' ? 'Aprovada.' : 'Recusada.';
  }
  return '—';
}
