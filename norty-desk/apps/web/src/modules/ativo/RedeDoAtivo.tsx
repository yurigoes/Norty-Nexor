import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PORT_KINDS, ROTULO_PORTA, ROTULO_FACE, type AssetView, type OndeEstaNoRack, type PortKind, type PortaView, type RedeDoAtivo, type VlanView } from '@norty-desk/shared';

import { buscarAtivos } from '../../api/ativos';
import { ErroDaApi } from '../../api/cliente';
import { rackDoAtivo } from '../../api/datacenter';
import {
  conectarPorta,
  criarIp,
  criarPorta,
  desconectarPorta,
  listarVlans,
  redeDoAtivo,
  removerIp,
  removerPorta,
} from '../../api/rede';
import { useAutenticacao } from '../../auth/Autenticacao';

type NovaPorta = { name: string; kind: PortKind; mac: string; speedMbps: string; vlanId: string };

/**
 * Rede do equipamento: portas (com o que está do outro lado do cabo), IPs
 * e em que rack ele fica. Ligar uma porta grava os dois lados.
 */
export function RedeDoAtivoCard({ assetId }: { assetId: string }) {
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');
  const [rede, setRede] = useState<RedeDoAtivo | null>(null);
  const [rack, setRack] = useState<OndeEstaNoRack>(null);
  const [vlans, setVlans] = useState<VlanView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [porta, setPorta] = useState<NovaPorta | null>(null);
  const [ip, setIp] = useState<{ address: string; portId: string; fqdn: string } | null>(null);
  const [ligando, setLigando] = useState<{ porta: PortaView; termo: string; ativos: AssetView[]; alvo: RedeDoAtivo | null } | null>(null);

  const carregar = useCallback(async () => {
    const [r, k] = await Promise.all([redeDoAtivo(assetId), rackDoAtivo(assetId)]);
    setRede(r);
    setRack(k);
  }, [assetId]);

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar a rede do equipamento.'));
  }, [carregar]);

  async function agir(acao: () => Promise<RedeDoAtivo | unknown>) {
    setErro(null);
    try {
      const r = await acao();
      if (r && typeof r === 'object' && 'ports' in r) setRede(r as RedeDoAtivo);
      else await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function salvarPorta(evento: FormEvent) {
    evento.preventDefault();
    if (!porta) return;
    const ok = await agir(() =>
      criarPorta(assetId, {
        name: porta.name.trim(),
        kind: porta.kind,
        mac: porta.mac.trim() || null,
        speedMbps: porta.speedMbps.trim() ? Number(porta.speedMbps) : null,
        vlanId: porta.vlanId || null,
      }),
    );
    if (ok) setPorta(null);
  }

  const semNada = rede && rede.ports.length === 0 && rede.ips.length === 0 && !rack;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Rede e rack</h3>
          <p className="card-sub">
            {rack ? (
              <>No rack <Link to={`/datacenter/racks/${rack.rack.id}`}>{rack.rack.name}</Link>{rack.rack.room ? ` (${rack.rack.room.name})` : ''}, U{rack.positionU}{rack.heightU > 1 ? `–${rack.positionU + rack.heightU - 1}` : ''} · {ROTULO_FACE[rack.face]}</>
            ) : 'Portas, IPs e com o que cada porta se liga.'}
          </p>
        </div>
        {podeGerenciar ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn -sm" onClick={async () => { setPorta({ name: '', kind: 'ETHERNET', mac: '', speedMbps: '', vlanId: '' }); setVlans(await listarVlans().catch(() => [])); }}>Porta</button>
            <button type="button" className="btn -sm" onClick={() => setIp({ address: '', portId: '', fqdn: '' })}>IP</button>
          </div>
        ) : null}
      </div>
      <div className="card-corpo pilha-sm">
        {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}

        {porta ? (
          <form className="pilha-sm" onSubmit={salvarPorta} noValidate>
            <div className="campo-grupo">
              <div className="campo"><label className="campo-rotulo" htmlFor="po-nome">Porta</label>
                <input id="po-nome" className="input mono" placeholder="eth0, Gi1/0/12" value={porta.name} onChange={(e) => setPorta({ ...porta, name: e.target.value })} /></div>
              <div className="campo"><label className="campo-rotulo" htmlFor="po-tipo">Tipo</label>
                <select id="po-tipo" className="input" value={porta.kind} onChange={(e) => setPorta({ ...porta, kind: e.target.value as PortKind })}>
                  {PORT_KINDS.map((k) => <option key={k} value={k}>{ROTULO_PORTA[k]}</option>)}
                </select></div>
              <div className="campo"><label className="campo-rotulo" htmlFor="po-mac">MAC</label>
                <input id="po-mac" className="input mono" placeholder="aa:bb:cc:dd:ee:ff" value={porta.mac} onChange={(e) => setPorta({ ...porta, mac: e.target.value })} /></div>
              <div className="campo"><label className="campo-rotulo" htmlFor="po-vel">Mbps</label>
                <input id="po-vel" className="input" inputMode="numeric" value={porta.speedMbps} onChange={(e) => setPorta({ ...porta, speedMbps: e.target.value })} /></div>
              <div className="campo"><label className="campo-rotulo" htmlFor="po-vlan">VLAN</label>
                <select id="po-vlan" className="input" value={porta.vlanId} onChange={(e) => setPorta({ ...porta, vlanId: e.target.value })}>
                  <option value="">—</option>{vlans.map((v) => <option key={v.id} value={v.id}>{v.tag} · {v.name}</option>)}
                </select></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn -primario" disabled={!porta.name.trim()}>Salvar</button>
              <button type="button" className="btn -fantasma" onClick={() => setPorta(null)}>Cancelar</button>
            </div>
          </form>
        ) : null}

        {ip ? (
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} noValidate onSubmit={(e) => {
            e.preventDefault();
            void agir(() => criarIp({ address: ip.address.trim(), assetId, portId: ip.portId || null, fqdn: ip.fqdn.trim() || null })).then((ok) => ok && setIp(null));
          }}>
            <input className="input mono" style={{ maxWidth: 200 }} placeholder="192.168.15.10" aria-label="IP" value={ip.address} onChange={(e) => setIp({ ...ip, address: e.target.value })} />
            <select className="input" style={{ maxWidth: 180 }} aria-label="Porta" value={ip.portId} onChange={(e) => setIp({ ...ip, portId: e.target.value })}>
              <option value="">Sem porta</option>{rede?.ports.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="input" style={{ maxWidth: 240 }} placeholder="nome.dominio (opcional)" aria-label="FQDN" value={ip.fqdn} onChange={(e) => setIp({ ...ip, fqdn: e.target.value })} />
            <button type="submit" className="btn -sm" disabled={!ip.address.trim()}>Salvar</button>
            <button type="button" className="btn -fantasma -sm" onClick={() => setIp(null)}>Cancelar</button>
          </form>
        ) : null}

        {!rede ? <div className="sk sk-linha" /> : semNada ? <p className="campo-ajuda">Nenhuma porta, IP ou rack registrado.</p> : (
          <>
            {rede.ports.map((p) => (
              <div key={p.id} className="pilha-sm" style={{ borderBottom: '1px solid var(--borda, #eee)', paddingBottom: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong className="mono">{p.name}</strong>
                  <span className="suave">
                    {ROTULO_PORTA[p.kind]}{p.speedMbps ? ` · ${p.speedMbps >= 1000 ? `${p.speedMbps / 1000} Gbps` : `${p.speedMbps} Mbps`}` : ''}
                    {p.mac ? ` · ${p.mac}` : ''}{p.vlan ? ` · VLAN ${p.vlan.tag}` : ''}
                  </span>
                  {p.connectedTo ? (
                    <span>↔ <Link to={`/ativos/${p.connectedTo.asset.id}`}>{p.connectedTo.asset.name}</Link> <span className="mono">{p.connectedTo.name}</span></span>
                  ) : <span className="suave">sem cabo registrado</span>}
                  {podeGerenciar ? (
                    p.connectedTo ? (
                      <button type="button" className="btn -fantasma -sm" onClick={() => void agir(() => desconectarPorta(p.id))}>Desligar</button>
                    ) : (
                      <button type="button" className="btn -fantasma -sm" onClick={async () => setLigando({ porta: p, termo: '', ativos: (await buscarAtivos({ limit: 20 }).catch(() => [])).filter((a) => a.id !== assetId), alvo: null })}>Ligar a…</button>
                    )
                  ) : null}
                  {podeGerenciar ? <button type="button" className="btn -fantasma -sm" onClick={() => { if (window.confirm(`Excluir a porta ${p.name}?`)) void agir(() => removerPorta(p.id)); }}>×</button> : null}
                </div>
                {p.ips.length ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {p.ips.map((i) => (
                      <span key={i.id} className="selo -contorno mono">
                        {i.address}{i.fqdn ? ` · ${i.fqdn}` : ''}
                        {podeGerenciar ? <button type="button" className="btn -fantasma -sm" aria-label={`Liberar ${i.address}`} onClick={() => void agir(() => removerIp(i.id))}>×</button> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
                {ligando?.porta.id === p.id ? (
                  <div className="pilha-sm">
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar o outro equipamento" value={ligando.termo}
                        onChange={async (e) => { const termo = e.target.value; setLigando({ ...ligando, termo, alvo: null, ativos: (await buscarAtivos({ q: termo || undefined, limit: 20 }).catch(() => [])).filter((a) => a.id !== assetId) }); }} />
                      <select className="input" style={{ maxWidth: 260 }} aria-label="Outro equipamento"
                        onChange={async (e) => { if (e.target.value) setLigando({ ...ligando, alvo: await redeDoAtivo(e.target.value).catch(() => null) }); }}>
                        <option value="">Escolha…</option>{ligando.ativos.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <button type="button" className="btn -fantasma -sm" onClick={() => setLigando(null)}>Cancelar</button>
                    </div>
                    {ligando.alvo ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {ligando.alvo.ports.length === 0 ? <span className="suave">Esse equipamento não tem portas cadastradas.</span> : ligando.alvo.ports.map((q) => (
                          <button key={q.id} type="button" className="btn -sm" disabled={Boolean(q.connectedTo)} title={q.connectedTo ? `Já ligada a ${q.connectedTo.asset.name}` : undefined}
                            onClick={() => void agir(() => conectarPorta(p.id, q.id)).then((ok) => ok && setLigando(null))}>
                            {q.name}{q.connectedTo ? ' (ocupada)' : ''}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
            {rede.ips.length ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="suave">IPs sem porta:</span>
                {rede.ips.map((i) => (
                  <span key={i.id} className="selo -contorno mono">
                    {i.address}{i.fqdn ? ` · ${i.fqdn}` : ''}
                    {podeGerenciar ? <button type="button" className="btn -fantasma -sm" aria-label={`Liberar ${i.address}`} onClick={() => void agir(() => removerIp(i.id))}>×</button> : null}
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
