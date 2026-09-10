import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RackView, SalaView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import { criarRack, criarSala, listarRacks, listarSalas, removerSala } from '../../api/datacenter';
import { useAutenticacao } from '../../auth/Autenticacao';

/** Salas e racks, com quanto de cada rack está ocupado. */
export function Datacenter() {
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');
  const navegar = useNavigate();
  const [salas, setSalas] = useState<SalaView[]>([]);
  const [racks, setRacks] = useState<RackView[] | null>(null);
  const [novaSala, setNovaSala] = useState('');
  const [novoRack, setNovoRack] = useState<{ name: string; roomId: string; units: string; position: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [s, r] = await Promise.all([listarSalas(), listarRacks()]);
    setSalas(s);
    setRacks(r);
  }, []);

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar o datacenter.'));
  }, [carregar]);

  async function agir(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function salvarRack(evento: FormEvent) {
    evento.preventDefault();
    if (!novoRack) return;
    await agir(async () => {
      const r = await criarRack({ name: novoRack.name.trim(), roomId: novoRack.roomId || null, units: Number(novoRack.units) || 42, position: novoRack.position.trim() || null });
      navegar(`/datacenter/racks/${r.id}`);
    });
  }

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Datacenter</h2>
          <p>Salas, racks e o que está em cada U. Dois equipamentos no mesmo U o sistema não aceita.</p>
        </div>
        {podeGerenciar ? <button type="button" className="btn -primario" onClick={() => setNovoRack({ name: '', roomId: '', units: '42', position: '' })}>Novo rack</button> : null}
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}

      {novoRack ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarRack} noValidate>
          <h3>Novo rack</h3>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="r-nome">Nome</label>
              <input id="r-nome" className="input" value={novoRack.name} placeholder="RACK-01" onChange={(e) => setNovoRack({ ...novoRack, name: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="r-sala">Sala</label>
              <select id="r-sala" className="input" value={novoRack.roomId} onChange={(e) => setNovoRack({ ...novoRack, roomId: e.target.value })}>
                <option value="">—</option>{salas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="r-u">Altura (U)</label>
              <input id="r-u" className="input" inputMode="numeric" value={novoRack.units} onChange={(e) => setNovoRack({ ...novoRack, units: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="r-pos">Posição na sala</label>
              <input id="r-pos" className="input" value={novoRack.position} placeholder="fila B, 3" onChange={(e) => setNovoRack({ ...novoRack, position: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={!novoRack.name.trim()}>Criar e abrir</button>
            <button type="button" className="btn -fantasma" onClick={() => setNovoRack(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {!racks ? <div className="sk sk-bloco" /> : racks.length === 0 ? (
        <div className="vazio"><h3>Nenhum rack</h3><p>Cadastre o primeiro e posicione os equipamentos por U.</p></div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Rack</th><th>Sala</th><th>Posição</th><th style={{ minWidth: 180 }}>Ocupação</th></tr></thead>
              <tbody>
                {racks.map((r) => {
                  const p = Math.round((r.usedUnits / r.units) * 100);
                  return (
                    <tr key={r.id}>
                      <td className="tabela-titulo-celula"><Link to={`/datacenter/racks/${r.id}`}>{r.name}</Link></td>
                      <td>{r.room?.name ?? <span className="suave">—</span>}</td>
                      <td>{r.position ?? <span className="suave">—</span>}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--borda, #e5e7eb)', overflow: 'hidden' }}>
                            <div style={{ width: `${p}%`, height: '100%', background: p >= 90 ? 'var(--erro, #b42318)' : 'var(--primaria, #2563eb)' }} />
                          </div>
                          <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)', whiteSpace: 'nowrap' }}>{r.usedUnits} de {r.units} U</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="card">
        <div className="card-topo"><div><h3 className="card-titulo">Salas</h3></div></div>
        <div className="card-corpo pilha-sm">
          {salas.length === 0 ? <p className="campo-ajuda">Nenhuma sala cadastrada.</p> : salas.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{s.name}</strong>
              <span className="suave">{s.location ? `· ${s.location.name} ` : ''}· {s.rackCount} rack(s)</span>
              {podeGerenciar && s.rackCount === 0 ? <button type="button" className="btn -fantasma -sm" onClick={() => void agir(async () => setSalas(await removerSala(s.id)))}>Excluir</button> : null}
            </div>
          ))}
          {podeGerenciar ? (
            <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void agir(async () => { setSalas(await criarSala({ name: novaSala.trim() })); setNovaSala(''); }); }}>
              <input className="input" style={{ maxWidth: 260 }} placeholder="Nome da sala" aria-label="Nome da sala" value={novaSala} onChange={(e) => setNovaSala(e.target.value)} />
              <button type="submit" className="btn -sm" disabled={!novaSala.trim()}>Adicionar</button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
