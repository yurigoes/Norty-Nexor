import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CONSUMABLE_KINDS,
  ROTULO_CONSUMIVEL,
  ROTULO_MOVIMENTO,
  type AssetView,
  type ConsumableKind,
  type ConsumivelDetail,
  type FabricanteView,
  type LocalizacaoView,
  type ModeloDeAtivoView,
  type MovementKind,
} from '@norty-desk/shared';

import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { buscarAtivos } from '../../api/ativos';
import { listarFabricantes, listarLocalizacoes, listarModelosDeAtivo } from '../../api/catalogoAtivo';
import { ErroDaApi } from '../../api/cliente';
import { editarConsumivel, movimentarConsumivel, obterConsumivel, removerConsumivel } from '../../api/consumiveis';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

type Edicao = {
  name: string;
  kind: ConsumableKind;
  reference: string;
  manufacturerId: string;
  locationId: string;
  minStock: string;
  unit: string;
  notes: string;
  isActive: boolean;
  compatibleModelIds: string[];
};

type Movimento = { kind: MovementKind; quantity: string; destino: 'nenhum' | 'ativo' | 'pessoa'; assetId: string; userId: string; note: string };

/**
 * Um consumível: saldo, onde fica, impressoras compatíveis e o histórico
 * de movimentações com o saldo corrido — é o histórico que responde
 * "quantos toners essa impressora comeu este ano?".
 */
export function Consumivel() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');
  const podeTirar = can('consumivel:movimentar');

  const [item, setItem] = useState<ConsumivelDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [mov, setMov] = useState<Movimento | null>(null);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [locais, setLocais] = useState<LocalizacaoView[]>([]);
  const [modelos, setModelos] = useState<ModeloDeAtivoView[]>([]);
  const [ativos, setAtivos] = useState<AssetView[]>([]);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);

  const carregar = useCallback(async () => setItem(await obterConsumivel(id)), [id]);

  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar.'));
  }, [carregar]);

  async function agir(acao: () => Promise<ConsumivelDetail | void>, sucesso?: string) {
    setErro(null);
    setAviso(null);
    try {
      const r = await acao();
      if (r) setItem(r);
      if (sucesso) setAviso(sucesso);
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function abrirEdicao() {
    if (!item) return;
    setEdicao({
      name: item.name,
      kind: item.kind,
      reference: item.reference ?? '',
      manufacturerId: item.manufacturer?.id ?? '',
      locationId: item.location?.id ?? '',
      minStock: String(item.minStock),
      unit: item.unit,
      notes: item.notes ?? '',
      isActive: item.isActive,
      compatibleModelIds: item.compatibleModels.map((m) => m.id),
    });
    const [f, l, m] = await Promise.all([
      fabricantes.length ? fabricantes : listarFabricantes().catch(() => []),
      locais.length ? locais : listarLocalizacoes().catch(() => []),
      modelos.length ? modelos : listarModelosDeAtivo().catch(() => []),
    ]);
    setFabricantes(f);
    setLocais(l);
    setModelos(m);
  }

  async function abrirMovimento(kind: MovementKind) {
    setMov({ kind, quantity: kind === 'AJUSTE' ? '' : '1', destino: 'nenhum', assetId: '', userId: '', note: '' });
    if (kind === 'SAIDA' && ativos.length === 0) setAtivos(await buscarAtivos({ limit: 200 }).catch(() => []));
    if (kind === 'SAIDA' && pessoas.length === 0) setPessoas(await listarPessoas().catch(() => []));
  }

  async function salvarEdicao(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao) return;
    const ok = await agir(() =>
      editarConsumivel(id, {
        name: edicao.name.trim(),
        kind: edicao.kind,
        reference: edicao.reference.trim() || null,
        manufacturerId: edicao.manufacturerId || null,
        locationId: edicao.locationId || null,
        minStock: Number(edicao.minStock) || 0,
        unit: edicao.unit.trim() || 'un',
        notes: edicao.notes.trim() || null,
        isActive: edicao.isActive,
        compatibleModelIds: edicao.compatibleModelIds,
      }),
    );
    if (ok) setEdicao(null);
  }

  async function salvarMovimento(evento: FormEvent) {
    evento.preventDefault();
    if (!mov) return;
    const ok = await agir(
      () =>
        movimentarConsumivel(id, {
          kind: mov.kind,
          quantity: Number(mov.quantity),
          ...(mov.kind === 'SAIDA' && mov.destino === 'ativo' && mov.assetId ? { assetId: mov.assetId } : {}),
          ...(mov.kind === 'SAIDA' && mov.destino === 'pessoa' && mov.userId ? { userId: mov.userId } : {}),
          note: mov.note.trim() || null,
        }),
      `${ROTULO_MOVIMENTO[mov.kind]} registrada.`,
    );
    if (ok) setMov(null);
  }

  if (erro && !item) {
    return <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div>;
  }
  if (!item) return <div className="sk sk-bloco" />;

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <p className="suave"><Link to="/consumiveis">Consumíveis</Link></p>
          <h2 className="titulo-seccao">
            {item.name} {!item.isActive ? <span className="selo -neutro">Desativado</span> : null}
          </h2>
          <p>
            {ROTULO_CONSUMIVEL[item.kind]}
            {item.reference ? ` · ${item.reference}` : ''}
            {item.manufacturer ? ` · ${item.manufacturer.name}` : ''}
            {item.location ? ` · fica em ${item.location.name}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {podeTirar ? <button type="button" className="btn -primario" onClick={() => void abrirMovimento('SAIDA')}>Registrar saída</button> : null}
          {podeGerenciar ? <button type="button" className="btn" onClick={() => void abrirMovimento('ENTRADA')}>Entrada</button> : null}
          {podeGerenciar ? <button type="button" className="btn -fantasma" onClick={() => void abrirMovimento('AJUSTE')}>Ajuste</button> : null}
          {podeGerenciar ? <button type="button" className="btn -fantasma" onClick={() => void abrirEdicao()}>Editar</button> : null}
          {podeGerenciar && item.movements.length === 0 ? (
            <button type="button" className="btn -fantasma"
              onClick={() => { if (window.confirm(`Excluir "${item.name}"?`)) void agir(() => removerConsumivel(id)).then((ok) => ok && navegar('/consumiveis')); }}>
              Excluir
            </button>
          ) : null}
        </div>
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}
      {aviso ? <div className="alerta-bloco -sucesso" role="status"><span>{aviso}</span></div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Em estoque</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: item.belowMin ? 'var(--erro, #b42318)' : undefined }}>
            {item.stock} {item.unit}
          </div>
          {item.belowMin ? <span className="selo -erro">No mínimo — hora de comprar</span> : null}
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Estoque mínimo</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{item.minStock} {item.unit}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Compatível com</div>
          <div>{item.compatibleModels.length ? item.compatibleModels.map((m) => m.name).join(', ') : <span className="suave">nenhum modelo informado</span>}</div>
        </div>
      </div>

      {mov ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarMovimento} noValidate>
          <h3>{ROTULO_MOVIMENTO[mov.kind]}</h3>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="m-qtd">
                {mov.kind === 'AJUSTE' ? 'Diferença (negativa para baixar)' : `Quantidade (${item.unit})`}
              </label>
              <input id="m-qtd" className="input" inputMode="numeric" value={mov.quantity} onChange={(e) => setMov({ ...mov, quantity: e.target.value })} />
            </div>
            {mov.kind === 'SAIDA' ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="m-dest">Para</label>
                <select id="m-dest" className="input" value={mov.destino} onChange={(e) => setMov({ ...mov, destino: e.target.value as Movimento['destino'] })}>
                  <option value="nenhum">Não informar</option>
                  <option value="ativo">Um equipamento</option>
                  <option value="pessoa">Uma pessoa</option>
                </select>
              </div>
            ) : null}
            {mov.kind === 'SAIDA' && mov.destino === 'ativo' ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="m-ativo">Equipamento</label>
                <select id="m-ativo" className="input" value={mov.assetId} onChange={(e) => setMov({ ...mov, assetId: e.target.value })}>
                  <option value="">Escolha…</option>
                  {ativos.map((a) => <option key={a.id} value={a.id}>{a.name}{a.tag ? ` (${a.tag})` : ''}</option>)}
                </select>
              </div>
            ) : null}
            {mov.kind === 'SAIDA' && mov.destino === 'pessoa' ? (
              <div className="campo">
                <label className="campo-rotulo" htmlFor="m-pessoa">Pessoa</label>
                <select id="m-pessoa" className="input" value={mov.userId} onChange={(e) => setMov({ ...mov, userId: e.target.value })}>
                  <option value="">Escolha…</option>
                  {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            ) : null}
          </div>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="m-nota">{mov.kind === 'AJUSTE' ? 'Motivo do ajuste' : 'Observação'}</label>
            <input id="m-nota" className="input" value={mov.note}
              placeholder={mov.kind === 'ENTRADA' ? 'NF 1234, compra de março' : mov.kind === 'AJUSTE' ? 'Contagem do inventário' : ''}
              onChange={(e) => setMov({ ...mov, note: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={!mov.quantity.trim() || (mov.kind === 'AJUSTE' && !mov.note.trim())}>Registrar</button>
            <button type="button" className="btn -fantasma" onClick={() => setMov(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {edicao ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarEdicao} noValidate>
          <h3>Editar consumível</h3>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-nome">Nome</label>
              <input id="e-nome" className="input" value={edicao.name} onChange={(e) => setEdicao({ ...edicao, name: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-tipo">Tipo</label>
              <select id="e-tipo" className="input" value={edicao.kind} onChange={(e) => setEdicao({ ...edicao, kind: e.target.value as ConsumableKind })}>
                {CONSUMABLE_KINDS.map((k) => <option key={k} value={k}>{ROTULO_CONSUMIVEL[k]}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-ref">Referência</label>
              <input id="e-ref" className="input mono" value={edicao.reference} onChange={(e) => setEdicao({ ...edicao, reference: e.target.value })} />
            </div>
          </div>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-fab">Fabricante</label>
              <select id="e-fab" className="input" value={edicao.manufacturerId} onChange={(e) => setEdicao({ ...edicao, manufacturerId: e.target.value })}>
                <option value="">—</option>
                {fabricantes.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-local">Onde fica o estoque</label>
              <select id="e-local" className="input" value={edicao.locationId} onChange={(e) => setEdicao({ ...edicao, locationId: e.target.value })}>
                <option value="">—</option>
                {locais.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-min">Estoque mínimo</label>
              <input id="e-min" className="input" inputMode="numeric" value={edicao.minStock} onChange={(e) => setEdicao({ ...edicao, minStock: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="e-un">Unidade</label>
              <input id="e-un" className="input" value={edicao.unit} onChange={(e) => setEdicao({ ...edicao, unit: e.target.value })} />
            </div>
          </div>
          <fieldset className="campo" style={{ border: 0, padding: 0 }}>
            <legend className="campo-rotulo">Modelos compatíveis</legend>
            {modelos.length === 0 ? (
              <span className="suave">Nenhum modelo cadastrado. Cadastre em <Link to="/config/catalogo-ativos">Catálogo do ativo</Link>.</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                {modelos.map((m) => (
                  <label key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={edicao.compatibleModelIds.includes(m.id)}
                      onChange={(e) =>
                        setEdicao({
                          ...edicao,
                          compatibleModelIds: e.target.checked
                            ? [...edicao.compatibleModelIds, m.id]
                            : edicao.compatibleModelIds.filter((x) => x !== m.id),
                        })
                      }
                    />
                    {m.name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="e-notas">Observações</label>
            <textarea id="e-notas" className="input" rows={2} value={edicao.notes} onChange={(e) => setEdicao({ ...edicao, notes: e.target.value })} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={edicao.isActive} onChange={(e) => setEdicao({ ...edicao, isActive: e.target.checked })} />
            Ativo
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario">Salvar</button>
            <button type="button" className="btn -fantasma" onClick={() => setEdicao(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Movimentações</h3>
            <p className="card-sub">As 200 mais recentes, com o saldo depois de cada uma.</p>
          </div>
        </div>
        <div className="card-corpo">
          {item.movements.length === 0 ? (
            <p className="campo-ajuda">Nenhuma movimentação. O saldo começa na primeira entrada.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr><th>Quando</th><th>Tipo</th><th className="-num">Qtd.</th><th className="-num">Saldo</th><th>Para</th><th>Quem registrou</th><th>Observação</th></tr>
                </thead>
                <tbody>
                  {item.movements.map((m) => (
                    <tr key={m.id}>
                      <td>{dataCurta(m.createdAt)}</td>
                      <td>{ROTULO_MOVIMENTO[m.kind]}</td>
                      <td className="-num">{m.kind === 'SAIDA' ? `−${m.quantity}` : m.kind === 'AJUSTE' && m.quantity > 0 ? `+${m.quantity}` : m.kind === 'ENTRADA' ? `+${m.quantity}` : m.quantity}</td>
                      <td className="-num">{m.stockAfter}</td>
                      <td>
                        {m.asset ? <Link to={`/ativos/${m.asset.id}`}>{m.asset.name}</Link> : m.user ? m.user.name : <span className="suave">—</span>}
                      </td>
                      <td>{m.author?.name ?? <span className="suave">—</span>}</td>
                      <td>{m.note ?? <span className="suave">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
