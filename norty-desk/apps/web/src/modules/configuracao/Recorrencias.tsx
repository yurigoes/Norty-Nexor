import { useCallback, useEffect, useState } from 'react';
import type { EscreverRecorrenciaRequest, Recorrencia, RecorrenciaView } from '@norty-desk/shared';
import {
  ROTULO_PRIORIDADE,
  ROTULO_TIPO,
  TICKET_TYPES,
  descreverRecorrencia,
  recorrenciaValida,
} from '@norty-desk/shared';

import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { listarCategorias, listarTimes, type CategoriaView, type TimeView } from '../../api/endpoints';
import {
  chamadosDaRecorrencia,
  criarRecorrencia,
  editarRecorrencia,
  listarRecorrencias,
  removerRecorrencia,
  type ChamadoDaAgenda,
} from '../../api/recorrencias';
import { dataCurta } from '../../lib/formato';

/**
 * Chamados recorrentes.
 *
 * A manutenção preventiva em agenda. A coluna que mais importa é a
 * "próxima": ela é a **coluna do banco** que o ciclo vai usar, não uma
 * conta feita na tela — no GLPI a tela recalcula e às vezes discorda do
 * que o cron faz.
 */
export function Recorrencias() {
  const [agendas, setAgendas] = useState<RecorrenciaView[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<RecorrenciaView | 'nova' | null>(null);
  const [aberta, setAberta] = useState<RecorrenciaView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setAgendas(await listarRecorrencias());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as agendas.'));
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Chamados recorrentes</h2>
          <p>
            A manutenção preventiva que nasce sozinha. A agenda decide <em>quando</em>; o chamado
            que nasce passa pela mesma numeração, prioridade e SLA de qualquer outro.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('nova')}>
          Nova agenda
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!agendas ? (
        <div className="sk sk-bloco" />
      ) : agendas.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma agenda</h3>
          <p>
            Conferência de backup, troca de filtro, revisão de contrato: o que se repete em data
            fixa não precisa de alguém para lembrar.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Agenda</th>
                  <th>Quando</th>
                  <th>Próxima</th>
                  <th>Fila</th>
                  <th className="-num">Abertos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {agendas.map((a) => (
                  <tr key={a.id} style={a.isActive ? undefined : { opacity: 0.55 }}>
                    <td className="tabela-titulo-celula">
                      {a.name}
                      <span className="campo-ajuda" style={{ display: 'block' }}>
                        {a.subject}
                      </span>
                    </td>
                    <td>
                      {a.descricao}
                      {a.createBeforeSeconds > 0 ? (
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          abre {emDias(a.createBeforeSeconds)} antes
                        </span>
                      ) : null}
                    </td>
                    <td className="num">
                      {a.isActive ? (
                        a.nextRunAt ? (
                          proximaNaAgenda(a.nextRunAt, a.timezone)
                        ) : (
                          <span className="selo -neutro">encerrada</span>
                        )
                      ) : (
                        <span className="selo -neutro">desligada</span>
                      )}
                    </td>
                    <td>{a.assignedTeam?.name ?? a.category?.name ?? '—'}</td>
                    <td className="-num">{a.runCount}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setAberta(a)}
                      >
                        Histórico
                      </button>
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(a)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {emEdicao ? (
        <Formulario
          agenda={emEdicao === 'nova' ? null : emEdicao}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'nova') await criarRecorrencia(dados);
            else await editarRecorrencia(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
          aoRemover={
            emEdicao === 'nova'
              ? undefined
              : async () => {
                  await removerRecorrencia(emEdicao.id);
                  setEmEdicao(null);
                  await recarregar();
                }
          }
        />
      ) : null}

      {aberta ? <Historico agenda={aberta} aoFechar={() => setAberta(null)} /> : null}
    </div>
  );
}

/**
 * A próxima ocorrência, no fuso da agenda.
 *
 * `dataCurta` usa o fuso do navegador, e aqui isso mentiria: a agenda
 * diz "toda sexta às 07:00" no fuso dela, e quem administra de outro
 * lugar leria 10:00 na coluna ao lado da frase que diz 07:00. O fuso vai
 * junto quando é diferente do de quem está lendo.
 */
function proximaNaAgenda(iso: string, timezone: string): string {
  const data = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

  const daPessoa = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return daPessoa === timezone ? data : `${data} (${timezone.split('/').pop()})`;
}

function emDias(segundos: number): string {
  const dias = Math.round(segundos / 86400);
  if (dias >= 1) return `${dias} dia(s)`;
  const horas = Math.round(segundos / 3600);
  return horas >= 1 ? `${horas} h` : `${Math.round(segundos / 60)} min`;
}

function Historico({ agenda, aoFechar }: { agenda: RecorrenciaView; aoFechar: () => void }) {
  const [chamados, setChamados] = useState<ChamadoDaAgenda[] | null>(null);

  useEffect(() => {
    void chamadosDaRecorrencia(agenda.id)
      .then(setChamados)
      .catch(() => setChamados([]));
  }, [agenda.id]);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Chamados de ${agenda.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <div>
            <h3 className="card-titulo">{agenda.name}</h3>
            <p className="card-sub">{agenda.descricao}</p>
          </div>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <div className="modal-corpo pilha-sm">
          {!chamados ? (
            <div className="sk sk-linha" />
          ) : chamados.length === 0 ? (
            <p className="campo-ajuda">Nenhum chamado nasceu desta agenda ainda.</p>
          ) : (
            chamados.map((c) => (
              <a key={c.id} href={`/chamados/${c.id}`} className="conversa-anexo">
                <span className="mono">#{c.number}</span>
                <span style={{ minWidth: 0, flex: 1 }}>{c.subject}</span>
                <span className="conversa-anexo-peso">{dataCurta(c.createdAt)}</span>
              </a>
            ))
          )}
        </div>

        <div className="modal-rodape">
          <button type="button" className="btn -fantasma" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function Formulario({
  agenda,
  aoFechar,
  aoSalvar,
  aoRemover,
}: {
  agenda: RecorrenciaView | null;
  aoFechar: () => void;
  aoSalvar: (dados: EscreverRecorrenciaRequest) => Promise<void>;
  aoRemover?: () => Promise<void>;
}) {
  const [name, setName] = useState(agenda?.name ?? '');
  const [subject, setSubject] = useState(agenda?.subject ?? '');
  const [description, setDescription] = useState(agenda?.description ?? '');
  const [ticketType, setTicketType] = useState(agenda?.ticketType ?? 'REQUISICAO');
  const [urgency, setUrgency] = useState<number>(agenda?.urgency ?? 3);
  const [impact, setImpact] = useState<number>(agenda?.impact ?? 3);
  const [categoryId, setCategoryId] = useState(agenda?.category?.id ?? '');
  const [assignedTeamId, setAssignedTeamId] = useState(agenda?.assignedTeam?.id ?? '');
  const [requesterId, setRequesterId] = useState(agenda?.requester.id ?? '');
  const [isActive, setIsActive] = useState(agenda?.isActive ?? true);
  const [antecedenciaDias, setAntecedenciaDias] = useState(
    agenda ? Math.round(agenda.createBeforeSeconds / 86400) : 0,
  );

  const inicial = agenda?.schedule ?? ({ tipo: 'DIARIA', hora: 8, minuto: 0 } as Recorrencia);
  const [tipo, setTipo] = useState<Recorrencia['tipo']>(inicial.tipo);
  const [hora, setHora] = useState(inicial.hora);
  const [minuto, setMinuto] = useState(inicial.minuto);
  const [diasDaSemana, setDiasDaSemana] = useState<number[]>(
    inicial.tipo === 'SEMANAL' ? inicial.diasDaSemana : [1],
  );
  const [diaDoMes, setDiaDoMes] = useState(
    inicial.tipo === 'MENSAL' || inicial.tipo === 'ANUAL' ? inicial.diaDoMes : 1,
  );
  const [mes, setMes] = useState(inicial.tipo === 'ANUAL' ? inicial.mes : 1);

  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [times, setTimes] = useState<TimeView[]>([]);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void Promise.all([listarCategorias(), listarTimes(), listarPessoas()])
      .then(([c, t, p]) => {
        setCategorias(c);
        setTimes(t);
        setPessoas(p);
      })
      .catch(() => undefined);
  }, []);

  const schedule: Recorrencia =
    tipo === 'DIARIA'
      ? { tipo, hora, minuto }
      : tipo === 'SEMANAL'
        ? { tipo, diasDaSemana, hora, minuto }
        : tipo === 'MENSAL'
          ? { tipo, diaDoMes, hora, minuto }
          : { tipo, mes, diaDoMes, hora, minuto };

  const valida = recorrenciaValida(schedule);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={agenda ? 'Editar agenda' : 'Nova agenda'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{agenda ? 'Editar agenda' : 'Nova agenda'}</h3>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <form
          className="modal-forma"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            setOcupado(true);
            void aoSalvar({
              name,
              subject,
              description,
              schedule,
              ticketType,
              urgency: urgency as EscreverRecorrenciaRequest['urgency'],
              impact: impact as EscreverRecorrenciaRequest['impact'],
              categoryId: categoryId || null,
              assignedTeamId: assignedTeamId || null,
              requesterId: requesterId || null,
              createBeforeSeconds: Math.max(0, antecedenciaDias) * 86400,
              isActive,
            })
              .catch((e2: unknown) =>
                setErro(e2 instanceof ErroDaApi ? e2.message : 'Não foi possível salvar.'),
              )
              .finally(() => setOcupado(false));
          }}
        >
          <div className="modal-corpo pilha">
            {erro ? (
              <div className="alerta-bloco -erro">
                <span aria-hidden="true">!</span>
                <span>{erro}</span>
              </div>
            ) : null}

            <div className="campo">
              <label className="campo-rotulo" htmlFor="nome-agenda">
                Nome da agenda
              </label>
              <input
                id="nome-agenda"
                className="input"
                required
                minLength={3}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="campo-ajuda">
                Só aparece aqui e na nota interna do chamado. Serve para quem administra.
              </span>
            </div>

            <div className="divisor-texto">
              <span>Quando</span>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-recorrencia">
                  Repetir
                </label>
                <select
                  id="tipo-recorrencia"
                  className="select"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as Recorrencia['tipo'])}
                >
                  <option value="DIARIA">Todo dia</option>
                  <option value="SEMANAL">Toda semana</option>
                  <option value="MENSAL">Todo mês</option>
                  <option value="ANUAL">Todo ano</option>
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="hora-agenda">
                  Hora
                </label>
                <div className="linha" style={{ gap: 'var(--e-2)' }}>
                  <input
                    id="hora-agenda"
                    className="input"
                    type="number"
                    min={0}
                    max={23}
                    value={hora}
                    onChange={(e) => setHora(Number(e.target.value))}
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={59}
                    aria-label="Minuto"
                    value={minuto}
                    onChange={(e) => setMinuto(Number(e.target.value))}
                  />
                </div>
              </div>
            </div>

            {tipo === 'SEMANAL' ? (
              <div className="campo">
                <span className="campo-rotulo">Dias da semana</span>
                <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
                  {DIAS.map((rotulo, indice) => (
                    <label key={rotulo} className="check">
                      <input
                        type="checkbox"
                        checked={diasDaSemana.includes(indice)}
                        onChange={(e) =>
                          setDiasDaSemana((atual) =>
                            e.target.checked
                              ? [...atual, indice]
                              : atual.filter((d) => d !== indice),
                          )
                        }
                      />
                      <span>{rotulo}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {tipo === 'MENSAL' || tipo === 'ANUAL' ? (
              <div className="campo-grupo">
                {tipo === 'ANUAL' ? (
                  <div className="campo">
                    <label className="campo-rotulo" htmlFor="mes-agenda">
                      Mês
                    </label>
                    <input
                      id="mes-agenda"
                      className="input"
                      type="number"
                      min={1}
                      max={12}
                      value={mes}
                      onChange={(e) => setMes(Number(e.target.value))}
                    />
                  </div>
                ) : null}

                <div className="campo">
                  <label className="campo-rotulo" htmlFor="dia-agenda">
                    Dia do mês
                  </label>
                  <input
                    id="dia-agenda"
                    className="input"
                    type="number"
                    min={1}
                    max={31}
                    value={diaDoMes}
                    onChange={(e) => setDiaDoMes(Number(e.target.value))}
                  />
                  <span className="campo-ajuda">
                    Mês que não tem o dia usa o último: 31 em fevereiro vira 28.
                  </span>
                </div>
              </div>
            ) : null}

            <div className="alerta-bloco -info">
              <span aria-hidden="true">🗓</span>
              <span>{valida ? descreverRecorrencia(schedule) : 'Escolha ao menos um dia.'}</span>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="antecedencia-agenda">
                Abrir com antecedência (dias)
              </label>
              <input
                id="antecedencia-agenda"
                className="input"
                type="number"
                min={0}
                max={90}
                value={antecedenciaDias}
                onChange={(e) => setAntecedenciaDias(Number(e.target.value))}
              />
              <span className="campo-ajuda">
                “A manutenção é dia 20, abra o chamado três dias antes.” Zero abre na hora.
              </span>
            </div>

            <div className="divisor-texto">
              <span>O chamado que vai nascer</span>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="assunto-agenda">
                Assunto
              </label>
              <input
                id="assunto-agenda"
                className="input"
                required
                minLength={3}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="descricao-agenda">
                Descrição
              </label>
              <textarea
                id="descricao-agenda"
                className="textarea"
                rows={3}
                required
                minLength={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-chamado-agenda">
                  Tipo
                </label>
                <select
                  id="tipo-chamado-agenda"
                  className="select"
                  value={ticketType}
                  onChange={(e) => setTicketType(e.target.value as typeof ticketType)}
                >
                  {TICKET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="requerente-agenda">
                  Requerente
                </label>
                <select
                  id="requerente-agenda"
                  className="select"
                  value={requesterId}
                  onChange={(e) => setRequesterId(e.target.value)}
                >
                  <option value="">Quem criar a agenda</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="urgencia-agenda">
                  Urgência
                </label>
                <select
                  id="urgencia-agenda"
                  className="select"
                  value={urgency}
                  onChange={(e) => setUrgency(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} · {ROTULO_PRIORIDADE[n as 1 | 2 | 3 | 4 | 5]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="impacto-agenda">
                  Impacto
                </label>
                <select
                  id="impacto-agenda"
                  className="select"
                  value={impact}
                  onChange={(e) => setImpact(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} · {ROTULO_PRIORIDADE[n as 1 | 2 | 3 | 4 | 5]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="categoria-agenda">
                  Categoria
                </label>
                <select
                  id="categoria-agenda"
                  className="select"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="campo-ajuda">Traz o time e os acordos de SLA dela.</span>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="time-agenda">
                  Time
                </label>
                <select
                  id="time-agenda"
                  className="select"
                  value={assignedTeamId}
                  onChange={(e) => setAssignedTeamId(e.target.value)}
                >
                  <option value="">O da categoria</option>
                  {times.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="switch-trilho" aria-hidden="true">
                <span className="switch-bolinha" />
              </span>
              <span>Agenda ativa</span>
            </label>
          </div>

          <div className="modal-rodape linha-entre">
            {aoRemover ? (
              <button
                type="button"
                className="btn -perigo -sm"
                disabled={ocupado}
                onClick={() => {
                  setOcupado(true);
                  void aoRemover()
                    .catch((e: unknown) =>
                      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível apagar.'),
                    )
                    .finally(() => setOcupado(false));
                }}
              >
                Apagar
              </button>
            ) : (
              <span />
            )}
            <span className="linha" style={{ gap: 'var(--e-2)' }}>
              <button type="button" className="btn -fantasma" onClick={aoFechar}>
                Cancelar
              </button>
              <button type="submit" className="btn -primario" disabled={ocupado || !valida}>
                Salvar
              </button>
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
