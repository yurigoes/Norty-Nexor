import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SubRedeDetail, SubRedeView, VlanView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  criarIp,
  criarSubrede,
  criarVlan,
  listarSubredes,
  listarVlans,
  obterSubrede,
  removerIp,
  removerSubrede,
  removerVlan,
} from '../../api/rede';
import { useAutenticacao } from '../../auth/Autenticacao';

function Uso({ usado, total, percent }: { usado: number; total: number | null; percent: number | null }) {
  if (total === null) return <span className="suave">{usado} em uso</span>;
  const p = percent ?? 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--borda, #e5e7eb)', overflow: 'hidden', minWidth: 80 }}>
        <div style={{ width: `${Math.min(p, 100)}%`, height: '100%', background: p >= 90 ? 'var(--erro, #b42318)' : p >= 75 ? 'var(--aviso, #d97706)' : 'var(--primaria, #2563eb)' }} />
      </div>
      <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)', whiteSpace: 'nowrap' }}>{usado} de {total}</span>
    </div>
  );
}

/**
 * Endereçamento: sub-redes com uso e próximo IP livre, e VLANs. O IP de
 * cada equipamento se cadastra na tela dele; aqui dá para reservar
 * endereço sem equipamento.
 */
export function Rede() {
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');
  const [subredes, setSubredes] = useState<SubRedeView[] | null>(null);
  const [vlans, setVlans] = useState<VlanView[]>([]);
  const [aberta, setAberta] = useState<SubRedeDetail | null>(null);
  const [nova, setNova] = useState<{ name: string; cidr: string; gateway: string; vlanId: string } | null>(null);
  const [novaVlan, setNovaVlan] = useState({ tag: '', name: '' });
  const [reserva, setReserva] = useState({ address: '', fqdn: '' });
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [s, v] = await Promise.all([listarSubredes(), listarVlans()]);
    setSubredes(s);
    setVlans(v);
  }, []);

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar a rede.'));
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

  async function abrir(id: string) {
    await agir(async () => {
      const d = await obterSubrede(id);
      setAberta(d);
      setReserva({ address: d.nextFree ?? '', fqdn: '' });
    });
  }

  async function salvarSubrede(evento: FormEvent) {
    evento.preventDefault();
    if (!nova) return;
    const ok = await agir(async () => {
      const d = await criarSubrede({ name: nova.name.trim(), cidr: nova.cidr.trim(), gateway: nova.gateway.trim() || null, vlanId: nova.vlanId || null });
      setAberta(d);
      await carregar();
    });
    if (ok) setNova(null);
  }

  return (
    <div className="pilha" style={{ maxWidth: 1150 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Rede</h2>
          <p>Sub-redes, quanto de cada uma está em uso, o próximo IP livre — e as VLANs. IP repetido o sistema não aceita.</p>
        </div>
        {podeGerenciar ? <button type="button" className="btn -primario" onClick={() => setNova({ name: '', cidr: '', gateway: '', vlanId: '' })}>Nova sub-rede</button> : null}
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}

      {nova ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarSubrede} noValidate>
          <h3>Nova sub-rede</h3>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="sr-nome">Nome</label>
              <input id="sr-nome" className="input" value={nova.name} placeholder="Escritório" onChange={(e) => setNova({ ...nova, name: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="sr-cidr">Endereço/máscara</label>
              <input id="sr-cidr" className="input mono" value={nova.cidr} placeholder="192.168.15.0/24" onChange={(e) => setNova({ ...nova, cidr: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="sr-gw">Gateway</label>
              <input id="sr-gw" className="input mono" value={nova.gateway} placeholder="192.168.15.1" onChange={(e) => setNova({ ...nova, gateway: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="sr-vlan">VLAN</label>
              <select id="sr-vlan" className="input" value={nova.vlanId} onChange={(e) => setNova({ ...nova, vlanId: e.target.value })}>
                <option value="">—</option>{vlans.map((v) => <option key={v.id} value={v.id}>{v.tag} · {v.name}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={!nova.name.trim() || !nova.cidr.trim()}>Salvar</button>
            <button type="button" className="btn -fantasma" onClick={() => setNova(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {!subredes ? (
        <div className="sk sk-bloco" />
      ) : subredes.length === 0 ? (
        <div className="vazio"><h3>Nenhuma sub-rede</h3><p>Cadastre a primeira: os IPs já cadastrados que caírem nela passam a contar sozinhos.</p></div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead><tr><th>Sub-rede</th><th>Endereço</th><th>Gateway</th><th>VLAN</th><th style={{ minWidth: 180 }}>Uso</th></tr></thead>
              <tbody>
                {subredes.map((s) => (
                  <tr key={s.id} style={{ cursor: 'pointer', background: aberta?.id === s.id ? 'var(--fundo-suave, #f1f5f9)' : undefined }} onClick={() => void abrir(s.id)}>
                    <td className="tabela-titulo-celula">{s.name}</td>
                    <td className="mono">{s.cidr}</td>
                    <td className="mono">{s.gateway ?? <span className="suave">—</span>}</td>
                    <td>{s.vlan ? `${s.vlan.tag} · ${s.vlan.name}` : <span className="suave">—</span>}</td>
                    <td><Uso usado={s.used} total={s.total} percent={s.percent} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aberta ? (
        <section className="card">
          <div className="card-topo">
            <div>
              <h3 className="card-titulo">{aberta.name} <span className="mono suave">{aberta.cidr}</span></h3>
              <p className="card-sub">
                {aberta.nextFree ? <>Próximo livre: <code style={{ userSelect: 'all' }}>{aberta.nextFree}</code></> : aberta.total === null ? 'IPv6: sem próximo livre calculado.' : 'Sub-rede cheia.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {podeGerenciar ? (
                <button type="button" className="btn -fantasma -sm"
                  onClick={() => { if (window.confirm(`Excluir a sub-rede ${aberta.cidr}? Os IPs continuam cadastrados.`)) void agir(async () => { await removerSubrede(aberta.id); setAberta(null); await carregar(); }); }}>
                  Excluir sub-rede
                </button>
              ) : null}
              <button type="button" className="btn -fantasma -sm" onClick={() => setAberta(null)}>Fechar</button>
            </div>
          </div>
          <div className="card-corpo pilha-sm">
            {podeGerenciar ? (
              <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
                onSubmit={(e) => {
                  e.preventDefault();
                  void agir(async () => {
                    await criarIp({ address: reserva.address.trim(), fqdn: reserva.fqdn.trim() || null });
                    await abrir(aberta.id);
                    await carregar();
                  });
                }}>
                <input className="input mono" style={{ maxWidth: 200 }} aria-label="IP" value={reserva.address} onChange={(e) => setReserva({ ...reserva, address: e.target.value })} />
                <input className="input" style={{ maxWidth: 260 }} placeholder="nome.dominio (opcional)" aria-label="FQDN" value={reserva.fqdn} onChange={(e) => setReserva({ ...reserva, fqdn: e.target.value })} />
                <button type="submit" className="btn -sm" disabled={!reserva.address.trim()}>Reservar IP</button>
                <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)', alignSelf: 'center' }}>Para dar o IP a um equipamento, use a tela dele.</span>
              </form>
            ) : null}
            {aberta.addresses.length === 0 ? <p className="campo-ajuda">Nenhum IP em uso nesta sub-rede.</p> : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead><tr><th>IP</th><th>Nome</th><th>Equipamento</th><th>Porta</th><th /></tr></thead>
                  <tbody>
                    {aberta.addresses.map((i) => (
                      <tr key={i.id}>
                        <td className="mono">{i.address}{aberta.gateway === i.address ? <span className="selo -info" style={{ marginLeft: 6 }}>gateway</span> : null}</td>
                        <td>{i.fqdn ?? <span className="suave">—</span>}</td>
                        <td>{i.asset ? <Link to={`/ativos/${i.asset.id}`}>{i.asset.name}</Link> : <span className="suave">reservado</span>}</td>
                        <td>{i.port?.name ?? <span className="suave">—</span>}</td>
                        <td className="-num">
                          {podeGerenciar ? <button type="button" className="btn -fantasma -sm" onClick={() => void agir(async () => { await removerIp(i.id); await abrir(aberta.id); await carregar(); })}>Liberar</button> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-topo"><div><h3 className="card-titulo">VLANs</h3></div></div>
        <div className="card-corpo pilha-sm">
          {vlans.length === 0 ? <p className="campo-ajuda">Nenhuma VLAN cadastrada.</p> : (
            vlans.map((v) => (
              <div key={v.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className="mono">{v.tag}</span> <strong>{v.name}</strong>
                <span className="suave">· {v.networkCount} sub-rede(s) · {v.portCount} porta(s)</span>
                {podeGerenciar ? <button type="button" className="btn -fantasma -sm" onClick={() => { if (window.confirm(`Excluir a VLAN ${v.tag}?`)) void agir(async () => setVlans(await removerVlan(v.id))); }}>Excluir</button> : null}
              </div>
            ))
          )}
          {podeGerenciar ? (
            <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => {
              e.preventDefault();
              void agir(async () => { setVlans(await criarVlan({ tag: Number(novaVlan.tag), name: novaVlan.name.trim() })); setNovaVlan({ tag: '', name: '' }); });
            }}>
              <input className="input" style={{ maxWidth: 100 }} inputMode="numeric" placeholder="Tag" aria-label="Tag" value={novaVlan.tag} onChange={(e) => setNovaVlan({ ...novaVlan, tag: e.target.value })} />
              <input className="input" style={{ maxWidth: 240 }} placeholder="Nome" aria-label="Nome da VLAN" value={novaVlan.name} onChange={(e) => setNovaVlan({ ...novaVlan, name: e.target.value })} />
              <button type="submit" className="btn -sm" disabled={!novaVlan.tag || !novaVlan.name.trim()}>Adicionar</button>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
