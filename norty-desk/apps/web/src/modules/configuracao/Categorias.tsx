import { useCallback, useEffect, useState } from 'react';

import { ErroDaApi } from '../../api/cliente';
import {
  criarCategoria,
  editarCategoria,
  listarAcordos,
  removerCategoria,
  type AcordoView,
} from '../../api/configuracao';
import { listarCategorias, listarTimes, type CategoriaView, type TimeView } from '../../api/endpoints';
import { segundosParaHoras } from './formato';

/**
 * Categorias do catálogo.
 *
 * A categoria é onde a política de atendimento mora: ela decide o time
 * que recebe o chamado e os acordos de prazo que ele ganha ao nascer.
 * Sem esta tela, os dois só se configuravam por SQL — e por isso não se
 * configuravam.
 */
export function Categorias() {
  const [categorias, setCategorias] = useState<CategoriaView[] | null>(null);
  const [times, setTimes] = useState<TimeView[]>([]);
  const [acordos, setAcordos] = useState<AcordoView[]>([]);
  const [emEdicao, setEmEdicao] = useState<CategoriaView | 'nova' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCategorias(await listarCategorias());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as categorias.'));
    void listarTimes().then(setTimes).catch(() => undefined);
    void listarAcordos().then(setAcordos).catch(() => undefined);
  }, [recarregar]);

  // A árvore é rasa de propósito (categoria > subcategoria): aqui ela
  // vira uma lista com recuo, que é como ela é lida.
  const ordenadas = (categorias ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="pilha" style={{ maxWidth: 940 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Categorias</h2>
          <p>
            A categoria decide o time que recebe o chamado e os prazos que ele ganha ao nascer.
          </p>
        </div>
        <button type="button" className="btn -primario" onClick={() => setEmEdicao('nova')}>
          Nova categoria
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!categorias ? (
        <div className="sk sk-bloco" />
      ) : ordenadas.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma categoria</h3>
          <p>Sem categoria, o chamado nasce sem time e sem prazo.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Categoria</th>
                  <th>Time padrão</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((categoria) => (
                  <tr key={categoria.id}>
                    <td className="tabela-titulo-celula">{categoria.name}</td>
                    <td>{categoria.defaultTeam?.name ?? '—'}</td>
                    <td>
                      <span className={`selo ${categoria.isActive ? '-sucesso' : '-neutro'}`}>
                        {categoria.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(categoria)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => {
                          setErro(null);
                          void removerCategoria(categoria.id)
                            .then(recarregar)
                            .catch((e: unknown) =>
                              setErro(
                                e instanceof ErroDaApi
                                  ? e.message
                                  : 'Não foi possível remover.',
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
        <Formulario
          categoria={emEdicao === 'nova' ? null : emEdicao}
          categorias={ordenadas}
          times={times}
          acordos={acordos.filter((a) => a.isActive)}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'nova') await criarCategoria(dados);
            else await editarCategoria(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
        />
      ) : null}
    </div>
  );
}

function Formulario({
  categoria,
  categorias,
  times,
  acordos,
  aoFechar,
  aoSalvar,
}: {
  categoria: CategoriaView | null;
  categorias: CategoriaView[];
  times: TimeView[];
  acordos: AcordoView[];
  aoFechar: () => void;
  aoSalvar: (dados: {
    name: string;
    parentId?: string | null;
    defaultTeamId?: string | null;
    defaultUrgency?: number | null;
    defaultAgreementIds?: string[];
  }) => Promise<void>;
}) {
  const [nome, setNome] = useState(categoria?.name ?? '');
  const [pai, setPai] = useState(categoria?.parentId ?? '');
  const [time, setTime] = useState(categoria?.defaultTeam?.id ?? '');
  const [urgencia, setUrgencia] = useState('');
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={categoria ? 'Editar categoria' : 'Nova categoria'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{categoria ? 'Editar categoria' : 'Nova categoria'}</h3>
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
              ...(categoria ? {} : { parentId: pai || null }),
              defaultTeamId: time || null,
              defaultUrgency: urgencia ? Number(urgencia) : null,
              ...(escolhidos.length > 0 ? { defaultAgreementIds: escolhidos } : {}),
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
              <label className="campo-rotulo" htmlFor="nome-categoria">
                Nome
              </label>
              <input
                id="nome-categoria"
                className="input"
                required
                minLength={2}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>

            {!categoria ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="pai-categoria">
                  Dentro de
                </label>
                <select
                  id="pai-categoria"
                  className="select"
                  value={pai}
                  onChange={(e) => setPai(e.target.value)}
                >
                  <option value="">Nenhuma — é uma categoria de primeiro nível</option>
                  {categorias
                    .filter((c) => !c.parentId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
                <span className="campo-ajuda">
                  A árvore é rasa: categoria e subcategoria, e só.
                </span>
              </div>
            ) : null}

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="time-categoria">
                  Time que recebe
                </label>
                <select
                  id="time-categoria"
                  className="select"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                >
                  <option value="">Nenhum</option>
                  {times.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="urgencia-categoria">
                  Urgência padrão
                </label>
                <select
                  id="urgencia-categoria"
                  className="select"
                  value={urgencia}
                  onChange={(e) => setUrgencia(e.target.value)}
                >
                  <option value="">Deixa quem abre decidir</option>
                  {[5, 4, 3, 2, 1].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo">
              <span className="campo-rotulo">Prazos que o chamado ganha ao nascer</span>
              <div className="pilha-sm" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {acordos.length === 0 ? (
                  <span className="campo-ajuda">
                    Nenhum acordo cadastrado. Crie um em Configuração → SLA e calendários.
                  </span>
                ) : (
                  acordos.map((acordo) => (
                    <label key={acordo.id} className="check">
                      <input
                        type="checkbox"
                        checked={escolhidos.includes(acordo.id)}
                        onChange={(e) =>
                          setEscolhidos((atual) =>
                            e.target.checked
                              ? [...atual, acordo.id]
                              : atual.filter((id) => id !== acordo.id),
                          )
                        }
                      />
                      <span>
                        {acordo.name}{' '}
                        <span className="suave">
                          · {acordo.kind} {acordo.target} ·{' '}
                          {segundosParaHoras(acordo.durationSeconds)}h
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <span className="campo-ajuda">
                Um chamado precisa de TTO <em>e</em> TTR: marque os dois.
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
