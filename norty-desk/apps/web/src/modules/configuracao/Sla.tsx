import { useCallback, useEffect, useState } from 'react';

import { ErroDaApi } from '../../api/cliente';
import {
  criarAcordo,
  criarCalendario,
  criarFeriado,
  criarMotivo,
  desativarAcordo,
  editarAcordo,
  editarCalendario,
  editarMotivo,
  listarAcordos,
  listarCalendarios,
  listarMotivos,
  removerFeriado,
  removerMotivo,
  type AcordoView,
  type CalendarioView,
  type MotivoView,
  type SegmentoView,
} from '../../api/configuracao';
import { dataCurta } from '../../lib/formato';
import {
  DIAS,
  horaParaMinutos,
  horasParaSegundos,
  intervaloLegivel,
  minutosParaHora,
  segundosParaHoras,
} from './formato';

type Aba = 'acordos' | 'calendarios' | 'motivos';

/**
 * SLA, calendários e motivos de pendência.
 *
 * As três coisas que decidem quando um prazo vence e o que acontece
 * quando ele passa. Estavam no schema desde a Fase 1 e só se criavam por
 * SQL — o que na prática significa que ninguém as configurava.
 */
export function Sla() {
  const [aba, setAba] = useState<Aba>('acordos');

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">SLA e calendários</h2>
          <p>
            O prazo é contado em expediente: quatro horas num calendário 9–18 vencem no dia
            seguinte, não às duas da manhã.
          </p>
        </div>
      </div>

      <div className="abas" role="tablist">
        {(
          [
            ['acordos', 'Acordos'],
            ['calendarios', 'Calendários'],
            ['motivos', 'Motivos de pendência'],
          ] as const
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            className="aba"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'acordos' ? <Acordos /> : aba === 'calendarios' ? <Calendarios /> : <Motivos />}
    </div>
  );
}

// ---------------------------------------------------------------------

function Acordos() {
  const [acordos, setAcordos] = useState<AcordoView[] | null>(null);
  const [calendarios, setCalendarios] = useState<CalendarioView[]>([]);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setAcordos(await listarAcordos());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os acordos.'));
    void listarCalendarios().then(setCalendarios).catch(() => undefined);
  }, [recarregar]);

  return (
    <div className="pilha">
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn -primario -sm" onClick={() => setCriando(true)}>
          Novo acordo
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!acordos ? (
        <div className="sk sk-bloco" />
      ) : acordos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum acordo</h3>
          <p>Sem acordo, o chamado nasce sem prazo — e a fila fica sem ordem de urgência.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Acordo</th>
                  <th>Tipo</th>
                  <th className="-num">Prazo</th>
                  <th>Calendário</th>
                  <th className="-num">Em uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {acordos.map((acordo) => (
                  <tr key={acordo.id} style={{ opacity: acordo.isActive ? 1 : 0.55 }}>
                    <td className="tabela-titulo-celula">
                      {acordo.name}
                      {acordo.levels.length > 0 ? (
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          {acordo.levels.length} nível(is) de escalonamento
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className="selo -contorno">
                        {acordo.kind} {acordo.target}
                      </span>
                    </td>
                    <td className="-num">{segundosParaHoras(acordo.durationSeconds)}h</td>
                    <td>{acordo.calendar?.name ?? 'Sem calendário (24×7)'}</td>
                    <td className="-num">{acordo.emUso}</td>
                    <td className="-num">
                      <EditarPrazo acordo={acordo} aoSalvar={recarregar} />
                      {acordo.isActive ? (
                        <button
                          type="button"
                          className="btn -fantasma -sm"
                          onClick={() => void desativarAcordo(acordo.id).then(recarregar)}
                        >
                          Desativar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn -fantasma -sm"
                          onClick={() =>
                            void editarAcordo(acordo.id, { isActive: true }).then(recarregar)
                          }
                        >
                          Ativar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {criando ? (
        <NovoAcordo
          calendarios={calendarios}
          aoFechar={() => setCriando(false)}
          aoSalvar={async (dados) => {
            await criarAcordo(dados);
            setCriando(false);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Editar prazo em linha.
 *
 * Um modal para mudar um número seria mais cerimônia do que a ação
 * merece — e mudar prazo é a coisa que mais se faz aqui.
 */
function EditarPrazo({ acordo, aoSalvar }: { acordo: AcordoView; aoSalvar: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [horas, setHoras] = useState(String(segundosParaHoras(acordo.durationSeconds)));

  if (!editando) {
    return (
      <button type="button" className="btn -fantasma -sm" onClick={() => setEditando(true)}>
        Prazo
      </button>
    );
  }

  return (
    <span className="linha" style={{ gap: 4, display: 'inline-flex' }}>
      <input
        className="input"
        type="number"
        min={0.1}
        // `step` numérico ancora a grade no `min`: com min 0,1 e passo
        // 0,5 o navegador recusa "4" — os válidos seriam 0,1 / 0,6 /
        // 1,1. `any` aceita qualquer prazo, que é o que se quer.
        step="any"
        value={horas}
        aria-label={`Prazo de ${acordo.name} em horas`}
        style={{ width: 90 }}
        onChange={(e) => setHoras(e.target.value)}
      />
      <button
        type="button"
        className="btn -primario -sm"
        onClick={() => {
          void editarAcordo(acordo.id, { durationSeconds: horasParaSegundos(Number(horas)) })
            .then(aoSalvar)
            .finally(() => setEditando(false));
        }}
      >
        ok
      </button>
    </span>
  );
}

function NovoAcordo({
  calendarios,
  aoFechar,
  aoSalvar,
}: {
  calendarios: CalendarioView[];
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    kind: 'SLA' | 'OLA';
    target: 'TTO' | 'TTR';
    durationSeconds: number;
    calendarId?: string | null;
  }) => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'SLA' | 'OLA'>('SLA');
  const [alvo, setAlvo] = useState<'TTO' | 'TTR'>('TTR');
  const [horas, setHoras] = useState('8');
  const [calendario, setCalendario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Novo acordo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">Novo acordo</h3>
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
              name: nome,
              kind: tipo,
              target: alvo,
              durationSeconds: horasParaSegundos(Number(horas)),
              calendarId: calendario || null,
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
              <label className="campo-rotulo" htmlFor="nome-acordo">
                Nome
              </label>
              <input
                id="nome-acordo"
                className="input"
                required
                minLength={2}
                placeholder="Resolução — clientes premium"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-acordo">
                  Tipo
                </label>
                <select
                  id="tipo-acordo"
                  className="select"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as 'SLA' | 'OLA')}
                >
                  <option value="SLA">SLA — prazo com o cliente</option>
                  <option value="OLA">OLA — prazo interno entre times</option>
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="alvo-acordo">
                  Mede
                </label>
                <select
                  id="alvo-acordo"
                  className="select"
                  value={alvo}
                  onChange={(e) => setAlvo(e.target.value as 'TTO' | 'TTR')}
                >
                  <option value="TTO">TTO — primeira resposta</option>
                  <option value="TTR">TTR — resolução</option>
                </select>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="horas-acordo">
                  Prazo em horas de expediente
                </label>
                <input
                  id="horas-acordo"
                  className="input"
                  type="number"
                  min={0.1}
                  step="any"
                  required
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                />
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="calendario-acordo">
                  Calendário
                </label>
                <select
                  id="calendario-acordo"
                  className="select"
                  value={calendario}
                  onChange={(e) => setCalendario(e.target.value)}
                >
                  <option value="">Sem calendário — conta 24×7</option>
                  {calendarios.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <span className="campo-ajuda">
                  Sem calendário, quatro horas de sexta às 17h vencem às 21h.
                </span>
              </div>
            </div>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function Calendarios() {
  const [calendarios, setCalendarios] = useState<CalendarioView[] | null>(null);
  const [aberto, setAberto] = useState<CalendarioView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCalendarios(await listarCalendarios());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os calendários.'));
  }, [recarregar]);

  return (
    <div className="pilha">
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn -primario -sm" onClick={() => setAberto('novo')}>
          Novo calendário
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!calendarios ? (
        <div className="sk sk-bloco" />
      ) : calendarios.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum calendário</h3>
          <p>Sem calendário, o prazo corre 24×7 e vence de madrugada.</p>
        </div>
      ) : (
        calendarios.map((calendario) => (
          <section key={calendario.id} className="card">
            <div className="card-topo">
              <div>
                <h3 className="card-titulo">{calendario.name}</h3>
                <p className="card-sub">
                  {calendario.timezone} · {calendario._count?.agreements ?? 0} acordo(s) ·{' '}
                  {calendario.holidays.length} feriado(s)
                </p>
              </div>
              <button
                type="button"
                className="btn -secundario -sm"
                onClick={() => setAberto(calendario)}
              >
                Editar
              </button>
            </div>

            <div className="card-corpo">
              <dl className="lista-definicao">
                {DIAS.map((dia, indice) => {
                  const faixas = calendario.segments.filter((s) => s.weekday === indice);
                  return (
                    <div key={dia} className="lista-definicao-item">
                      <dt>{dia}</dt>
                      <dd>
                        {faixas.length === 0
                          ? '—'
                          : faixas
                              .map(
                                (s) =>
                                  `${minutosParaHora(s.startMinute)}–${minutosParaHora(s.endMinute)}`,
                              )
                              .join('  ·  ')}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </section>
        ))
      )}

      {aberto ? (
        <EditorDeCalendario
          calendario={aberto === 'novo' ? null : aberto}
          aoFechar={() => setAberto(null)}
          aoSalvar={async (dados) => {
            if (aberto === 'novo') await criarCalendario(dados);
            else await editarCalendario(aberto.id, dados);
            setAberto(null);
            await recarregar();
          }}
          aoRecarregar={recarregar}
        />
      ) : null}
    </div>
  );
}

/** Faixas comuns, para não digitar 9–18 cinco vezes. */
const MODELOS: { rotulo: string; segmentos: SegmentoView[] }[] = [
  {
    rotulo: 'Comercial 9–18, seg a sex',
    segmentos: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080 })),
  },
  {
    rotulo: 'Comercial com almoço, seg a sex',
    segmentos: [1, 2, 3, 4, 5].flatMap((weekday) => [
      { weekday, startMinute: 540, endMinute: 720 },
      { weekday, startMinute: 780, endMinute: 1080 },
    ]),
  },
  {
    rotulo: '24×7',
    segmentos: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      weekday,
      startMinute: 0,
      endMinute: 1440,
    })),
  },
];

function EditorDeCalendario({
  calendario,
  aoFechar,
  aoSalvar,
  aoRecarregar,
}: {
  calendario: CalendarioView | null;
  aoFechar: () => void;
  aoSalvar: (dados: { name: string; timezone: string; segments: SegmentoView[] }) => Promise<void>;
  aoRecarregar: () => Promise<void>;
}) {
  const [nome, setNome] = useState(calendario?.name ?? '');
  const [fuso, setFuso] = useState(calendario?.timezone ?? 'America/Sao_Paulo');
  const [segmentos, setSegmentos] = useState<SegmentoView[]>(calendario?.segments ?? []);
  const [feriadoNome, setFeriadoNome] = useState('');
  const [feriadoData, setFeriadoData] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const definirFaixa = (weekday: number, campo: 'startMinute' | 'endMinute', hora: string) => {
    setSegmentos((atual) => {
      const outros = atual.filter((s) => s.weekday !== weekday);
      const doDia = atual.find((s) => s.weekday === weekday) ?? {
        weekday,
        startMinute: 540,
        endMinute: 1080,
      };
      return [...outros, { ...doDia, [campo]: horaParaMinutos(hora) }];
    });
  };

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal -lg"
        role="dialog"
        aria-modal="true"
        aria-label={calendario ? 'Editar calendário' : 'Novo calendário'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">
            {calendario ? 'Editar calendário' : 'Novo calendário'}
          </h3>
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
            void aoSalvar({ name: nome, timezone: fuso, segments: segmentos })
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

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="nome-calendario">
                  Nome
                </label>
                <input
                  id="nome-calendario"
                  className="input"
                  required
                  minLength={2}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="fuso-calendario">
                  Fuso horário
                </label>
                <input
                  id="fuso-calendario"
                  className="input"
                  value={fuso}
                  onChange={(e) => setFuso(e.target.value)}
                />
                <span className="campo-ajuda">
                  Nome IANA. O horário de verão vem dele — não de um deslocamento fixo.
                </span>
              </div>
            </div>

            <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
              {MODELOS.map((modelo) => (
                <button
                  key={modelo.rotulo}
                  type="button"
                  className="btn -secundario -sm"
                  onClick={() => setSegmentos(modelo.segmentos)}
                >
                  {modelo.rotulo}
                </button>
              ))}
            </div>

            <div className="campo">
              <span className="campo-rotulo">Expediente</span>
              {DIAS.map((dia, indice) => {
                const doDia = segmentos.filter((s) => s.weekday === indice);
                const primeira = doDia[0];

                return (
                  <div
                    key={dia}
                    className="linha"
                    style={{ gap: 'var(--e-3)', flexWrap: 'wrap' }}
                  >
                    <label className="check" style={{ minWidth: 130 }}>
                      <input
                        type="checkbox"
                        checked={doDia.length > 0}
                        onChange={(e) =>
                          setSegmentos((atual) =>
                            e.target.checked
                              ? [...atual, { weekday: indice, startMinute: 540, endMinute: 1080 }]
                              : atual.filter((s) => s.weekday !== indice),
                          )
                        }
                      />
                      <span>{dia}</span>
                    </label>

                    {doDia.length === 1 ? (
                      <>
                        <input
                          className="input"
                          type="time"
                          aria-label={`Início de ${dia}`}
                          style={{ width: 120 }}
                          value={minutosParaHora(primeira!.startMinute)}
                          onChange={(e) => definirFaixa(indice, 'startMinute', e.target.value)}
                        />
                        <span className="suave">até</span>
                        <input
                          className="input"
                          type="time"
                          aria-label={`Fim de ${dia}`}
                          style={{ width: 120 }}
                          value={minutosParaHora(primeira!.endMinute)}
                          onChange={(e) => definirFaixa(indice, 'endMinute', e.target.value)}
                        />
                      </>
                    ) : doDia.length > 1 ? (
                      // Duas faixas (o almoço) vêm de um modelo. Editá-las
                      // aqui exigiria um construtor que ninguém usaria; o
                      // ajuste fino se faz trocando o modelo.
                      <span className="campo-ajuda">
                        {doDia
                          .map(
                            (s) =>
                              `${minutosParaHora(s.startMinute)}–${minutosParaHora(s.endMinute)}`,
                          )
                          .join(' e ')}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {calendario ? (
              <div className="campo">
                <span className="campo-rotulo">Feriados</span>

                {calendario.holidays.length === 0 ? (
                  <span className="campo-ajuda">Nenhum.</span>
                ) : (
                  calendario.holidays.map((feriado) => (
                    <div key={feriado.id} className="linha-entre" style={{ flexWrap: 'nowrap' }}>
                      <span style={{ fontSize: 'var(--t-corpo-sm)' }}>
                        {feriado.name}{' '}
                        <span className="suave">
                          · {dataCurta(feriado.date)}
                          {feriado.isRecurring ? ' · todo ano' : ''}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn-icone"
                        aria-label={`Remover ${feriado.name}`}
                        onClick={() => {
                          void removerFeriado(calendario.id, feriado.id).then(aoRecarregar);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}

                <div className="linha" style={{ gap: 'var(--e-2)', marginTop: 'var(--e-2)' }}>
                  <input
                    className="input"
                    placeholder="Nome do feriado"
                    aria-label="Nome do feriado"
                    value={feriadoNome}
                    onChange={(e) => setFeriadoNome(e.target.value)}
                  />
                  <input
                    className="input"
                    type="date"
                    aria-label="Data do feriado"
                    style={{ width: 170 }}
                    value={feriadoData}
                    onChange={(e) => setFeriadoData(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn -secundario -sm"
                    disabled={!feriadoNome || !feriadoData}
                    onClick={() => {
                      void criarFeriado(calendario.id, {
                        name: feriadoNome,
                        date: feriadoData,
                        isRecurring: true,
                      })
                        .then(() => {
                          setFeriadoNome('');
                          setFeriadoData('');
                          return aoRecarregar();
                        })
                        .catch((e: unknown) =>
                          setErro(
                            e instanceof ErroDaApi ? e.message : 'Não foi possível adicionar.',
                          ),
                        );
                    }}
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------

function Motivos() {
  const [motivos, setMotivos] = useState<MotivoView[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<MotivoView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setMotivos(await listarMotivos());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar os motivos.'));
  }, [recarregar]);

  return (
    <div className="pilha">
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn -primario -sm" onClick={() => setEmEdicao('novo')}>
          Novo motivo
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!motivos ? (
        <div className="sk sk-bloco" />
      ) : motivos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum motivo</h3>
          <p>
            Sem motivo de pendência, um chamado esperando o cliente fica parado para sempre — e
            consumindo SLA.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Motivo</th>
                  <th>Cobra a cada</th>
                  <th className="-num">Resolve após</th>
                  <th className="-num">Em uso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {motivos.map((motivo) => (
                  <tr key={motivo.id}>
                    <td className="tabela-titulo-celula">{motivo.name}</td>
                    <td>{intervaloLegivel(motivo.followupIntervalSeconds)}</td>
                    <td className="-num">
                      {motivo.followupsBeforeResolution === 0
                        ? 'nunca'
                        : `${motivo.followupsBeforeResolution} cobrança(s)`}
                    </td>
                    <td className="-num">{motivo._count?.tickets ?? 0}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(motivo)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => {
                          setErro(null);
                          void removerMotivo(motivo.id)
                            .then(recarregar)
                            .catch((e: unknown) =>
                              setErro(
                                e instanceof ErroDaApi ? e.message : 'Não foi possível remover.',
                              ),
                            );
                        }}
                      >
                        Remover
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
        <FormularioDeMotivo
          motivo={emEdicao === 'novo' ? null : emEdicao}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') await criarMotivo(dados);
            else await editarMotivo(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function FormularioDeMotivo({
  motivo,
  aoFechar,
  aoSalvar,
}: {
  motivo: MotivoView | null;
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    followupIntervalSeconds: number;
    followupsBeforeResolution: number;
    followupTemplate: string | null;
  }) => Promise<void>;
}) {
  const [nome, setNome] = useState(motivo?.name ?? '');
  const [dias, setDias] = useState(
    String((motivo?.followupIntervalSeconds ?? 0) / (24 * 3600) || 0),
  );
  const [antes, setAntes] = useState(String(motivo?.followupsBeforeResolution ?? 0));
  const [modelo, setModelo] = useState(motivo?.followupTemplate ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={motivo ? 'Editar motivo' : 'Novo motivo'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{motivo ? 'Editar motivo' : 'Novo motivo'}</h3>
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
              name: nome,
              followupIntervalSeconds: Math.round(Number(dias) * 24 * 3600),
              followupsBeforeResolution: Number(antes),
              followupTemplate: modelo || null,
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
              <label className="campo-rotulo" htmlFor="nome-motivo">
                Nome
              </label>
              <input
                id="nome-motivo"
                className="input"
                required
                minLength={2}
                placeholder="Aguardando peça do fornecedor"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="dias-motivo">
                  Cobrar a cada (dias)
                </label>
                <input
                  id="dias-motivo"
                  className="input"
                  type="number"
                  min={0}
                  step="any"
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                />
                <span className="campo-ajuda">Zero desliga a cobrança automática.</span>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="antes-motivo">
                  Resolver após N cobranças
                </label>
                <input
                  id="antes-motivo"
                  className="input"
                  type="number"
                  min={0}
                  max={20}
                  value={antes}
                  onChange={(e) => setAntes(e.target.value)}
                />
                <span className="campo-ajuda">
                  Zero nunca resolve sozinho — e exige alguém para reparar.
                </span>
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="modelo-motivo">
                Texto da cobrança
              </label>
              <textarea
                id="modelo-motivo"
                className="textarea"
                rows={3}
                maxLength={2000}
                placeholder="Ainda precisamos de retorno no chamado {{numero}}."
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
              />
              <span className="campo-ajuda">
                <code>{'{{numero}}'}</code> vira <code>[#123]</code>; <code>{'{{assunto}}'}</code>{' '}
                vira o assunto do chamado.
              </span>
            </div>
          </div>

          <div className="modal-rodape">
            <button type="button" className="btn -fantasma" onClick={aoFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn -primario" disabled={ocupado}>
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
