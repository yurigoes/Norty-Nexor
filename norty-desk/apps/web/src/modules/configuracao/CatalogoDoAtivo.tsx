import { useCallback, useEffect, useState } from 'react';
import type {
  EscreverLocalizacaoRequest,
  EscreverModeloDeAtivoRequest,
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
} from '@norty-desk/shared';
import { ASSET_KINDS, ROTULO_ATIVO } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarFabricante,
  criarLocalizacao,
  criarModeloDeAtivo,
  editarFabricante,
  editarLocalizacao,
  editarModeloDeAtivo,
  listarFabricantes,
  listarLocalizacoes,
  listarModelosDeAtivo,
  removerFabricante,
  removerLocalizacao,
  removerModeloDeAtivo,
} from '../../api/catalogoAtivo';

type Aba = 'LOCAIS' | 'FABRICANTES' | 'MODELOS';

/**
 * O catálogo que o cadastro do ativo escolhe em vez de digitar.
 *
 * Enquanto localização, fabricante e modelo eram texto livre, "HP",
 * "hp" e "Hewlett-Packard" eram três fabricantes para quem conta e um
 * só para quem olha. Aqui o valor nasce uma vez e o ativo aponta.
 */
export function CatalogoDoAtivo() {
  const [aba, setAba] = useState<Aba>('LOCAIS');

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Catálogo do ativo</h2>
          <p>Onde o equipamento fica, de quem ele é e qual é o modelo.</p>
        </div>
      </div>

      <div className="linha" style={{ gap: 'var(--e-2)' }}>
        {(
          [
            ['LOCAIS', 'Localizações'],
            ['FABRICANTES', 'Fabricantes'],
            ['MODELOS', 'Modelos'],
          ] as [Aba, string][]
        ).map(([chave, rotulo]) => (
          <button
            key={chave}
            type="button"
            className={`btn -sm ${aba === chave ? '-primario' : '-secundario'}`}
            onClick={() => setAba(chave)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === 'LOCAIS' ? <ListaDeLocalizacoes /> : null}
      {aba === 'FABRICANTES' ? <ListaDeFabricantes /> : null}
      {aba === 'MODELOS' ? <ListaDeModelos /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// Localizações
// ---------------------------------------------------------------------

function ListaDeLocalizacoes() {
  const [locais, setLocais] = useState<LocalizacaoView[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<LocalizacaoView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setLocais(await listarLocalizacoes());
  }, []);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar as localizações.'));
  }, [recarregar]);

  const apagar = (local: LocalizacaoView) => {
    setErro(null);
    void removerLocalizacao(local.id)
      .then(setLocais)
      .catch((e: unknown) =>
        setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível apagar.'),
      );
  };

  if (!locais) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha">
      <div className="linha-entre">
        <span className="campo-ajuda">
          A lista sai na ordem do caminho: a sublocalização aparece logo abaixo do lugar que a
          contém.
        </span>
        <button type="button" className="btn -primario -sm" onClick={() => setEmEdicao('novo')}>
          Nova localização
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {locais.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma localização</h3>
          <p>
            Prédio, andar, sala. Quem atende no local precisa saber onde é — e o inventário por
            andar só existe se o andar existir aqui.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Local</th>
                  <th>Observação</th>
                  <th className="-num">Ativos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {locais.map((l) => (
                  <tr key={l.id} style={l.isActive ? undefined : { opacity: 0.55 }}>
                    <td className="tabela-titulo-celula">
                      {/* O recuo desenha a árvore que o caminho já ordena. */}
                      <span style={{ paddingLeft: nivel(l.path) * 16 }}>{l.name}</span>
                      {l.parentId ? (
                        <span className="campo-ajuda" style={{ display: 'block' }}>
                          {l.path}
                        </span>
                      ) : null}
                      {l.isActive ? null : <span className="selo -neutro">inativa</span>}
                    </td>
                    <td>{l.notes ?? '—'}</td>
                    <td className="-num">{l.assetCount}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(l)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn -perigo -sm"
                        onClick={() => apagar(l)}
                      >
                        Apagar
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
        <FormularioDeLocalizacao
          local={emEdicao === 'novo' ? null : emEdicao}
          locais={locais}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            const lista =
              emEdicao === 'novo'
                ? await criarLocalizacao(dados)
                : await editarLocalizacao(emEdicao.id, dados);
            setLocais(lista);
            setEmEdicao(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Quantos níveis o caminho tem acima deste. */
function nivel(caminho: string): number {
  return caminho.split(' > ').length - 1;
}

function FormularioDeLocalizacao({
  local,
  locais,
  aoFechar,
  aoSalvar,
}: {
  local: LocalizacaoView | null;
  locais: LocalizacaoView[];
  aoFechar: () => void;
  aoSalvar: (dados: EscreverLocalizacaoRequest) => Promise<void>;
}) {
  const [campos, setCampos] = useState({
    name: local?.name ?? '',
    parentId: local?.parentId ?? '',
    notes: local?.notes ?? '',
    isActive: local?.isActive ?? true,
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const definir = (mudanca: Partial<typeof campos>) =>
    setCampos((atual) => ({ ...atual, ...mudanca }));

  // Pai não pode ser ela mesma nem a própria descendência — a API
  // recusa, mas oferecer a opção só para recusar depois é ruim.
  const candidatos = locais.filter(
    (l) => !local || (l.id !== local.id && !l.path.startsWith(`${local.path} > `)),
  );

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={local ? 'Editar localização' : 'Nova localização'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{local ? 'Editar localização' : 'Nova localização'}</h3>
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
              name: campos.name,
              parentId: campos.parentId || null,
              notes: campos.notes || null,
              isActive: campos.isActive,
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
              <label className="campo-rotulo" htmlFor="nome-local">
                Nome
              </label>
              <input
                id="nome-local"
                className="input"
                required
                minLength={1}
                placeholder="Sala 302"
                value={campos.name}
                onChange={(e) => definir({ name: e.target.value })}
              />
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="pai-local">
                Fica dentro de
              </label>
              <select
                id="pai-local"
                className="select"
                value={campos.parentId}
                onChange={(e) => definir({ parentId: e.target.value })}
              >
                <option value="">Nível mais alto</option>
                {candidatos.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.path}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="obs-local">
                Observação
              </label>
              <input
                id="obs-local"
                className="input"
                maxLength={500}
                placeholder="Entrada pelo corredor dos fundos"
                value={campos.notes}
                onChange={(e) => definir({ notes: e.target.value })}
              />
              <span className="campo-ajuda">O que ajuda quem vai até lá.</span>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={campos.isActive}
                onChange={(e) => definir({ isActive: e.target.checked })}
              />
              <span className="switch-trilho">
                <span className="switch-bolinha" />
              </span>
              <span>Ativa</span>
            </label>
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
// Fabricantes
// ---------------------------------------------------------------------

function ListaDeFabricantes() {
  const [fabricantes, setFabricantes] = useState<FabricanteView[] | null>(null);
  const [name, setName] = useState('');
  const [renomeando, setRenomeando] = useState<{ id: string; name: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void listarFabricantes()
      .then(setFabricantes)
      .catch(() => setFabricantes([]));
  }, []);

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');

  return (
    <div className="pilha">
      <form
        className="linha"
        style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          setErro(null);
          void criarFabricante(name)
            .then((lista) => {
              setFabricantes(lista);
              setName('');
            })
            .catch(falhar);
        }}
      >
        <label className="so-leitor" htmlFor="nome-fabricante">
          Nome do fabricante
        </label>
        <input
          id="nome-fabricante"
          className="input"
          style={{ flex: '0 1 320px' }}
          required
          minLength={1}
          placeholder="Dell, HP, Lenovo…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn -primario -sm">
          Adicionar
        </button>
      </form>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!fabricantes ? (
        <div className="sk sk-bloco" />
      ) : fabricantes.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum fabricante</h3>
          <p>Quem fabricou o equipamento. O modelo pendura aqui.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Fabricante</th>
                  <th className="-num">Modelos</th>
                  <th className="-num">Ativos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {fabricantes.map((f) => (
                  <tr key={f.id}>
                    <td className="tabela-titulo-celula">
                      {renomeando?.id === f.id ? (
                        <form
                          className="linha"
                          style={{ gap: 'var(--e-2)' }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            setErro(null);
                            void editarFabricante(f.id, renomeando.name)
                              .then((lista) => {
                                setFabricantes(lista);
                                setRenomeando(null);
                              })
                              .catch(falhar);
                          }}
                        >
                          <label className="so-leitor" htmlFor={`renomear-${f.id}`}>
                            Novo nome
                          </label>
                          <input
                            id={`renomear-${f.id}`}
                            className="input"
                            required
                            autoFocus
                            value={renomeando.name}
                            onChange={(e) =>
                              setRenomeando({ id: f.id, name: e.target.value })
                            }
                          />
                          <button type="submit" className="btn -primario -sm">
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setRenomeando(null)}
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        f.name
                      )}
                    </td>
                    <td className="-num">{f.modelCount}</td>
                    <td className="-num">{f.assetCount}</td>
                    <td className="-num">
                      {renomeando?.id === f.id ? null : (
                        <>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setRenomeando({ id: f.id, name: f.name })}
                          >
                            Renomear
                          </button>
                          <button
                            type="button"
                            className="btn -perigo -sm"
                            onClick={() => {
                              setErro(null);
                              void removerFabricante(f.id).then(setFabricantes).catch(falhar);
                            }}
                          >
                            Apagar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------

function ListaDeModelos() {
  const [modelos, setModelos] = useState<ModeloDeAtivoView[] | null>(null);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [emEdicao, setEmEdicao] = useState<ModeloDeAtivoView | 'novo' | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void listarModelosDeAtivo()
      .then(setModelos)
      .catch(() => setModelos([]));
    void listarFabricantes()
      .then(setFabricantes)
      .catch(() => undefined);
  }, []);

  if (!modelos) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha">
      <div className="linha-entre">
        <span className="campo-ajuda">
          O modelo carrega o tipo do equipamento: escolher &quot;OptiPlex 7090&quot; no cadastro
          já diz que aquilo é um computador.
        </span>
        <button type="button" className="btn -primario -sm" onClick={() => setEmEdicao('novo')}>
          Novo modelo
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {modelos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum modelo</h3>
          <p>
            &quot;OptiPlex 7090&quot;, &quot;LaserJet M404&quot;. É o que faz duas máquinas
            iguais contarem como duas do mesmo modelo.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Modelo</th>
                  <th>Tipo</th>
                  <th>Fabricante</th>
                  <th className="-num">Ativos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {modelos.map((m) => (
                  <tr key={m.id}>
                    <td className="tabela-titulo-celula">{m.name}</td>
                    <td>{ROTULO_ATIVO[m.kind]}</td>
                    <td>{m.manufacturer?.name ?? '—'}</td>
                    <td className="-num">{m.assetCount}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setEmEdicao(m)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn -perigo -sm"
                        onClick={() => {
                          setErro(null);
                          void removerModeloDeAtivo(m.id)
                            .then(setModelos)
                            .catch((e: unknown) =>
                              setErro(
                                e instanceof ErroDaApi ? e.message : 'Não foi possível apagar.',
                              ),
                            );
                        }}
                      >
                        Apagar
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
        <FormularioDeModelo
          modelo={emEdicao === 'novo' ? null : emEdicao}
          fabricantes={fabricantes}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            const lista =
              emEdicao === 'novo'
                ? await criarModeloDeAtivo(dados)
                : await editarModeloDeAtivo(emEdicao.id, dados);
            setModelos(lista);
            setEmEdicao(null);
          }}
        />
      ) : null}
    </div>
  );
}

function FormularioDeModelo({
  modelo,
  fabricantes,
  aoFechar,
  aoSalvar,
}: {
  modelo: ModeloDeAtivoView | null;
  fabricantes: FabricanteView[];
  aoFechar: () => void;
  aoSalvar: (dados: EscreverModeloDeAtivoRequest) => Promise<void>;
}) {
  const [campos, setCampos] = useState({
    name: modelo?.name ?? '',
    kind: modelo?.kind ?? 'COMPUTADOR',
    manufacturerId: modelo?.manufacturer?.id ?? '',
  });
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const definir = (mudanca: Partial<typeof campos>) =>
    setCampos((atual) => ({ ...atual, ...mudanca }));

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={modelo ? 'Editar modelo' : 'Novo modelo'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{modelo ? 'Editar modelo' : 'Novo modelo'}</h3>
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
              name: campos.name,
              kind: campos.kind,
              manufacturerId: campos.manufacturerId || null,
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
              <label className="campo-rotulo" htmlFor="nome-modelo">
                Nome
              </label>
              <input
                id="nome-modelo"
                className="input"
                required
                minLength={1}
                placeholder="OptiPlex 7090"
                value={campos.name}
                onChange={(e) => definir({ name: e.target.value })}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-modelo">
                  Tipo
                </label>
                <select
                  id="tipo-modelo"
                  className="select"
                  value={campos.kind}
                  onChange={(e) => definir({ kind: e.target.value as ModeloDeAtivoView['kind'] })}
                >
                  {ASSET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ROTULO_ATIVO[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="fabricante-modelo">
                  Fabricante
                </label>
                <select
                  id="fabricante-modelo"
                  className="select"
                  value={campos.manufacturerId}
                  onChange={(e) => definir({ manufacturerId: e.target.value })}
                >
                  <option value="">Sem fabricante</option>
                  {fabricantes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
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
