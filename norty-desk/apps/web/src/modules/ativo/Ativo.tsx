import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  AssetDetail,
  ComponenteView,
  ComponentKind,
  EscreverComponenteRequest,
  FabricanteView,
} from '@norty-desk/shared';
import {
  ATRIBUTOS_DO_COMPONENTE,
  COMPONENT_KINDS,
  ROTULO_ATIVO,
  ROTULO_ATIVO_STATUS,
  ROTULO_COMPONENTE,
  descreverComponente,
  emCapacidade,
  resumoDoHardware,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  adicionarComponente,
  chamadosDoAtivo,
  editarComponente,
  obterAtivo,
  removerComponente,
  type ChamadoDoAtivo,
} from '../../api/ativos';
import { listarFabricantes } from '../../api/catalogoAtivo';
import { useAutenticacao } from '../../auth/Autenticacao';
import { CampoDinamico } from '../formulario/CamposDinamicos';
import { dataCurta } from '../../lib/formato';
import { SoftwareDoAtivoCard } from './SoftwareDoAtivo';
import { SuprimentosDoAtivoCard } from './SuprimentosDoAtivo';
import { RedeDoAtivoCard } from './RedeDoAtivo';

/**
 * O equipamento por dentro.
 *
 * O que faz esta tela existir é a linha de cima: "16 GB · 1,5 TB · 6
 * núcleos". No GLPI esse número está lá — em duas linhas de 8192 dentro
 * de `glpi_items_devicememories` — e nenhuma tela o soma. Quem precisa
 * saber se a máquina aguenta o sistema novo exporta e abre no Excel.
 */
export function Ativo() {
  const { id = '' } = useParams();
  const { can } = useAutenticacao();
  const [ativo, setAtivo] = useState<AssetDetail | null>(null);
  const [chamados, setChamados] = useState<ChamadoDoAtivo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setAtivo(await obterAtivo(id));
  }, [id]);

  useEffect(() => {
    void recarregar().catch(() => setErro('Não foi possível carregar o equipamento.'));
    void chamadosDoAtivo(id)
      .then(setChamados)
      .catch(() => setChamados([]));
  }, [id, recarregar]);

  if (erro) {
    return (
      <div className="alerta-bloco -erro">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }

  if (!ativo) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">{ativo.name}</h2>
          <p>
            {ativo.tag ? (
              <>
                Patrimônio <span className="mono">{ativo.tag}</span>
              </>
            ) : (
              'Sem patrimônio'
            )}
            {ativo.serialNumber ? (
              <>
                {' · série '}
                <span className="mono">{ativo.serialNumber}</span>
              </>
            ) : null}
          </p>
        </div>
        <Link to="/ativos" className="btn -secundario -sm">
          Voltar aos ativos
        </Link>
      </div>

      <Identificacao ativo={ativo} />
      <Hardware ativo={ativo} podeEditar={can('ativo:gerenciar')} aoMudar={setAtivo} />
      <RedeDoAtivoCard assetId={ativo.id} />
      <SuprimentosDoAtivoCard assetId={ativo.id} kind={ativo.kind} />
      <SoftwareDoAtivoCard assetId={ativo.id} />
      <Historico chamados={chamados} />
    </div>
  );
}

// ---------------------------------------------------------------------

function Identificacao({ ativo }: { ativo: AssetDetail }) {
  const linhas: [string, React.ReactNode][] = [
    ['Tipo', ROTULO_ATIVO[ativo.kind]],
    [
      'Situação',
      <span key="s" className={`selo ${seloDoStatus(ativo.status)}`}>
        {ROTULO_ATIVO_STATUS[ativo.status]}
      </span>,
    ],
    ['Fabricante', ativo.manufacturer?.name ?? '—'],
    ['Modelo', ativo.assetModel?.name ?? '—'],
    ['Localização', ativo.location?.path ?? '—'],
    ['Com quem está', ativo.user?.name ?? 'Em estoque'],
    ['Garantia até', ativo.warrantyUntil ? dataCurta(ativo.warrantyUntil) : '—'],
  ];

  return (
    <section className="card">
      <div className="card-topo">
        <h3 className="card-titulo">Identificação</h3>
      </div>
      <div className="card-corpo pilha-sm">
        {linhas.map(([rotulo, valor]) => (
          <div
            key={rotulo}
            className="linha-entre"
            style={{ flexWrap: 'nowrap', gap: 'var(--e-3)' }}
          >
            <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
              {rotulo}
            </span>
            <span style={{ textAlign: 'right', minWidth: 0 }}>{valor}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function seloDoStatus(status: AssetDetail['status']): string {
  switch (status) {
    case 'EM_USO':
      return '-sucesso';
    case 'EM_MANUTENCAO':
      return '-aviso';
    case 'BAIXADO':
      return '-neutro';
    default:
      return '-contorno';
  }
}

// ---------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------

function Hardware({
  ativo,
  podeEditar,
  aoMudar,
}: {
  ativo: AssetDetail;
  podeEditar: boolean;
  aoMudar: (ativo: AssetDetail) => void;
}) {
  const [emEdicao, setEmEdicao] = useState<ComponenteView | 'novo' | null>(null);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    void listarFabricantes()
      .then(setFabricantes)
      .catch(() => undefined);
  }, []);

  const trocar = (components: ComponenteView[]) => aoMudar({ ...ativo, components });
  const resumo = resumoDoHardware(ativo.components);

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">O que a máquina tem</h3>
          {/* A soma que o GLPI guarda e não mostra. */}
          <p className="card-sub">
            {resumo.total === 0
              ? 'Nenhuma peça registrada.'
              : [
                  resumo.memoriaMB > 0 ? `${emCapacidade(resumo.memoriaMB)} de memória` : null,
                  resumo.armazenamentoMB > 0
                    ? `${emCapacidade(resumo.armazenamentoMB)} de disco`
                    : null,
                  resumo.nucleos > 0
                    ? `${resumo.nucleos} ${resumo.nucleos === 1 ? 'núcleo' : 'núcleos'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || `${resumo.total} peça(s) registradas.`}
          </p>
        </div>
        {podeEditar ? (
          <button type="button" className="btn -primario -sm" onClick={() => setEmEdicao('novo')}>
            Adicionar peça
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {ativo.components.length === 0 ? (
        <div className="card-corpo">
          <div className="vazio">
            <h3>Nenhuma peça</h3>
            <p>
              Memória, disco, processador, placa. Uma linha é uma peça — dois pentes de 8 GB são
              duas linhas, e é assim que &quot;16 GB&quot; sai de uma soma e não de um campo que
              alguém digitou.
            </p>
          </div>
        </div>
      ) : (
        <div className="card-corpo" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Peça</th>
                  <th>Especificação</th>
                  <th>Série</th>
                  {podeEditar ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {ativo.components.map((c) => (
                  <tr key={c.id}>
                    <td className="tabela-titulo-celula">
                      {c.name}
                      <span className="campo-ajuda" style={{ display: 'block' }}>
                        {ROTULO_COMPONENTE[c.kind]}
                        {c.manufacturer ? ` · ${c.manufacturer.name}` : ''}
                      </span>
                    </td>
                    <td>{descreverComponente(c)}</td>
                    <td className="mono">{c.serialNumber ?? '—'}</td>
                    {podeEditar ? (
                      <td className="-num">
                        <button
                          type="button"
                          className="btn -fantasma -sm"
                          onClick={() => setEmEdicao(c)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn -perigo -sm"
                          onClick={() => {
                            setErro(null);
                            void removerComponente(ativo.id, c.id)
                              .then(trocar)
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
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {emEdicao ? (
        <FormularioDeComponente
          componente={emEdicao === 'novo' ? null : emEdicao}
          fabricantes={fabricantes}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            const lista =
              emEdicao === 'novo'
                ? await adicionarComponente(ativo.id, dados)
                : await editarComponente(ativo.id, emEdicao.id, dados);
            trocar(lista);
            setEmEdicao(null);
          }}
        />
      ) : null}
    </section>
  );
}

function FormularioDeComponente({
  componente,
  fabricantes,
  aoFechar,
  aoSalvar,
}: {
  componente: ComponenteView | null;
  fabricantes: FabricanteView[];
  aoFechar: () => void;
  aoSalvar: (dados: EscreverComponenteRequest) => Promise<void>;
}) {
  const [kind, setKind] = useState<ComponentKind>(componente?.kind ?? 'MEMORIA');
  const [name, setName] = useState(componente?.name ?? '');
  const [manufacturerId, setManufacturerId] = useState(componente?.manufacturer?.id ?? '');
  const [serialNumber, setSerialNumber] = useState(componente?.serialNumber ?? '');
  const [atributos, setAtributos] = useState<Record<string, unknown>>(
    componente?.attributes ?? {},
  );
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ficha = ATRIBUTOS_DO_COMPONENTE[kind];

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={componente ? 'Editar peça' : 'Adicionar peça'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{componente ? 'Editar peça' : 'Adicionar peça'}</h3>
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
              kind,
              name,
              manufacturerId: manufacturerId || null,
              serialNumber: serialNumber || null,
              attributes: atributos,
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

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-peca">
                  Tipo
                </label>
                <select
                  id="tipo-peca"
                  className="select"
                  value={kind}
                  onChange={(e) => {
                    // Trocar o tipo troca a ficha: guardar a antiga
                    // deixaria uma frequência de memória escondida
                    // dentro de um disco. A API recusa do mesmo jeito.
                    setKind(e.target.value as ComponentKind);
                    setAtributos({});
                  }}
                >
                  {COMPONENT_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ROTULO_COMPONENTE[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="fabricante-peca">
                  Fabricante
                </label>
                <select
                  id="fabricante-peca"
                  className="select"
                  value={manufacturerId}
                  onChange={(e) => setManufacturerId(e.target.value)}
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

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="nome-peca">
                  Modelo da peça
                </label>
                <input
                  id="nome-peca"
                  className="input"
                  required
                  minLength={1}
                  placeholder="KVR26N19S8"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="serie-peca">
                  Número de série
                </label>
                <input
                  id="serie-peca"
                  className="input mono"
                  placeholder="Opcional"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </div>
            </div>

            {ficha.length > 0 ? (
              <>
                <div className="divisor-texto">
                  <span>Ficha de {ROTULO_COMPONENTE[kind].toLocaleLowerCase('pt-BR')}</span>
                </div>

                {/* Em duas colunas: a ficha do disco tem quatro campos
                    curtos, e empilhados eles fazem a modal rolar por
                    nada. */}
                <div className="campo-grupo">
                  {ficha.map((campo) => (
                    <CampoDinamico
                      key={campo.key}
                      // A unidade entra no rótulo: "Capacidade (MB)"
                      // evita o pente de 16 registrado como 16 mega.
                      campo={
                        campo.unidade
                          ? { ...campo, label: `${campo.label} (${campo.unidade})` }
                          : campo
                      }
                      valor={atributos[campo.key]}
                      aoMudar={(valor) =>
                        setAtributos((atual) => {
                          const proximo = { ...atual };
                          if (valor === undefined || valor === '') delete proximo[campo.key];
                          else proximo[campo.key] = valor;
                          return proximo;
                        })
                      }
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="campo-ajuda">Este tipo não tem ficha própria.</p>
            )}
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

function Historico({ chamados }: { chamados: ChamadoDoAtivo[] | null }) {
  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Chamados deste equipamento</h3>
          <p className="card-sub">É o que responde &quot;essa máquina dá problema?&quot;.</p>
        </div>
      </div>
      <div className="card-corpo pilha-sm">
        {!chamados ? (
          <div className="sk sk-linha" />
        ) : chamados.length === 0 ? (
          <p className="campo-ajuda">Nenhum chamado envolveu este equipamento.</p>
        ) : (
          chamados.map((c) => (
            <Link key={c.id} to={`/chamados/${c.id}`} className="conversa-anexo">
              <span className="mono">#{c.number}</span>
              <span style={{ minWidth: 0, flex: 1 }}>{c.subject}</span>
              <span className="conversa-anexo-peso">{dataCurta(c.createdAt)}</span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
