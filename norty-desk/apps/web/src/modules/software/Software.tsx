import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  LICENSE_KINDS,
  ROTULO_LICENCA,
  type AssetView,
  type FabricanteView,
  type LicencaView,
  type LicenseKind,
  type SoftwareDetail,
  type WriteLicenseRequest,
} from '@norty-desk/shared';

import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { buscarAtivos } from '../../api/ativos';
import { listarFabricantes } from '../../api/catalogoAtivo';
import { ErroDaApi } from '../../api/cliente';
import { listarContratos, listarFornecedores } from '../../api/contratos';
import {
  atribuirLicenca,
  criarLicenca,
  criarVersao,
  editarLicenca,
  editarSoftware,
  liberarAssento,
  obterSoftware,
  removerLicenca,
  removerSoftware,
  removerVersao,
} from '../../api/software';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';
import { SeloDaSituacao, textoDeAssentos } from './comum';

type Opcao = { id: string; name: string };

type FormLicenca = {
  id: string | null;
  name: string;
  kind: LicenseKind;
  versionId: string;
  seats: string;
  ilimitada: boolean;
  purchasedAt: string;
  expiresAt: string;
  purchaseValue: string;
  supplierId: string;
  contractId: string;
  licenseKey: string;
  apagarChave: boolean;
  hasKey: boolean;
  notes: string;
};

const soData = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function formDe(l: LicencaView | null): FormLicenca {
  return {
    id: l?.id ?? null,
    name: l?.name ?? '',
    kind: l?.kind ?? 'PERPETUA',
    versionId: l?.version?.id ?? '',
    seats: l?.seats === null || l?.seats === undefined ? '' : String(l.seats),
    ilimitada: l ? l.seats === null : false,
    purchasedAt: soData(l?.purchasedAt ?? null),
    expiresAt: soData(l?.expiresAt ?? null),
    purchaseValue: l?.purchaseValue ?? '',
    supplierId: l?.supplier?.id ?? '',
    contractId: l?.contract?.id ?? '',
    licenseKey: '',
    apagarChave: false,
    hasKey: l?.hasKey ?? false,
    notes: l?.notes ?? '',
  };
}

function paraApi(f: FormLicenca): WriteLicenseRequest {
  return {
    name: f.name.trim(),
    kind: f.kind,
    versionId: f.versionId || null,
    seats: f.ilimitada ? null : f.seats.trim() === '' ? null : Number(f.seats),
    purchasedAt: f.purchasedAt || null,
    expiresAt: f.expiresAt || null,
    purchaseValue: f.purchaseValue.trim() === '' ? null : Number(f.purchaseValue.replace(',', '.')),
    supplierId: f.supplierId || null,
    contractId: f.contractId || null,
    notes: f.notes.trim() || null,
    // Chave em branco na edição = manter a guardada.
    ...(f.apagarChave ? { licenseKey: null } : f.licenseKey.trim() ? { licenseKey: f.licenseKey.trim() } : {}),
  };
}

/**
 * Um software: versões, onde está instalado, as licenças compradas e quem
 * ocupa cada assento. A conformidade (instalação sem licença) é calculada
 * na API e só exibida aqui.
 */
export function Software() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');

  const [software, setSoftware] = useState<SoftwareDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<{ name: string; manufacturerId: string; category: string; notes: string; isActive: boolean } | null>(null);
  const [licenca, setLicenca] = useState<FormLicenca | null>(null);
  const [novaVersao, setNovaVersao] = useState('');
  const [chavesVisiveis, setChavesVisiveis] = useState<Record<string, boolean>>({});
  const [atribuindo, setAtribuindo] = useState<{ licenseId: string; tipo: 'ativo' | 'pessoa'; termo: string } | null>(null);
  const [ativosAchados, setAtivosAchados] = useState<AssetView[]>([]);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [fornecedores, setFornecedores] = useState<Opcao[]>([]);
  const [contratos, setContratos] = useState<{ id: string; number: string; name: string }[]>([]);

  const carregar = useCallback(async () => {
    setSoftware(await obterSoftware(id));
  }, [id]);

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar.'));
  }, [carregar]);

  /** Roda uma escrita que devolve o software atualizado. */
  async function agir(acao: () => Promise<SoftwareDetail | void>, sucesso?: string) {
    setErro(null);
    setAviso(null);
    try {
      const resultado = await acao();
      if (resultado) setSoftware(resultado);
      if (sucesso) setAviso(sucesso);
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function abrirEdicao() {
    if (!software) return;
    setEdicao({
      name: software.name,
      manufacturerId: software.manufacturer?.id ?? '',
      category: software.category ?? '',
      notes: software.notes ?? '',
      isActive: software.isActive,
    });
    if (fabricantes.length === 0) setFabricantes(await listarFabricantes().catch(() => []));
  }

  async function abrirLicenca(l: LicencaView | null) {
    setLicenca(formDe(l));
    if (fornecedores.length === 0) setFornecedores(await listarFornecedores().catch(() => []));
    if (contratos.length === 0) setContratos(await listarContratos().catch(() => []));
  }

  async function salvarEdicao(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao) return;
    const ok = await agir(() =>
      editarSoftware(id, {
        name: edicao.name.trim(),
        manufacturerId: edicao.manufacturerId || null,
        category: edicao.category.trim() || null,
        notes: edicao.notes.trim() || null,
        isActive: edicao.isActive,
      }),
    );
    if (ok) setEdicao(null);
  }

  async function salvarLicenca(evento: FormEvent) {
    evento.preventDefault();
    if (!licenca) return;
    const dados = paraApi(licenca);
    const ok = await agir(
      () => (licenca.id ? editarLicenca(licenca.id, dados) : criarLicenca(id, dados)),
      licenca.id ? 'Licença atualizada.' : 'Licença cadastrada.',
    );
    if (ok) setLicenca(null);
  }

  async function procurar(tipo: 'ativo' | 'pessoa', termo: string) {
    if (tipo === 'ativo') setAtivosAchados(await buscarAtivos({ q: termo || undefined, limit: 20 }).catch(() => []));
    else if (pessoas.length === 0) setPessoas(await listarPessoas().catch(() => []));
  }

  if (erro && !software) {
    return (
      <div className="alerta-bloco -erro" role="alert">
        <span aria-hidden="true">!</span>
        <span>{erro}</span>
      </div>
    );
  }
  if (!software) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <p className="suave"><Link to="/software">Software e licenças</Link></p>
          <h2 className="titulo-seccao">
            {software.name}{' '}
            {!software.isActive ? <span className="selo -neutro">Desativado</span> : null}
          </h2>
          <p>
            {software.manufacturer?.name ?? 'Fabricante não informado'}
            {software.category ? ` · ${software.category}` : ''}
          </p>
        </div>
        {podeGerenciar ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn -fantasma" onClick={() => void abrirEdicao()}>Editar</button>
            <button
              type="button"
              className="btn -fantasma"
              onClick={() => {
                if (!window.confirm(`Excluir "${software.name}"? Só dá para excluir o que nunca foi instalado nem licenciado.`)) return;
                void agir(() => removerSoftware(id)).then((ok) => ok && navegar('/software'));
              }}
            >
              Excluir
            </button>
          </div>
        ) : null}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div>
      ) : null}
      {aviso ? (
        <div className="alerta-bloco" role="status"><span>{aviso}</span></div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Numero rotulo="Equipamentos com ele" valor={String(software.installCount)} />
        <Numero rotulo="Assentos" valor={textoDeAssentos(software.seatsUsed, software.seats)} />
        <Numero
          rotulo="Instalações sem licença"
          valor={String(software.unlicensedInstalls)}
          destaque={software.unlicensedInstalls > 0}
        />
        <Numero rotulo="Próxima validade" valor={software.nextExpiry ? dataCurta(software.nextExpiry) : '—'} />
      </div>

      {edicao ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarEdicao} noValidate>
          <h3>Editar software</h3>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="ed-nome">Nome</label>
              <input id="ed-nome" className="input" value={edicao.name} onChange={(e) => setEdicao({ ...edicao, name: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="ed-fab">Fabricante</label>
              <select id="ed-fab" className="input" value={edicao.manufacturerId} onChange={(e) => setEdicao({ ...edicao, manufacturerId: e.target.value })}>
                <option value="">—</option>
                {fabricantes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="ed-cat">Categoria</label>
              <input id="ed-cat" className="input" value={edicao.category} onChange={(e) => setEdicao({ ...edicao, category: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="ed-notas">Observações</label>
            <textarea id="ed-notas" className="input" rows={2} value={edicao.notes} onChange={(e) => setEdicao({ ...edicao, notes: e.target.value })} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={edicao.isActive} onChange={(e) => setEdicao({ ...edicao, isActive: e.target.checked })} />
            Ativo (desativado some da lista e do aviso de validade)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario">Salvar</button>
            <button type="button" className="btn -fantasma" onClick={() => setEdicao(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {/* ------------------------------------------------ Licenças */}
      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Licenças</h3>
            <p className="card-sub">O que foi comprado e quem ocupa cada assento.</p>
          </div>
          {podeGerenciar ? (
            <button type="button" className="btn -sm" onClick={() => void abrirLicenca(null)}>Nova licença</button>
          ) : null}
        </div>
        <div className="card-corpo pilha-sm">
          {licenca ? (
            <form className="pilha-sm" onSubmit={salvarLicenca} noValidate style={{ borderBottom: '1px solid var(--borda, #ddd)', paddingBottom: 16 }}>
              <h4>{licenca.id ? 'Editar licença' : 'Nova licença'}</h4>
              <div className="campo-grupo">
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-nome">Nome</label>
                  <input id="lic-nome" className="input" value={licenca.name} placeholder="Office 2021 — lote de março"
                    onChange={(e) => setLicenca({ ...licenca, name: e.target.value })} />
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-tipo">Tipo</label>
                  <select id="lic-tipo" className="input" value={licenca.kind} onChange={(e) => setLicenca({ ...licenca, kind: e.target.value as LicenseKind })}>
                    {LICENSE_KINDS.map((k) => <option key={k} value={k}>{ROTULO_LICENCA[k]}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-versao">Versão coberta</label>
                  <select id="lic-versao" className="input" value={licenca.versionId} onChange={(e) => setLicenca({ ...licenca, versionId: e.target.value })}>
                    <option value="">Qualquer versão</option>
                    {software.versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="campo-grupo">
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-assentos">Assentos comprados</label>
                  <input id="lic-assentos" className="input" inputMode="numeric" disabled={licenca.ilimitada} value={licenca.seats}
                    onChange={(e) => setLicenca({ ...licenca, seats: e.target.value })} />
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={licenca.ilimitada} onChange={(e) => setLicenca({ ...licenca, ilimitada: e.target.checked })} />
                    Ilimitada
                  </label>
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-compra">Comprada em</label>
                  <input id="lic-compra" className="input" type="date" value={licenca.purchasedAt} onChange={(e) => setLicenca({ ...licenca, purchasedAt: e.target.value })} />
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-validade">Válida até</label>
                  <input id="lic-validade" className="input" type="date" value={licenca.expiresAt} onChange={(e) => setLicenca({ ...licenca, expiresAt: e.target.value })} />
                  <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Em branco: não vence.</span>
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-valor">Valor pago (R$)</label>
                  <input id="lic-valor" className="input" inputMode="decimal" value={licenca.purchaseValue} onChange={(e) => setLicenca({ ...licenca, purchaseValue: e.target.value })} />
                </div>
              </div>
              <div className="campo-grupo">
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-forn">Fornecedor</label>
                  <select id="lic-forn" className="input" value={licenca.supplierId} onChange={(e) => setLicenca({ ...licenca, supplierId: e.target.value })}>
                    <option value="">—</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <div className="campo">
                  <label className="campo-rotulo" htmlFor="lic-contrato">Contrato</label>
                  <select id="lic-contrato" className="input" value={licenca.contractId} onChange={(e) => setLicenca({ ...licenca, contractId: e.target.value })}>
                    <option value="">—</option>
                    {contratos.map((c) => <option key={c.id} value={c.id}>{c.number} — {c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="lic-chave">Chave / serial</label>
                <input id="lic-chave" className="input mono" autoComplete="off" spellCheck={false} disabled={licenca.apagarChave}
                  placeholder={licenca.hasKey ? 'Guardada — deixe em branco para manter' : 'Opcional'}
                  value={licenca.licenseKey} onChange={(e) => setLicenca({ ...licenca, licenseKey: e.target.value })} />
                {licenca.hasKey ? (
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={licenca.apagarChave} onChange={(e) => setLicenca({ ...licenca, apagarChave: e.target.checked, licenseKey: '' })} />
                    Apagar a chave guardada
                  </label>
                ) : (
                  <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Guardada cifrada; só quem gerencia ativos vê.</span>
                )}
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="lic-notas">Observações</label>
                <textarea id="lic-notas" className="input" rows={2} value={licenca.notes} onChange={(e) => setLicenca({ ...licenca, notes: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn -primario" disabled={licenca.name.trim().length < 2}>Salvar</button>
                <button type="button" className="btn -fantasma" onClick={() => setLicenca(null)}>Cancelar</button>
              </div>
            </form>
          ) : null}

          {software.licenses.length === 0 ? (
            <p className="campo-ajuda">
              Nenhuma licença cadastrada.
              {software.installCount > 0 ? ` As ${software.installCount} instalação(ões) estão sem cobertura.` : ''}
            </p>
          ) : (
            software.licenses.map((l) => (
              <div key={l.id} className="pilha-sm" style={{ border: '1px solid var(--borda, #ddd)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong>{l.name}</strong> <SeloDaSituacao situacao={l.situacao} />
                    <div className="suave">
                      {ROTULO_LICENCA[l.kind]}
                      {l.version ? ` · versão ${l.version.name}` : ' · qualquer versão'}
                      {' · '}assentos {textoDeAssentos(l.seatsUsed, l.seats)}
                      {l.expiresAt ? ` · válida até ${dataCurta(l.expiresAt)}` : ' · não vence'}
                      {l.supplier ? ` · ${l.supplier.name}` : ''}
                      {l.contract ? ` · contrato ${l.contract.number}` : ''}
                      {l.purchaseValue ? ` · R$ ${l.purchaseValue.replace('.', ',')}` : ''}
                    </div>
                    {l.hasKey ? (
                      <div className="suave">
                        Chave:{' '}
                        {l.licenseKey === undefined ? (
                          'guardada (só quem gerencia ativos vê)'
                        ) : chavesVisiveis[l.id] ? (
                          <code style={{ userSelect: 'all' }}>{l.licenseKey ?? 'ilegível — cadastre de novo'}</code>
                        ) : (
                          <button type="button" className="btn -fantasma -sm" onClick={() => setChavesVisiveis((c) => ({ ...c, [l.id]: true }))}>
                            mostrar
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                  {podeGerenciar ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <button type="button" className="btn -fantasma -sm" onClick={() => void abrirLicenca(l)}>Editar</button>
                      <button
                        type="button"
                        className="btn -fantasma -sm"
                        onClick={() => {
                          if (!window.confirm(`Excluir a licença "${l.name}"? Os ${l.seatsUsed} assento(s) ocupados serão liberados.`)) return;
                          void agir(() => removerLicenca(l.id), 'Licença excluída.');
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  ) : null}
                </div>

                {l.assignments.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {l.assignments.map((a) => (
                      <li key={a.id}>
                        {a.asset ? (
                          <Link to={`/ativos/${a.asset.id}`}>{a.asset.name}{a.asset.tag ? ` (${a.asset.tag})` : ''}</Link>
                        ) : (
                          <span>{a.user?.name}{a.user?.email ? ` · ${a.user.email}` : ''} <span className="suave">(pessoa)</span></span>
                        )}
                        {podeGerenciar ? (
                          <button type="button" className="btn -fantasma -sm" style={{ marginLeft: 8 }}
                            onClick={() => void agir(() => liberarAssento(l.id, a.id))}>
                            Liberar
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {podeGerenciar && (l.seats === null || l.seatsUsed < l.seats) ? (
                  atribuindo?.licenseId === l.id ? (
                    <div className="pilha-sm">
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select className="input" style={{ maxWidth: 160 }} value={atribuindo.tipo}
                          onChange={(e) => {
                            const tipo = e.target.value as 'ativo' | 'pessoa';
                            setAtribuindo({ ...atribuindo, tipo });
                            void procurar(tipo, atribuindo.termo);
                          }}>
                          <option value="ativo">Equipamento</option>
                          <option value="pessoa">Pessoa</option>
                        </select>
                        {atribuindo.tipo === 'ativo' ? (
                          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar equipamento" value={atribuindo.termo}
                            onChange={(e) => {
                              setAtribuindo({ ...atribuindo, termo: e.target.value });
                              void procurar('ativo', e.target.value);
                            }} />
                        ) : null}
                        <button type="button" className="btn -fantasma -sm" onClick={() => setAtribuindo(null)}>Fechar</button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {atribuindo.tipo === 'ativo'
                          ? ativosAchados.map((a) => (
                              <button key={a.id} type="button" className="btn -sm"
                                onClick={() => void agir(() => atribuirLicenca(l.id, { assetId: a.id })).then((ok) => ok && setAtribuindo(null))}>
                                {a.name}{a.tag ? ` (${a.tag})` : ''}
                              </button>
                            ))
                          : pessoas.map((p) => (
                              <button key={p.id} type="button" className="btn -sm"
                                onClick={() => void agir(() => atribuirLicenca(l.id, { userId: p.id })).then((ok) => ok && setAtribuindo(null))}>
                                {p.name}
                              </button>
                            ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button type="button" className="btn -fantasma -sm"
                        onClick={() => {
                          setAtribuindo({ licenseId: l.id, tipo: 'ativo', termo: '' });
                          void procurar('ativo', '');
                        }}>
                        Ocupar um assento
                      </button>
                    </div>
                  )
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>

      {/* ------------------------------------------------ Instalações */}
      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Onde está instalado</h3>
            <p className="card-sub">Para instalar, abra o equipamento — é lá que o suporte está quando instala.</p>
          </div>
        </div>
        <div className="card-corpo">
          {software.installations.length === 0 ? (
            <p className="campo-ajuda">Nenhum equipamento com este software.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr><th>Equipamento</th><th>Versão</th><th>Instalado em</th><th>Licença</th></tr>
                </thead>
                <tbody>
                  {software.installations.map((i) => (
                    <tr key={i.id}>
                      <td className="tabela-titulo-celula">
                        <Link to={`/ativos/${i.asset.id}`}>{i.asset.name}</Link>
                        {i.asset.tag ? <span className="suave"> · {i.asset.tag}</span> : null}
                      </td>
                      <td>{i.version.name}</td>
                      <td>{i.installedAt ? dataCurta(i.installedAt) : <span className="suave">—</span>}</td>
                      <td>{i.licensed ? <span className="selo -sucesso">Coberta</span> : <span className="selo -erro">Sem licença</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ Versões */}
      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Versões</h3>
            <p className="card-sub">Instalar pela tela do equipamento já cria a versão que faltar.</p>
          </div>
        </div>
        <div className="card-corpo pilha-sm">
          {software.versions.length === 0 ? (
            <p className="campo-ajuda">Nenhuma versão ainda.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {software.versions.map((v) => (
                <li key={v.id}>
                  {v.name} <span className="suave">· {v.installCount} equipamento(s)</span>
                  {podeGerenciar && v.installCount === 0 ? (
                    <button type="button" className="btn -fantasma -sm" style={{ marginLeft: 8 }}
                      onClick={() => void agir(() => removerVersao(id, v.id))}>
                      Remover
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {podeGerenciar ? (
            <form style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!novaVersao.trim()) return;
                void agir(() => criarVersao(id, novaVersao.trim())).then((ok) => ok && setNovaVersao(''));
              }}>
              <input className="input" style={{ maxWidth: 220 }} placeholder="Nova versão (ex.: 2021)" value={novaVersao}
                onChange={(e) => setNovaVersao(e.target.value)} />
              <button type="submit" className="btn -sm" disabled={!novaVersao.trim()}>Adicionar</button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Numero({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>{rotulo}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: destaque ? 'var(--erro, #b42318)' : undefined }}>{valor}</div>
    </div>
  );
}
