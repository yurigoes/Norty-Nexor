import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EscreverLocalizacaoRequest,
  EscreverModeloDeAtivoRequest,
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
  RegraDeSistemaView,
  SistemasDoParqueView,
} from '@norty-desk/shared';
import { ASSET_KINDS, ROTULO_ATIVO, canonizarFabricante } from '@norty-desk/shared';

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
  apelidarFabricante,
  apelidarModelo,
  escreverRegraDeSistema,
  juntarFabricantes,
  juntarModelos,
  lerSistemasDoParque,
  listarRegrasDeSistema,
  reclassificarSistemas,
  removerApelidoDeModelo,
  removerRegraDeSistema,
  removerApelidoDeFabricante,
  removerFabricante,
  removerLocalizacao,
  removerModeloDeAtivo,
} from '../../api/catalogoAtivo';

type Aba = 'LOCAIS' | 'FABRICANTES' | 'MODELOS' | 'SISTEMAS';

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
            ['SISTEMAS', 'Sistemas operacionais'],
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
      {aba === 'SISTEMAS' ? <DicionarioDeSistemas /> : null}
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

/**
 * Por quais outros nomes este fabricante atende.
 *
 * São chaves, não texto de tela: o agente de inventário manda o que o
 * SMBIOS tiver, e o que fica gravado é a forma reduzida — minúsculas,
 * sem pontuação, sem forma jurídica. Mostrar assim é honesto: é o que o
 * dicionário compara, e maquiar faria a pessoa achar que a grafia
 * importa.
 *
 * O aviso de gêmeo aparece quando dois cadastros seriam o mesmo nome
 * para o dicionário. De hoje em diante isso não nasce — o cadastro novo
 * é recusado —, mas é o que sobrou de antes, e é a fila da junção.
 *
 * Serve fabricante e modelo: a lista de chaves é a mesma coisa nos dois,
 * e duas cópias divergiriam na primeira mudança.
 */
function Apelidos({
  aliases,
  gemeo,
  aoRemover,
}: {
  aliases: { id: string; alias: string }[];
  gemeo: string | undefined;
  aoRemover: (aliasId: string) => void;
}) {
  return (
    <div className="pilha-sm">
      {aliases.length === 0 ? (
        <span className="campo-ajuda">Só pelo próprio nome.</span>
      ) : (
        <div className="linha" style={{ gap: 'var(--e-1)', flexWrap: 'wrap' }}>
          {aliases.map((a) => (
            <span key={a.id} className="selo -contorno mono">
              {a.alias}
              <button
                type="button"
                className="selo-x"
                aria-label={`Tirar o apelido ${a.alias}`}
                onClick={() => aoRemover(a.id)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {gemeo ? (
        <span className="campo-ajuda">
          Parece ser o mesmo que <strong>{gemeo}</strong>. Se for, junte os dois.
        </span>
      ) : null}
    </div>
  );
}

function ListaDeFabricantes() {
  const [fabricantes, setFabricantes] = useState<FabricanteView[] | null>(null);
  const [name, setName] = useState('');
  const [renomeando, setRenomeando] = useState<{ id: string; name: string } | null>(null);
  const [apelidando, setApelidando] = useState<{ id: string; alias: string } | null>(null);
  const [juntando, setJuntando] = useState<{ id: string; absorvidoId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void listarFabricantes()
      .then(setFabricantes)
      .catch(() => setFabricantes([]));
  }, []);

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');

  // Dois cadastros que o dicionário leria como o mesmo nome. Não dá
  // para isso nascer daqui em diante — o cadastro novo é recusado —,
  // mas é exatamente o que fica num banco anterior ao dicionário. Sem
  // apontar, ninguém junta: quem olha a lista vê dois nomes diferentes.
  const gemeos = useMemo(() => {
    const porChave = new Map<string, FabricanteView[]>();

    for (const f of fabricantes ?? []) {
      const chave = canonizarFabricante(f.name)?.chaveCanonica;
      if (!chave) continue;
      porChave.set(chave, [...(porChave.get(chave) ?? []), f]);
    }

    const pares = new Map<string, string>();
    for (const iguais of porChave.values()) {
      if (iguais.length < 2) continue;
      for (const f of iguais) {
        pares.set(f.id, iguais.filter((o) => o.id !== f.id).map((o) => o.name).join(', '));
      }
    }

    return pares;
  }, [fabricantes]);

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
                  <th>Também atende por</th>
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
                    <td>
                      {apelidando?.id === f.id ? (
                        <form
                          className="linha"
                          style={{ gap: 'var(--e-2)' }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            setErro(null);
                            void apelidarFabricante(f.id, apelidando.alias)
                              .then((lista) => {
                                setFabricantes(lista);
                                setApelidando(null);
                              })
                              .catch(falhar);
                          }}
                        >
                          <label className="so-leitor" htmlFor={`apelido-${f.id}`}>
                            Nome que a varredura manda
                          </label>
                          <input
                            id={`apelido-${f.id}`}
                            className="input"
                            required
                            autoFocus
                            placeholder="Como a máquina escreve"
                            value={apelidando.alias}
                            onChange={(e) => setApelidando({ id: f.id, alias: e.target.value })}
                          />
                          <button type="submit" className="btn -primario -sm">
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setApelidando(null)}
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : juntando?.id === f.id ? (
                        <form
                          className="linha"
                          style={{ gap: 'var(--e-2)' }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            setErro(null);
                            void juntarFabricantes(f.id, juntando.absorvidoId)
                              .then((lista) => {
                                setFabricantes(lista);
                                setJuntando(null);
                              })
                              .catch(falhar);
                          }}
                        >
                          <label className="so-leitor" htmlFor={`juntar-${f.id}`}>
                            Cadastro que some dentro deste
                          </label>
                          <select
                            id={`juntar-${f.id}`}
                            className="select -auto"
                            required
                            value={juntando.absorvidoId}
                            onChange={(e) =>
                              setJuntando({ id: f.id, absorvidoId: e.target.value })
                            }
                          >
                            <option value="">Qual é o mesmo que este?</option>
                            {(fabricantes ?? [])
                              .filter((o) => o.id !== f.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.name}
                                </option>
                              ))}
                          </select>
                          <button type="submit" className="btn -perigo -sm">
                            Juntar os dois
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setJuntando(null)}
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <Apelidos
                          aliases={f.aliases}
                          gemeo={gemeos.get(f.id)}
                          aoRemover={(aliasId) => {
                            setErro(null);
                            void removerApelidoDeFabricante(f.id, aliasId)
                              .then(setFabricantes)
                              .catch(falhar);
                          }}
                        />
                      )}
                    </td>
                    <td className="-num">{f.modelCount}</td>
                    <td className="-num">{f.assetCount}</td>
                    <td className="-num">
                      {renomeando?.id === f.id || apelidando?.id === f.id || juntando?.id === f.id ? null : (
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
                            className="btn -fantasma -sm"
                            onClick={() => setApelidando({ id: f.id, alias: '' })}
                          >
                            Apelidar
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setJuntando({ id: f.id, absorvidoId: '' })}
                          >
                            Juntar com…
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
  const [apelidando, setApelidando] = useState<{ id: string; alias: string } | null>(null);
  const [juntando, setJuntando] = useState<{ id: string; absorvidoId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');

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
          já diz que aquilo é um computador. <strong>Apelidar</strong> é para o que a máquina
          manda no lugar do nome — a Lenovo reporta o código de fábrica
          (&quot;20XW00AABR&quot;), não &quot;ThinkPad T14 Gen 2&quot;.
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
                  <th>Também atende por</th>
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
                    <td>
                      {apelidando?.id === m.id ? (
                        <form
                          className="linha"
                          style={{ gap: 'var(--e-2)' }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            setErro(null);
                            void apelidarModelo(m.id, apelidando.alias)
                              .then((lista) => {
                                setModelos(lista);
                                setApelidando(null);
                              })
                              .catch(falhar);
                          }}
                        >
                          <label className="so-leitor" htmlFor={`apelido-modelo-${m.id}`}>
                            Nome que a varredura manda
                          </label>
                          <input
                            id={`apelido-modelo-${m.id}`}
                            className="input"
                            required
                            autoFocus
                            placeholder="Ex.: 20XW00AABR"
                            value={apelidando.alias}
                            onChange={(e) => setApelidando({ id: m.id, alias: e.target.value })}
                          />
                          <button type="submit" className="btn -primario -sm">
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setApelidando(null)}
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : juntando?.id === m.id ? (
                        <form
                          className="linha"
                          style={{ gap: 'var(--e-2)' }}
                          onSubmit={(e) => {
                            e.preventDefault();
                            setErro(null);
                            void juntarModelos(m.id, juntando.absorvidoId)
                              .then((lista) => {
                                setModelos(lista);
                                setJuntando(null);
                              })
                              .catch(falhar);
                          }}
                        >
                          <label className="so-leitor" htmlFor={`juntar-modelo-${m.id}`}>
                            Cadastro que some dentro deste
                          </label>
                          <select
                            id={`juntar-modelo-${m.id}`}
                            className="select -auto"
                            required
                            value={juntando.absorvidoId}
                            onChange={(e) => setJuntando({ id: m.id, absorvidoId: e.target.value })}
                          >
                            <option value="">Qual é o mesmo que este?</option>
                            {modelos
                              .filter((o) => o.id !== m.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.manufacturer ? `${o.manufacturer.name} ` : ''}
                                  {o.name}
                                </option>
                              ))}
                          </select>
                          <button type="submit" className="btn -perigo -sm">
                            Juntar os dois
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setJuntando(null)}
                          >
                            Cancelar
                          </button>
                        </form>
                      ) : (
                        <Apelidos
                          aliases={m.aliases}
                          gemeo={undefined}
                          aoRemover={(aliasId) => {
                            setErro(null);
                            void removerApelidoDeModelo(m.id, aliasId)
                              .then(setModelos)
                              .catch(falhar);
                          }}
                        />
                      )}
                    </td>
                    <td>{ROTULO_ATIVO[m.kind]}</td>
                    <td>{m.manufacturer?.name ?? '—'}</td>
                    <td className="-num">{m.assetCount}</td>
                    <td className="-num">
                      {apelidando?.id === m.id || juntando?.id === m.id ? null : (
                        <>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setEmEdicao(m)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setApelidando({ id: m.id, alias: '' })}
                          >
                            Apelidar
                          </button>
                          <button
                            type="button"
                            className="btn -fantasma -sm"
                            onClick={() => setJuntando({ id: m.id, absorvidoId: '' })}
                          >
                            Juntar com…
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

// ---------------------------------------------------------------------
// Sistemas operacionais
// ---------------------------------------------------------------------

/**
 * O dicionário de sistema operacional.
 *
 * Desenhada ao contrário das outras três abas, e de propósito: não há
 * cadastro para listar. O que existe é o parque — e a aba começa pelo
 * que ele tem, porque **não dá para ensinar o que ninguém sabe que
 * existe**. O caption estranho é justamente o que desaparece de qualquer
 * agrupamento, então ele aparece aqui em primeiro lugar, com a contagem
 * do lado.
 *
 * Cada linha de caption traz o que está gravado nos dois campos. Quem
 * olha decide: está certo, ou vale ensinar. Ensinar reclassifica o
 * parque na mesma chamada — ensinar e não reclassificar seria ensinar
 * para nada, porque a próxima varredura pode demorar dias ou nunca vir.
 */
function DicionarioDeSistemas() {
  const [parque, setParque] = useState<SistemasDoParqueView | null>(null);
  const [regras, setRegras] = useState<RegraDeSistemaView[]>([]);
  const [ensinando, setEnsinando] = useState<{
    caption: string;
    product: string;
    edition: string;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregar = () => {
    void lerSistemasDoParque()
      .then(setParque)
      .catch(() => setParque({ porProduto: [], captions: [] }));
    void listarRegrasDeSistema()
      .then(setRegras)
      .catch(() => undefined);
  };

  useEffect(recarregar, []);

  const falhar = (e: unknown) =>
    setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');

  if (!parque) return <div className="sk sk-bloco" />;

  const porRegra = new Map(regras.map((r) => [r.alias, r]));

  return (
    <div className="pilha">
      <div className="linha-entre">
        <span className="campo-ajuda">
          O agente manda o <code>Caption</code> do Windows, que é um texto só para duas perguntas:
          qual produto e qual edição. O dicionário separa as duas — é o que faz
          &quot;quantas máquinas ainda estão no Windows 10?&quot; ter resposta.
        </span>
        <button
          type="button"
          className="btn -secundario -sm"
          onClick={() => {
            setErro(null);
            setAviso(null);
            void reclassificarSistemas()
              .then((r) => {
                setAviso(
                  r.mudados === 0
                    ? `${r.lidos} máquina(s) conferida(s), nenhuma mudou.`
                    : `${r.mudados} de ${r.lidos} máquina(s) reclassificada(s).`,
                );
                recarregar();
              })
              .catch(falhar);
          }}
        >
          Reclassificar o parque
        </button>
      </div>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {aviso ? (
        <div className="alerta-bloco -info">
          <span aria-hidden="true">i</span>
          <span>{aviso}</span>
        </div>
      ) : null}

      {parque.captions.length === 0 ? (
        <div className="vazio">
          <h3>Nenhuma máquina reportou sistema operacional</h3>
          <p>
            Esta aba se enche sozinha quando o agente de inventário varre o parque. Não há o que
            cadastrar aqui antes disso.
          </p>
        </div>
      ) : (
        <>
          <section className="pilha-sm">
            <h3 className="titulo-secao">O parque hoje</h3>
            <div className="tabela-caixa">
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Edição</th>
                      <th className="-num">Máquinas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parque.porProduto.map((p) => (
                      <tr key={`${p.product ?? '?'}|${p.edition ?? '?'}`}>
                        <td className="tabela-titulo-celula">{p.product ?? 'Sem classificação'}</td>
                        <td>{p.edition ?? '—'}</td>
                        <td className="-num">{p.assetCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="pilha-sm">
            <h3 className="titulo-secao">O que as máquinas mandam</h3>
            <span className="campo-ajuda">
              O texto como veio, com o que o dicionário faz dele. Ensinar é para o que nenhuma
              regra descobre — a máquina instalada em francês diz
              &quot;Professionnel&quot;, e só quem sabe pode dizer que é Pro.
            </span>

            <div className="tabela-caixa">
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>Caption</th>
                      <th className="-num">Máquinas</th>
                      <th>Produto</th>
                      <th>Edição</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {parque.captions.map((c) => {
                      const regra = porRegra.get(c.alias);

                      return (
                        <tr key={`${c.osName}|${c.product ?? '?'}|${c.edition ?? '?'}`}>
                          <td className="tabela-titulo-celula">
                            <span className="mono">{c.osName}</span>
                            {c.ensinado ? (
                              <>
                                {' '}
                                <span className="selo -contorno">ensinado</span>
                              </>
                            ) : null}
                          </td>
                          <td className="-num">{c.assetCount}</td>

                          {ensinando?.caption === c.osName ? (
                            <td colSpan={3}>
                              <form
                                className="linha"
                                style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  setErro(null);
                                  setAviso(null);
                                  void escreverRegraDeSistema({
                                    caption: ensinando.caption,
                                    product: ensinando.product,
                                    edition: ensinando.edition || null,
                                  })
                                    .then((lista) => {
                                      setRegras(lista);
                                      setEnsinando(null);
                                      recarregar();
                                    })
                                    .catch(falhar);
                                }}
                              >
                                <label className="so-leitor" htmlFor={`produto-${c.alias}`}>
                                  Produto
                                </label>
                                <input
                                  id={`produto-${c.alias}`}
                                  className="input"
                                  required
                                  autoFocus
                                  placeholder="Windows 10"
                                  value={ensinando.product}
                                  onChange={(e) =>
                                    setEnsinando({ ...ensinando, product: e.target.value })
                                  }
                                />
                                <label className="so-leitor" htmlFor={`edicao-${c.alias}`}>
                                  Edição
                                </label>
                                <input
                                  id={`edicao-${c.alias}`}
                                  className="input"
                                  placeholder="Pro (em branco: sem edição)"
                                  value={ensinando.edition}
                                  onChange={(e) =>
                                    setEnsinando({ ...ensinando, edition: e.target.value })
                                  }
                                />
                                <button type="submit" className="btn -primario -sm">
                                  Salvar e reclassificar
                                </button>
                                <button
                                  type="button"
                                  className="btn -fantasma -sm"
                                  onClick={() => setEnsinando(null)}
                                >
                                  Cancelar
                                </button>
                              </form>
                            </td>
                          ) : (
                            <>
                              <td>{c.product ?? 'Sem classificação'}</td>
                              <td>{c.edition ?? '—'}</td>
                              <td className="-num">
                                <button
                                  type="button"
                                  className="btn -fantasma -sm"
                                  onClick={() =>
                                    setEnsinando({
                                      caption: c.osName,
                                      product: c.product ?? '',
                                      edition: c.edition ?? '',
                                    })
                                  }
                                >
                                  {c.ensinado ? 'Corrigir' : 'Ensinar'}
                                </button>
                                {regra ? (
                                  <button
                                    type="button"
                                    className="btn -perigo -sm"
                                    onClick={() => {
                                      setErro(null);
                                      setAviso(null);
                                      void removerRegraDeSistema(regra.id)
                                        .then((lista) => {
                                          setRegras(lista);
                                          recarregar();
                                        })
                                        .catch(falhar);
                                    }}
                                  >
                                    Esquecer
                                  </button>
                                ) : null}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
