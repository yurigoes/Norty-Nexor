import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  IntakeAction,
  IntakeCriterion,
  RegraDeEntradaView,
  SimulacaoDeEntradaView,
  TimeView,
} from '@norty-desk/shared';
import {
  CAMPOS_DE_CRITERIO,
  CAMPOS_SO_IGUAL,
  CHANNELS,
  OPERADORES_DE_CRITERIO,
  ROTULO_ACAO_DE_ENTRADA,
  ROTULO_CAMPO_DE_CRITERIO,
  ROTULO_CANAL,
  ROTULO_OPERADOR,
  ROTULO_PRIORIDADE,
  ROTULO_TIPO,
  TICKET_TYPES,
  TIPOS_DE_ACAO_DE_ENTRADA,
  descreverCriterio,
  regexInvalida,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { listarAcordos, type AcordoView } from '../../api/configuracao';
import { listarCategorias, listarTimes, type CategoriaView } from '../../api/endpoints';
import {
  criarRegraDeEntrada,
  editarRegraDeEntrada,
  listarRegrasDeEntrada,
  removerRegraDeEntrada,
  simularEntrada,
} from '../../api/regras';

/**
 * As regras que classificam o que entra.
 *
 * O motor, a API e os testes existem desde a Fase 2; o que faltava era
 * isto. Até aqui a regra se escrevia por `curl`, e escrever regra de
 * classificação por `curl` quer dizer que ninguém escreve — a fila fica
 * sem classificação e cada mensagem é triada à mão, para sempre.
 *
 * Duas coisas que a tela precisa deixar óbvias, porque são a fonte de
 * toda confusão com regra em lista:
 *
 * 1. **A ordem importa.** A regra de baixo sobrescreve a de cima no
 *    mesmo campo. Por isso a posição aparece, e se move.
 * 2. **Regra que casa não é a última palavra**, a não ser que pare. Por
 *    isso "para por aqui" é um selo visível, e não uma caixinha
 *    escondida no formulário.
 */
export function RegrasDeEntrada() {
  const [regras, setRegras] = useState<RegraDeEntradaView[] | null>(null);
  const [categorias, setCategorias] = useState<CategoriaView[]>([]);
  const [times, setTimes] = useState<TimeView[]>([]);
  const [acordos, setAcordos] = useState<AcordoView[]>([]);
  const [editando, setEditando] = useState<RegraDeEntradaView | 'nova' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setRegras(await listarRegrasDeEntrada());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as regras.'));
  }, [recarregar]);

  useEffect(() => {
    void listarCategorias().then(setCategorias).catch(() => undefined);
    void listarTimes().then(setTimes).catch(() => undefined);
    void listarAcordos().then(setAcordos).catch(() => undefined);
  }, []);

  const nomes = useMemo(
    () => ({
      categoria: (id: string) => categorias.find((c) => c.id === id)?.name,
      time: (id: string) => times.find((t) => t.id === id)?.name,
      acordo: (id: string) => acordos.find((a) => a.id === id)?.name,
    }),
    [categorias, times, acordos],
  );

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');

  /**
   * Troca esta regra de lugar com a vizinha.
   *
   * Troca as duas posições em vez de renumerar a lista inteira: só duas
   * linhas mudam, e a numeração com folga de dez continua servindo para
   * encaixar uma regra no meio depois.
   */
  async function mover(indice: number, direcao: -1 | 1) {
    const lista = regras ?? [];
    const alvo = lista[indice + direcao];
    const atual = lista[indice];
    if (!alvo || !atual) return;

    setErro(null);
    try {
      await editarRegraDeEntrada(atual.id, { position: alvo.position });
      await editarRegraDeEntrada(alvo.id, { position: atual.position });
      await recarregar();
    } catch (e) {
      falhar(e);
    }
  }

  return (
    <div className="pilha" style={{ maxWidth: 940 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Regras de entrada</h2>
          <p>
            O que fazer com a mensagem que chega antes de ela virar chamado: classificar,
            encaminhar, priorizar — ou descartar.
          </p>
        </div>
        {editando ? null : (
          <button type="button" className="btn -primario" onClick={() => setEditando('nova')}>
            Nova regra
          </button>
        )}
      </div>

      <div className="alerta-bloco -info">
        <span aria-hidden="true">i</span>
        <span>
          As regras são avaliadas de cima para baixo, e a de baixo sobrescreve a de cima no
          mesmo campo. Quem quiser que a sua seja a última palavra marca <strong>para por
          aqui</strong>. O descarte sempre interrompe — não faz sentido classificar o que não
          vai virar chamado.
        </span>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {editando ? (
        <Editor
          regra={editando === 'nova' ? null : editando}
          categorias={categorias}
          times={times}
          acordos={acordos}
          aoFechar={() => setEditando(null)}
          aoSalvar={async (dados) => {
            setErro(null);
            if (editando === 'nova') await criarRegraDeEntrada(dados);
            else await editarRegraDeEntrada(editando.id, dados);
            setEditando(null);
            await recarregar();
          }}
        />
      ) : null}

      {!regras ? (
        <div className="sk sk-bloco" />
      ) : regras.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma regra</h3>
          <p>
            Sem regra, tudo o que entra chega sem categoria e sem time, e alguém tria à mão.
            Comece pela mensagem que você mais recebe.
          </p>
        </div>
      ) : (
        <div className="pilha-sm">
          {regras.map((regra, i) => (
            <Cartao
              key={regra.id}
              regra={regra}
              nomes={nomes}
              primeira={i === 0}
              ultima={i === regras.length - 1}
              aoMover={(d) => void mover(i, d)}
              aoEditar={() => setEditando(regra)}
              aoAlternar={() => {
                setErro(null);
                void editarRegraDeEntrada(regra.id, { isActive: !regra.isActive })
                  .then(recarregar)
                  .catch(falhar);
              }}
              aoRemover={() => {
                setErro(null);
                void removerRegraDeEntrada(regra.id).then(recarregar).catch(falhar);
              }}
            />
          ))}
        </div>
      )}

      <Simulador categorias={categorias} />
    </div>
  );
}

// ---------------------------------------------------------------------
// A regra na lista
// ---------------------------------------------------------------------

type Nomes = {
  categoria: (id: string) => string | undefined;
  time: (id: string) => string | undefined;
  acordo: (id: string) => string | undefined;
};

/**
 * A ação em português, com os nomes no lugar dos ids.
 *
 * "Mandar para o time 9f3c…" não responde nada. E quando o destino foi
 * apagado, a frase diz isso: a regra continua gravada e o motor a
 * ignora em silêncio na hora de aplicar — quem olha a lista precisa
 * saber que aquela linha não faz mais nada.
 */
function descreverAcao(acao: IntakeAction, nomes: Nomes): string {
  const rotulo = ROTULO_ACAO_DE_ENTRADA[acao.tipo];
  const sumiu = 'que não existe mais';

  switch (acao.tipo) {
    case 'DEFINIR_CATEGORIA':
      return `${rotulo} ${nomes.categoria(acao.categoryId) ?? sumiu}`;
    case 'ATRIBUIR_TIME':
      return `${rotulo} ${nomes.time(acao.teamId) ?? sumiu}`;
    case 'DEFINIR_URGENCIA':
      return `${rotulo}: ${ROTULO_PRIORIDADE[acao.urgency]}`;
    case 'DEFINIR_TIPO':
      return `${rotulo}: ${ROTULO_TIPO[acao.ticketType]}`;
    case 'APLICAR_ACORDO':
      return `${rotulo}: ${acao.agreementIds.map((id) => nomes.acordo(id) ?? sumiu).join(', ')}`;
    case 'DESCARTAR':
      return `${rotulo} — "${acao.motivo}"`;
  }
}

function Cartao({
  regra,
  nomes,
  primeira,
  ultima,
  aoMover,
  aoEditar,
  aoAlternar,
  aoRemover,
}: {
  regra: RegraDeEntradaView;
  nomes: Nomes;
  primeira: boolean;
  ultima: boolean;
  aoMover: (direcao: -1 | 1) => void;
  aoEditar: () => void;
  aoAlternar: () => void;
  aoRemover: () => void;
}) {
  const descarta = regra.actions.some((a) => a.tipo === 'DESCARTAR');

  return (
    <section className="card" style={regra.isActive ? undefined : { opacity: 0.6 }}>
      <div className="card-topo">
        <h3 className="card-titulo">{regra.name}</h3>
        <div className="linha" style={{ gap: 'var(--e-1)' }}>
          {regra.isActive ? null : <span className="selo -neutro">Desativada</span>}
          {regra.stopOnMatch ? <span className="selo -info">Para por aqui</span> : null}
          {descarta ? <span className="selo -aviso">Descarta</span> : null}
        </div>
      </div>

      <div className="card-corpo pilha-sm">
        <p className="campo-ajuda" style={{ margin: 0 }}>
          Quando {regra.match === 'OU' ? 'qualquer um destes' : 'todos estes'}:
        </p>
        <ul className="lista-simples">
          {regra.criteria.map((c, i) => (
            <li key={i}>{descreverCriterio(c, nomes.categoria)}</li>
          ))}
        </ul>

        <p className="campo-ajuda" style={{ margin: 0 }}>Faça:</p>
        <ul className="lista-simples">
          {regra.actions.map((a, i) => (
            <li key={i}>{descreverAcao(a, nomes)}</li>
          ))}
        </ul>
      </div>

      <div className="card-rodape linha-entre">
        <div className="linha" style={{ gap: 'var(--e-1)' }}>
          <button
            type="button"
            className="btn -fantasma -sm"
            disabled={primeira}
            aria-label={`Subir a regra ${regra.name}`}
            onClick={() => aoMover(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="btn -fantasma -sm"
            disabled={ultima}
            aria-label={`Descer a regra ${regra.name}`}
            onClick={() => aoMover(1)}
          >
            ↓
          </button>
        </div>

        <div className="linha" style={{ gap: 'var(--e-1)' }}>
          <button type="button" className="btn -fantasma -sm" onClick={aoAlternar}>
            {regra.isActive ? 'Desativar' : 'Ativar'}
          </button>
          <button type="button" className="btn -secundario -sm" onClick={aoEditar}>
            Editar
          </button>
          <button type="button" className="btn -perigo -sm" onClick={aoRemover}>
            Apagar
          </button>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------
// O construtor
// ---------------------------------------------------------------------

/** O critério que uma linha nova estreia. */
const CRITERIO_NOVO: IntakeCriterion = { campo: 'assunto', operador: 'contem', valor: '' };

/**
 * A ação com os campos que o tipo dela pede.
 *
 * Trocar o tipo no seletor troca a ação inteira, e não só o rótulo: uma
 * `ATRIBUIR_TIME` que guardasse `categoryId` de quando era outra coisa
 * seria recusada pela API com uma mensagem sobre um campo que a tela
 * não mostra mais.
 */
function acaoNova(tipo: IntakeAction['tipo']): IntakeAction {
  switch (tipo) {
    case 'DEFINIR_CATEGORIA':
      return { tipo, categoryId: '' };
    case 'ATRIBUIR_TIME':
      return { tipo, teamId: '' };
    case 'DEFINIR_URGENCIA':
      return { tipo, urgency: 3 };
    case 'DEFINIR_TIPO':
      return { tipo, ticketType: 'INCIDENTE' };
    case 'APLICAR_ACORDO':
      return { tipo, agreementIds: [] };
    case 'DESCARTAR':
      return { tipo, motivo: '' };
  }
}

function Editor({
  regra,
  categorias,
  times,
  acordos,
  aoFechar,
  aoSalvar,
}: {
  regra: RegraDeEntradaView | null;
  categorias: CategoriaView[];
  times: TimeView[];
  acordos: AcordoView[];
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    match: 'E' | 'OU';
    criteria: IntakeCriterion[];
    actions: IntakeAction[];
    stopOnMatch: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(regra?.name ?? '');
  const [match, setMatch] = useState<'E' | 'OU'>(regra?.match ?? 'E');
  const [criteria, setCriteria] = useState<IntakeCriterion[]>(
    regra?.criteria.length ? regra.criteria : [CRITERIO_NOVO],
  );
  const [actions, setActions] = useState<IntakeAction[]>(
    regra?.actions.length ? regra.actions : [acaoNova('DEFINIR_CATEGORIA')],
  );
  const [stopOnMatch, setStopOnMatch] = useState(regra?.stopOnMatch ?? false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function trocarCriterio(i: number, novo: IntakeCriterion) {
    setCriteria(criteria.map((c, j) => (j === i ? novo : c)));
  }

  /**
   * Trocar o campo pode invalidar o operador escolhido.
   *
   * Canal e categoria só aceitam "igual", e o valor deles é um código —
   * guardar o texto que estava lá faria a regra comparar "impressora"
   * com um canal.
   */
  function trocarCampo(i: number, campo: IntakeCriterion['campo']) {
    const soIgual = CAMPOS_SO_IGUAL.includes(campo);
    const atual = criteria[i]!;

    trocarCriterio(i, {
      campo,
      operador: soIgual ? 'igual' : atual.operador,
      valor: soIgual ? '' : atual.valor,
    } as IntakeCriterion);
  }

  const problemas = useMemo(() => {
    const lista: string[] = [];

    criteria.forEach((c, i) => {
      if (!c.valor.trim()) lista.push(`Critério ${i + 1}: falta o valor a comparar.`);
      else if (c.operador === 'regex') {
        const problema = regexInvalida(c.valor);
        if (problema) lista.push(`Critério ${i + 1}: ${problema}`);
      }
    });

    actions.forEach((a, i) => {
      const falta =
        (a.tipo === 'DEFINIR_CATEGORIA' && !a.categoryId) ||
        (a.tipo === 'ATRIBUIR_TIME' && !a.teamId) ||
        (a.tipo === 'APLICAR_ACORDO' && a.agreementIds.length === 0) ||
        (a.tipo === 'DESCARTAR' && !a.motivo.trim());

      if (falta) lista.push(`Ação ${i + 1}: falta escolher o destino.`);
    });

    return lista;
  }, [criteria, actions]);

  return (
    <section className="card">
      <div className="card-topo">
        <h3 className="card-titulo">{regra ? 'Editar regra' : 'Nova regra'}</h3>
      </div>

      <form
        className="card-corpo pilha"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setSalvando(true);
          void aoSalvar({ name, match, criteria, actions, stopOnMatch })
            .catch((err) =>
              setErro(err instanceof ErroDaApi ? err.message : 'Não foi possível salvar.'),
            )
            .finally(() => setSalvando(false));
        }}
      >
        <div className="campo">
          <label className="campo-rotulo" htmlFor="nome-regra">
            Nome da regra
          </label>
          <input
            id="nome-regra"
            className="input"
            required
            minLength={2}
            maxLength={120}
            placeholder="Nota fiscal vai para o financeiro"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="campo-ajuda">
            É o que aparece na conversa do chamado, dizendo por que ele foi classificado assim.
          </span>
        </div>

        <fieldset className="pilha-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="campo-rotulo">Quando</legend>

          <div className="linha" style={{ gap: 'var(--e-2)', alignItems: 'center' }}>
            <label className="so-leitor" htmlFor="conectivo">
              Como combinar os critérios
            </label>
            <select
              id="conectivo"
              className="select -auto"
              value={match}
              onChange={(e) => setMatch(e.target.value as 'E' | 'OU')}
            >
              <option value="E">Todos os critérios</option>
              <option value="OU">Qualquer um dos critérios</option>
            </select>
          </div>

          {criteria.map((criterio, i) => (
            <LinhaDeCriterio
              key={i}
              indice={i}
              criterio={criterio}
              categorias={categorias}
              podeRemover={criteria.length > 1}
              aoTrocarCampo={(campo) => trocarCampo(i, campo)}
              aoTrocar={(novo) => trocarCriterio(i, novo)}
              aoRemover={() => setCriteria(criteria.filter((_, j) => j !== i))}
            />
          ))}

          <div>
            <button
              type="button"
              className="btn -fantasma -sm"
              onClick={() => setCriteria([...criteria, CRITERIO_NOVO])}
            >
              Mais um critério
            </button>
          </div>
        </fieldset>

        <fieldset className="pilha-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="campo-rotulo">Faça</legend>

          {actions.map((acao, i) => (
            <LinhaDeAcao
              key={i}
              indice={i}
              acao={acao}
              categorias={categorias}
              times={times}
              acordos={acordos}
              podeRemover={actions.length > 1}
              aoTrocar={(nova) => setActions(actions.map((a, j) => (j === i ? nova : a)))}
              aoRemover={() => setActions(actions.filter((_, j) => j !== i))}
            />
          ))}

          <div>
            <button
              type="button"
              className="btn -fantasma -sm"
              onClick={() => setActions([...actions, acaoNova('ATRIBUIR_TIME')])}
            >
              Mais uma ação
            </button>
          </div>
        </fieldset>

        <label className="linha" style={{ gap: 'var(--e-2)', alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={stopOnMatch}
            onChange={(e) => setStopOnMatch(e.target.checked)}
          />
          <span>
            Para por aqui
            <span className="campo-ajuda" style={{ display: 'block' }}>
              Quando esta regra casar, as de baixo não são avaliadas. Sem isso, uma regra mais
              genérica lá embaixo sobrescreve o que esta decidiu.
            </span>
          </span>
        </label>

        {problemas.length > 0 ? (
          <div className="alerta-bloco -aviso">
            <span aria-hidden="true">!</span>
            <span>
              {problemas.map((p) => (
                <span key={p} style={{ display: 'block' }}>
                  {p}
                </span>
              ))}
            </span>
          </div>
        ) : null}

        {erro ? (
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        <div className="linha" style={{ gap: 'var(--e-2)' }}>
          <button
            type="submit"
            className="btn -primario"
            disabled={salvando || problemas.length > 0}
          >
            {salvando ? 'Salvando…' : 'Salvar regra'}
          </button>
          <button type="button" className="btn -fantasma" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

function LinhaDeCriterio({
  indice,
  criterio,
  categorias,
  podeRemover,
  aoTrocarCampo,
  aoTrocar,
  aoRemover,
}: {
  indice: number;
  criterio: IntakeCriterion;
  categorias: CategoriaView[];
  podeRemover: boolean;
  aoTrocarCampo: (campo: IntakeCriterion['campo']) => void;
  aoTrocar: (novo: IntakeCriterion) => void;
  aoRemover: () => void;
}) {
  const soIgual = CAMPOS_SO_IGUAL.includes(criterio.campo);
  const problema = criterio.operador === 'regex' ? regexInvalida(criterio.valor) : null;

  return (
    <div className="pilha-sm">
      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <label className="so-leitor" htmlFor={`campo-${indice}`}>
          Campo do critério {indice + 1}
        </label>
        <select
          id={`campo-${indice}`}
          className="select -auto"
          value={criterio.campo}
          onChange={(e) => aoTrocarCampo(e.target.value as IntakeCriterion['campo'])}
        >
          {CAMPOS_DE_CRITERIO.map((c) => (
            <option key={c} value={c}>
              {ROTULO_CAMPO_DE_CRITERIO[c]}
            </option>
          ))}
        </select>

        <label className="so-leitor" htmlFor={`operador-${indice}`}>
          Operador do critério {indice + 1}
        </label>
        <select
          id={`operador-${indice}`}
          className="select -auto"
          value={criterio.operador}
          disabled={soIgual}
          onChange={(e) =>
            aoTrocar({ ...criterio, operador: e.target.value } as IntakeCriterion)
          }
        >
          {(soIgual ? (['igual'] as const) : OPERADORES_DE_CRITERIO).map((o) => (
            <option key={o} value={o}>
              {ROTULO_OPERADOR[o]}
            </option>
          ))}
        </select>

        <label className="so-leitor" htmlFor={`valor-${indice}`}>
          Valor do critério {indice + 1}
        </label>
        {criterio.campo === 'canal' ? (
          <select
            id={`valor-${indice}`}
            className="select -auto"
            value={criterio.valor}
            onChange={(e) => aoTrocar({ ...criterio, valor: e.target.value } as IntakeCriterion)}
          >
            <option value="">Escolha o canal</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CANAL[c]}
              </option>
            ))}
          </select>
        ) : criterio.campo === 'categoria' ? (
          <select
            id={`valor-${indice}`}
            className="select -auto"
            value={criterio.valor}
            onChange={(e) => aoTrocar({ ...criterio, valor: e.target.value } as IntakeCriterion)}
          >
            <option value="">Escolha a categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`valor-${indice}`}
            className="input"
            style={{ flex: '1 1 220px' }}
            placeholder={criterio.operador === 'regex' ? '^nf-\\d+' : 'nota fiscal'}
            value={criterio.valor}
            onChange={(e) => aoTrocar({ ...criterio, valor: e.target.value } as IntakeCriterion)}
          />
        )}

        {podeRemover ? (
          <button
            type="button"
            className="btn -fantasma -sm"
            aria-label={`Tirar o critério ${indice + 1}`}
            onClick={aoRemover}
          >
            ×
          </button>
        ) : null}
      </div>

      {problema ? <span className="campo-erro">{problema}</span> : null}
    </div>
  );
}

function LinhaDeAcao({
  indice,
  acao,
  categorias,
  times,
  acordos,
  podeRemover,
  aoTrocar,
  aoRemover,
}: {
  indice: number;
  acao: IntakeAction;
  categorias: CategoriaView[];
  times: TimeView[];
  acordos: AcordoView[];
  podeRemover: boolean;
  aoTrocar: (nova: IntakeAction) => void;
  aoRemover: () => void;
}) {
  return (
    <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
      <label className="so-leitor" htmlFor={`acao-${indice}`}>
        Tipo da ação {indice + 1}
      </label>
      <select
        id={`acao-${indice}`}
        className="select -auto"
        value={acao.tipo}
        onChange={(e) => aoTrocar(acaoNova(e.target.value as IntakeAction['tipo']))}
      >
        {TIPOS_DE_ACAO_DE_ENTRADA.map((t) => (
          <option key={t} value={t}>
            {ROTULO_ACAO_DE_ENTRADA[t]}
          </option>
        ))}
      </select>

      <label className="so-leitor" htmlFor={`destino-${indice}`}>
        Destino da ação {indice + 1}
      </label>

      {acao.tipo === 'DEFINIR_CATEGORIA' ? (
        <select
          id={`destino-${indice}`}
          className="select -auto"
          value={acao.categoryId}
          onChange={(e) => aoTrocar({ ...acao, categoryId: e.target.value })}
        >
          <option value="">Escolha a categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : acao.tipo === 'ATRIBUIR_TIME' ? (
        <select
          id={`destino-${indice}`}
          className="select -auto"
          value={acao.teamId}
          onChange={(e) => aoTrocar({ ...acao, teamId: e.target.value })}
        >
          <option value="">Escolha o time</option>
          {times.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      ) : acao.tipo === 'DEFINIR_URGENCIA' ? (
        <select
          id={`destino-${indice}`}
          className="select -auto"
          value={acao.urgency}
          onChange={(e) =>
            aoTrocar({ ...acao, urgency: Number(e.target.value) as typeof acao.urgency })
          }
        >
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <option key={n} value={n}>
              {ROTULO_PRIORIDADE[n]}
            </option>
          ))}
        </select>
      ) : acao.tipo === 'DEFINIR_TIPO' ? (
        <select
          id={`destino-${indice}`}
          className="select -auto"
          value={acao.ticketType}
          onChange={(e) =>
            aoTrocar({ ...acao, ticketType: e.target.value as typeof acao.ticketType })
          }
        >
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </select>
      ) : acao.tipo === 'APLICAR_ACORDO' ? (
        <select
          id={`destino-${indice}`}
          className="select -auto"
          multiple
          size={Math.min(4, Math.max(2, acordos.length))}
          value={acao.agreementIds}
          onChange={(e) =>
            aoTrocar({
              ...acao,
              agreementIds: [...e.target.selectedOptions].map((o) => o.value),
            })
          }
        >
          {acordos.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`destino-${indice}`}
          className="input"
          style={{ flex: '1 1 260px' }}
          placeholder="Por que esta mensagem não vira chamado"
          value={acao.motivo}
          onChange={(e) => aoTrocar({ ...acao, motivo: e.target.value })}
        />
      )}

      {podeRemover ? (
        <button
          type="button"
          className="btn -fantasma -sm"
          aria-label={`Tirar a ação ${indice + 1}`}
          onClick={aoRemover}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// O simulador
// ---------------------------------------------------------------------

/**
 * O que aconteceria com esta mensagem agora.
 *
 * Existe porque o sintoma de uma regra errada é cruel: ela simplesmente
 * não casa, em silêncio, e a mensagem cai na fila sem classificação.
 * Sem isto, o jeito de descobrir por quê é mandar um e-mail de verdade
 * e ver onde ele cai — e esperar a próxima passada do processamento.
 *
 * Roda no servidor, no mesmo motor e sobre as mesmas regras **ativas**.
 * Isso quer dizer que uma regra desativada não aparece aqui: a
 * simulação mostra o que acontece, não o que aconteceria.
 */
function Simulador({ categorias }: { categorias: CategoriaView[] }) {
  const [assunto, setAssunto] = useState('');
  const [corpo, setCorpo] = useState('');
  const [remetente, setRemetente] = useState('');
  const [canal, setCanal] = useState<(typeof CHANNELS)[number]>('EMAIL');
  const [resultado, setResultado] = useState<SimulacaoDeEntradaView | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);

  return (
    <section className="card">
      <div className="card-topo">
        <h3 className="card-titulo">Testar uma mensagem</h3>
      </div>

      <form
        className="card-corpo pilha-sm"
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          setRodando(true);
          void simularEntrada({ assunto, corpo, remetente, canal })
            .then(setResultado)
            .catch((err) =>
              setErro(err instanceof ErroDaApi ? err.message : 'Não foi possível simular.'),
            )
            .finally(() => setRodando(false));
        }}
      >
        <p className="campo-ajuda" style={{ margin: 0 }}>
          Escreva uma mensagem de mentira e veja onde ela cairia. Vale para as regras
          <strong> ativas</strong>, como valeria para um e-mail de verdade.
        </p>

        <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
          <div className="campo" style={{ flex: '1 1 320px' }}>
            <label className="campo-rotulo" htmlFor="sim-assunto">
              Assunto
            </label>
            <input
              id="sim-assunto"
              className="input"
              placeholder="A impressora do 3º andar parou"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
            />
          </div>

          <div className="campo" style={{ flex: '1 1 240px' }}>
            <label className="campo-rotulo" htmlFor="sim-remetente">
              Quem escreveu
            </label>
            <input
              id="sim-remetente"
              className="input"
              placeholder="marina@cliente.com.br"
              value={remetente}
              onChange={(e) => setRemetente(e.target.value)}
            />
          </div>

          <div className="campo">
            <label className="campo-rotulo" htmlFor="sim-canal">
              Canal
            </label>
            <select
              id="sim-canal"
              className="select -auto"
              value={canal}
              onChange={(e) => setCanal(e.target.value as (typeof CHANNELS)[number])}
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {ROTULO_CANAL[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          <label className="campo-rotulo" htmlFor="sim-corpo">
            Corpo da mensagem
          </label>
          <textarea
            id="sim-corpo"
            className="input"
            rows={3}
            placeholder="Luz laranja piscando desde ontem."
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
          />
        </div>

        <div>
          <button type="submit" className="btn -secundario" disabled={rodando}>
            {rodando ? 'Testando…' : 'Testar'}
          </button>
        </div>

        {erro ? (
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {resultado ? <Resultado simulacao={resultado} categorias={categorias} /> : null}
      </form>
    </section>
  );
}

function Resultado({
  simulacao,
  categorias,
}: {
  simulacao: SimulacaoDeEntradaView;
  categorias: CategoriaView[];
}) {
  const nada =
    !simulacao.descartar &&
    !simulacao.categoria &&
    !simulacao.time &&
    !simulacao.urgencia &&
    !simulacao.tipo &&
    !simulacao.acordos?.length;

  if (simulacao.regrasAplicadas.length === 0) {
    return (
      <div className="alerta-bloco -info">
        <span aria-hidden="true">i</span>
        <span>
          Nenhuma regra casou. A mensagem abriria chamado sem classificação, e alguém teria de
          triá-la à mão.
        </span>
      </div>
    );
  }

  return (
    <div className="pilha-sm">
      <div className={`alerta-bloco ${simulacao.descartar ? '-aviso' : '-sucesso'}`}>
        <span aria-hidden="true">{simulacao.descartar ? '!' : '✓'}</span>
        <span>
          {simulacao.descartar
            ? `A mensagem seria descartada: "${simulacao.descartar}" — e não viraria chamado.`
            : `Casou com ${simulacao.regrasAplicadas.length === 1 ? 'a regra' : 'as regras'} ${simulacao.regrasAplicadas.join(', ')}.`}
        </span>
      </div>

      {simulacao.descartar ? null : nada ? (
        <p className="campo-ajuda">
          As regras casaram e não mudaram nada — todas as ações apontam para algo que não existe
          mais.
        </p>
      ) : (
        <ul className="lista-simples">
          {simulacao.categoria ? <li>Categoria: {simulacao.categoria.name}</li> : null}
          {simulacao.time ? <li>Time: {simulacao.time.name}</li> : null}
          {simulacao.urgencia ? <li>Urgência: {ROTULO_PRIORIDADE[simulacao.urgencia]}</li> : null}
          {simulacao.tipo ? <li>Tipo: {ROTULO_TIPO[simulacao.tipo]}</li> : null}
          {simulacao.acordos?.length ? (
            <li>Acordos: {simulacao.acordos.map((a) => a.name).join(', ')}</li>
          ) : null}
        </ul>
      )}

      {simulacao.regrasAplicadas.length > 1 && !simulacao.descartar ? (
        <p className="campo-ajuda">
          Mais de uma regra casou, e a de baixo ganhou onde as duas decidiam o mesmo campo.
          Marque <strong>para por aqui</strong> na que deve ter a última palavra.
        </p>
      ) : null}

      {categorias.length === 0 ? (
        <p className="campo-ajuda">Nenhuma categoria cadastrada ainda.</p>
      ) : null}
    </div>
  );
}
