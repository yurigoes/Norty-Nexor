import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RACK_FACES, ROTULO_FACE, type AssetView, type ItemDeRackView, type RackDetail, type RackFace, type SalaView } from '@norty-desk/shared';

import { buscarAtivos } from '../../api/ativos';
import { ErroDaApi } from '../../api/cliente';
import { colocarNoRack, editarRack, listarSalas, moverNoRack, obterRack, removerRack, retirarDoRack } from '../../api/datacenter';
import { useAutenticacao } from '../../auth/Autenticacao';

const ALTURA_U = 22;

/**
 * Um rack, desenhado de pé: U 1 embaixo, frente e trás lado a lado. O que
 * ocupa a profundidade inteira aparece nas duas colunas.
 */
export function Rack() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');
  const [rack, setRack] = useState<RackDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [colocando, setColocando] = useState<{ termo: string; assetId: string; positionU: string; heightU: string; face: RackFace } | null>(null);
  const [achados, setAchados] = useState<AssetView[]>([]);
  const [edicao, setEdicao] = useState<{ name: string; units: string; roomId: string; position: string } | null>(null);
  const [salas, setSalas] = useState<SalaView[]>([]);
  const [movendo, setMovendo] = useState<{ item: ItemDeRackView; positionU: string } | null>(null);

  const carregar = useCallback(async () => setRack(await obterRack(id)), [id]);
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar.'));
  }, [carregar]);

  async function agir(acao: () => Promise<RackDetail | void>) {
    setErro(null);
    try {
      const r = await acao();
      if (r) setRack(r);
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function procurar(termo: string) {
    setAchados(await buscarAtivos({ q: termo || undefined, limit: 20 }).catch(() => []));
  }

  async function colocar(evento: FormEvent) {
    evento.preventDefault();
    if (!colocando) return;
    const ok = await agir(() =>
      colocarNoRack(id, { assetId: colocando.assetId, positionU: Number(colocando.positionU), heightU: Number(colocando.heightU) || 1, face: colocando.face }),
    );
    if (ok) setColocando(null);
  }

  if (erro && !rack) return <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div>;
  if (!rack) return <div className="sk sk-bloco" />;

  const coluna = (face: RackFace) => (face === 'FRENTE' ? '2' : face === 'TRAS' ? '3' : '2 / span 2');
  const linha = (i: { positionU: number; heightU: number }) => `${rack.units - (i.positionU + i.heightU - 1) + 1} / span ${i.heightU}`;

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <p className="suave"><Link to="/datacenter">Datacenter</Link>{rack.room ? ` · ${rack.room.name}` : ''}</p>
          <h2 className="titulo-seccao">{rack.name}</h2>
          <p>{rack.units} U · {rack.usedUnits} ocupados{rack.position ? ` · ${rack.position}` : ''}</p>
        </div>
        {podeGerenciar ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn -primario"
              onClick={() => { setColocando({ termo: '', assetId: '', positionU: String(rack.freeRanges[0]?.from ?? 1), heightU: '1', face: 'FRENTE' }); void procurar(''); }}>
              Colocar equipamento
            </button>
            <button type="button" className="btn -fantasma"
              onClick={async () => { setEdicao({ name: rack.name, units: String(rack.units), roomId: rack.room?.id ?? '', position: rack.position ?? '' }); setSalas(await listarSalas().catch(() => [])); }}>
              Editar
            </button>
            {rack.items.length === 0 ? (
              <button type="button" className="btn -fantasma" onClick={() => { if (window.confirm(`Excluir o rack ${rack.name}?`)) void agir(() => removerRack(id)).then((ok) => ok && navegar('/datacenter')); }}>Excluir</button>
            ) : null}
          </div>
        ) : null}
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}

      {edicao ? (
        <form className="card pilha-sm" style={{ padding: 16 }} noValidate onSubmit={(e) => {
          e.preventDefault();
          void agir(() => editarRack(id, { name: edicao.name.trim(), units: Number(edicao.units), roomId: edicao.roomId || null, position: edicao.position.trim() || null })).then((ok) => ok && setEdicao(null));
        }}>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="er-nome">Nome</label>
              <input id="er-nome" className="input" value={edicao.name} onChange={(e) => setEdicao({ ...edicao, name: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="er-u">Altura (U)</label>
              <input id="er-u" className="input" inputMode="numeric" value={edicao.units} onChange={(e) => setEdicao({ ...edicao, units: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="er-sala">Sala</label>
              <select id="er-sala" className="input" value={edicao.roomId} onChange={(e) => setEdicao({ ...edicao, roomId: e.target.value })}>
                <option value="">—</option>{salas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="er-pos">Posição na sala</label>
              <input id="er-pos" className="input" value={edicao.position} onChange={(e) => setEdicao({ ...edicao, position: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario">Salvar</button>
            <button type="button" className="btn -fantasma" onClick={() => setEdicao(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {colocando ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={colocar} noValidate>
          <h3>Colocar equipamento</h3>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="c-busca">Equipamento</label>
              <input id="c-busca" className="input" placeholder="Buscar pelo nome ou patrimônio" value={colocando.termo}
                onChange={(e) => { setColocando({ ...colocando, termo: e.target.value }); void procurar(e.target.value); }} />
              <select className="input" aria-label="Equipamento encontrado" value={colocando.assetId} onChange={(e) => setColocando({ ...colocando, assetId: e.target.value })}>
                <option value="">Escolha…</option>{achados.map((a) => <option key={a.id} value={a.id}>{a.name}{a.tag ? ` (${a.tag})` : ''}</option>)}
              </select></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="c-u">U de baixo</label>
              <input id="c-u" className="input" inputMode="numeric" value={colocando.positionU} onChange={(e) => setColocando({ ...colocando, positionU: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="c-h">Altura (U)</label>
              <input id="c-h" className="input" inputMode="numeric" value={colocando.heightU} onChange={(e) => setColocando({ ...colocando, heightU: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="c-f">Face</label>
              <select id="c-f" className="input" value={colocando.face} onChange={(e) => setColocando({ ...colocando, face: e.target.value as RackFace })}>
                {RACK_FACES.map((f) => <option key={f} value={f}>{ROTULO_FACE[f]}</option>)}
              </select></div>
          </div>
          <p className="campo-ajuda">Livre na frente: {rack.freeRanges.length ? rack.freeRanges.map((f) => (f.from === f.to ? `U${f.from}` : `U${f.from}–${f.to}`)).join(', ') : 'nada'}.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={!colocando.assetId || !colocando.positionU}>Colocar</button>
            <button type="button" className="btn -fantasma" onClick={() => setColocando(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {movendo ? (
        <form className="card" style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} noValidate onSubmit={(e) => {
          e.preventDefault();
          void agir(() => moverNoRack(movendo.item.id, { positionU: Number(movendo.positionU) })).then((ok) => ok && setMovendo(null));
        }}>
          <span>Mover <strong>{movendo.item.asset.name}</strong> para o U</span>
          <input className="input" style={{ width: 80 }} inputMode="numeric" aria-label="Novo U" value={movendo.positionU} onChange={(e) => setMovendo({ ...movendo, positionU: e.target.value })} />
          <button type="submit" className="btn -sm">Mover</button>
          <button type="button" className="btn -fantasma -sm" onClick={() => void agir(() => retirarDoRack(movendo.item.id)).then((ok) => ok && setMovendo(null))}>Retirar do rack</button>
          <button type="button" className="btn -fantasma -sm" onClick={() => setMovendo(null)}>Cancelar</button>
        </form>
      ) : null}

      <section className="card">
        <div className="card-corpo" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px minmax(220px, 1fr) minmax(220px, 1fr)', gridTemplateRows: `28px repeat(${rack.units}, ${ALTURA_U}px)`, gap: '1px 6px', minWidth: 520 }}>
            <div />
            <strong style={{ gridColumn: '2', gridRow: '1' }}>Frente</strong>
            <strong style={{ gridColumn: '3', gridRow: '1' }}>Trás</strong>
            {Array.from({ length: rack.units }, (_, i) => rack.units - i).map((u) => (
              <div key={`u${u}`} className="mono suave" style={{ gridColumn: '1', gridRow: `${rack.units - u + 2}`, fontSize: 11, textAlign: 'right', lineHeight: `${ALTURA_U}px` }}>{u}</div>
            ))}
            {Array.from({ length: rack.units }, (_, i) => i).map((i) => (
              <div key={`f${i}`} style={{ gridColumn: '2 / span 2', gridRow: `${i + 2}`, borderBottom: '1px dashed var(--borda, #e5e7eb)' }} />
            ))}
            {rack.items.map((it) => {
              const [inicio, span] = linha(it).split(' / ');
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={!podeGerenciar}
                  onClick={() => setMovendo({ item: it, positionU: String(it.positionU) })}
                  title={`${it.asset.name} · U${it.positionU}${it.heightU > 1 ? `–${it.positionU + it.heightU - 1}` : ''} · ${ROTULO_FACE[it.face]}`}
                  style={{
                    gridColumn: coluna(it.face),
                    gridRow: `${Number(inicio) + 1} / ${span}`,
                    background: 'var(--primaria-suave, #dbeafe)',
                    border: '1px solid var(--primaria, #2563eb)',
                    borderRadius: 4,
                    padding: '0 8px',
                    textAlign: 'left',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    cursor: podeGerenciar ? 'pointer' : 'default',
                    zIndex: 1,
                  }}
                >
                  <Link to={`/ativos/${it.asset.id}`} onClick={(e) => e.stopPropagation()}>{it.asset.name}</Link>
                  <span className="suave"> · U{it.positionU}{it.heightU > 1 ? `–${it.positionU + it.heightU - 1}` : ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
