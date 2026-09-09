import { useCallback, useEffect, useState } from 'react';
import type {
  AssetView,
  FabricanteView,
  LocalizacaoView,
  ModeloDeAtivoView,
  WriteAssetRequest,
} from '@norty-desk/shared';
import {
  ASSET_KINDS,
  ASSET_STATUSES,
  ROTULO_ATIVO,
  ROTULO_ATIVO_STATUS,
} from '@norty-desk/shared';

import { buscarAtivos, chamadosDoAtivo, criarAtivo, editarAtivo, type ChamadoDoAtivo } from '../../api/ativos';
import {
  listarFabricantes,
  listarLocalizacoes,
  listarModelosDeAtivo,
} from '../../api/catalogoAtivo';
import { ErroDaApi } from '../../api/cliente';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

/**
 * O parque de equipamentos.
 *
 * Deliberadamente raso: nome, patrimônio, série, quem usa, onde está. O
 * inventário do GLPI são 60 tabelas e um agente de coleta — e é por isso
 * que o campo do chamado fica vazio. Aqui a pergunta é só "qual máquina
 * é essa?", e essa se responde.
 */
export function Ativos() {
  const { can } = useAutenticacao();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [ativos, setAtivos] = useState<AssetView[] | null>(null);
  const [emEdicao, setEmEdicao] = useState<AssetView | 'novo' | null>(null);
  const [aberto, setAberto] = useState<AssetView | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setAtivos(await buscarAtivos({ q: busca || undefined, status: status || undefined }));
  }, [busca, status]);

  useEffect(() => {
    setAtivos(null);
    void recarregar().catch(() => setErro('Não foi possível carregar os ativos.'));
  }, [recarregar]);

  return (
    <div className="pilha" style={{ maxWidth: 1040 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Ativos</h2>
          <p>
            Nome, patrimônio, série, quem usa e onde está. O suficiente para o chamado dizer
            qual máquina é.
          </p>
        </div>
        {can('ativo:gerenciar') ? (
          <button type="button" className="btn -primario" onClick={() => setEmEdicao('novo')}>
            Novo ativo
          </button>
        ) : null}
      </div>

      <form
        className="linha"
        style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(termo.trim());
        }}
      >
        <div className="busca" style={{ flex: '1 1 260px' }}>
          <label className="so-leitor" htmlFor="busca-ativos">
            Buscar ativos
          </label>
          <input
            id="busca-ativos"
            className="input"
            type="search"
            placeholder="Patrimônio, série, modelo ou local"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>

        <select
          className="select -auto"
          aria-label="Situação"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Todas as situações</option>
          {ASSET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ROTULO_ATIVO_STATUS[s]}
            </option>
          ))}
        </select>

        <button type="submit" className="btn -secundario">
          Buscar
        </button>
      </form>

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {!ativos ? (
        <div className="sk sk-bloco" />
      ) : ativos.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum ativo</h3>
          <p>
            Cadastre o que o suporte precisa identificar no chamado — começando pelo que mais
            dá problema.
          </p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Equipamento</th>
                  <th>Patrimônio</th>
                  <th>Quem usa</th>
                  <th>Local</th>
                  <th>Situação</th>
                  <th className="-num">Chamados</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ativos.map((ativo) => (
                  <tr key={ativo.id}>
                    <td className="tabela-titulo-celula">
                      {ativo.name}
                      <span className="campo-ajuda" style={{ display: 'block' }}>
                        {ROTULO_ATIVO[ativo.kind]}
                        {ativo.manufacturer ? ` · ${ativo.manufacturer.name}` : ''}
                        {ativo.assetModel ? ` ${ativo.assetModel.name}` : ''}
                      </span>
                    </td>
                    <td className="mono">{ativo.tag ?? '—'}</td>
                    <td>{ativo.user?.name ?? '—'}</td>
                    <td>{ativo.location?.path ?? '—'}</td>
                    <td>
                      <span className={`selo ${seloDoStatus(ativo.status)}`}>
                        {ROTULO_ATIVO_STATUS[ativo.status]}
                      </span>
                    </td>
                    <td className="-num">{ativo.ticketCount ?? 0}</td>
                    <td className="-num">
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => setAberto(ativo)}
                      >
                        Histórico
                      </button>
                      {can('ativo:gerenciar') ? (
                        <button
                          type="button"
                          className="btn -fantasma -sm"
                          onClick={() => setEmEdicao(ativo)}
                        >
                          Editar
                        </button>
                      ) : null}
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
          ativo={emEdicao === 'novo' ? null : emEdicao}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={async (dados) => {
            if (emEdicao === 'novo') await criarAtivo(dados);
            else await editarAtivo(emEdicao.id, dados);
            setEmEdicao(null);
            await recarregar();
          }}
        />
      ) : null}

      {aberto ? <Historico ativo={aberto} aoFechar={() => setAberto(null)} /> : null}
    </div>
  );
}

function seloDoStatus(status: AssetView['status']): string {
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

function Historico({ ativo, aoFechar }: { ativo: AssetView; aoFechar: () => void }) {
  const [chamados, setChamados] = useState<ChamadoDoAtivo[] | null>(null);

  useEffect(() => {
    void chamadosDoAtivo(ativo.id)
      .then(setChamados)
      .catch(() => setChamados([]));
  }, [ativo.id]);

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Histórico de ${ativo.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <div>
            <h3 className="card-titulo">{ativo.name}</h3>
            <p className="card-sub">
              {ativo.tag ? `Patrimônio ${ativo.tag}` : 'Sem patrimônio'}
              {ativo.serialNumber ? ` · série ${ativo.serialNumber}` : ''}
            </p>
          </div>
          <button type="button" className="btn-icone" aria-label="Fechar" onClick={aoFechar}>
            ×
          </button>
        </div>

        <div className="modal-corpo pilha-sm">
          {!chamados ? (
            <div className="sk sk-linha" />
          ) : chamados.length === 0 ? (
            <p className="campo-ajuda">Nenhum chamado envolveu este equipamento.</p>
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

function Formulario({
  ativo,
  aoFechar,
  aoSalvar,
}: {
  ativo: AssetView | null;
  aoFechar: () => void;
  aoSalvar: (dados: WriteAssetRequest) => Promise<void>;
}) {
  const [campos, setCampos] = useState<WriteAssetRequest>({
    name: ativo?.name ?? '',
    kind: ativo?.kind ?? 'COMPUTADOR',
    status: ativo?.status ?? 'EM_USO',
    tag: ativo?.tag ?? '',
    serialNumber: ativo?.serialNumber ?? '',
    manufacturerId: ativo?.manufacturer?.id ?? '',
    assetModelId: ativo?.assetModel?.id ?? '',
    locationId: ativo?.location?.id ?? '',
    userId: ativo?.user?.id ?? '',
    notes: ativo?.notes ?? '',
  });
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [modelos, setModelos] = useState<ModeloDeAtivoView[]>([]);
  const [locais, setLocais] = useState<LocalizacaoView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void listarPessoas()
      .then(setPessoas)
      .catch(() => undefined);
    void Promise.all([listarFabricantes(), listarModelosDeAtivo(), listarLocalizacoes()])
      .then(([f, m, l]) => {
        setFabricantes(f);
        setModelos(m);
        setLocais(l);
      })
      .catch(() => undefined);
  }, []);

  const definir = (chave: keyof WriteAssetRequest, valor: string) =>
    setCampos((atual) => ({ ...atual, [chave]: valor }));

  return (
    <div className="modal-fundo" role="presentation" onClick={aoFechar}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={ativo ? 'Editar ativo' : 'Novo ativo'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-topo">
          <h3 className="card-titulo">{ativo ? 'Editar ativo' : 'Novo ativo'}</h3>
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
            void aoSalvar(campos)
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
              <label className="campo-rotulo" htmlFor="nome-ativo">
                Nome
              </label>
              <input
                id="nome-ativo"
                className="input"
                required
                minLength={2}
                value={campos.name}
                onChange={(e) => definir('name', e.target.value)}
              />
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="tipo-ativo">
                  Tipo
                </label>
                <select
                  id="tipo-ativo"
                  className="select"
                  value={campos.kind}
                  onChange={(e) => definir('kind', e.target.value)}
                >
                  {ASSET_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {ROTULO_ATIVO[k]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="status-ativo">
                  Situação
                </label>
                <select
                  id="status-ativo"
                  className="select"
                  value={campos.status}
                  onChange={(e) => definir('status', e.target.value)}
                >
                  {ASSET_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ROTULO_ATIVO_STATUS[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="patrimonio-ativo">
                  Patrimônio
                </label>
                <input
                  id="patrimonio-ativo"
                  className="input"
                  value={campos.tag ?? ''}
                  onChange={(e) => definir('tag', e.target.value)}
                />
                <span className="campo-ajuda">Único na organização. Em branco é aceito.</span>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="serie-ativo">
                  Número de série
                </label>
                <input
                  id="serie-ativo"
                  className="input"
                  value={campos.serialNumber ?? ''}
                  onChange={(e) => definir('serialNumber', e.target.value)}
                />
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="fabricante-ativo">
                  Fabricante
                </label>
                <select
                  id="fabricante-ativo"
                  className="select"
                  value={campos.manufacturerId ?? ''}
                  onChange={(e) => definir('manufacturerId', e.target.value)}
                >
                  <option value="">Sem fabricante</option>
                  {fabricantes.map((fa) => (
                    <option key={fa.id} value={fa.id}>
                      {fa.name}
                    </option>
                  ))}
                </select>
                <span className="campo-ajuda">
                  Cadastre em Configuração → Catálogo de ativos.
                </span>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="modelo-ativo">
                  Modelo
                </label>
                <select
                  id="modelo-ativo"
                  className="select"
                  value={campos.assetModelId ?? ''}
                  onChange={(e) => definir('assetModelId', e.target.value)}
                >
                  <option value="">Sem modelo</option>
                  {modelos
                    // Só os modelos do fabricante escolhido: uma lista de
                    // duzentos modelos de seis marcas não se escolhe.
                    .filter(
                      (m) => !campos.manufacturerId || m.manufacturer?.id === campos.manufacturerId,
                    )
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="local-ativo">
                  Local
                </label>
                <select
                  id="local-ativo"
                  className="select"
                  value={campos.locationId ?? ''}
                  onChange={(e) => definir('locationId', e.target.value)}
                >
                  <option value="">Sem local</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.path}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="dono-ativo">
                  Quem usa
                </label>
                <select
                  id="dono-ativo"
                  className="select"
                  value={campos.userId ?? ''}
                  onChange={(e) => definir('userId', e.target.value)}
                >
                  <option value="">Ninguém — em estoque</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="notas-ativo">
                Observações
              </label>
              <textarea
                id="notas-ativo"
                className="textarea"
                rows={2}
                value={campos.notes ?? ''}
                onChange={(e) => definir('notes', e.target.value)}
              />
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
