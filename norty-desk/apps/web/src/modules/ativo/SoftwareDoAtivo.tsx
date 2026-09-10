import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { LicencaView, SoftwareDoAtivo, SoftwareView } from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  atribuirLicenca,
  desinstalarSoftware,
  instalarSoftware,
  liberarAssento,
  listarSoftware,
  obterSoftware,
  softwareDoAtivo,
} from '../../api/software';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';

/**
 * O software do equipamento: o que está instalado, se cada um está
 * coberto por licença, e os assentos que esta máquina ocupa.
 */
export function SoftwareDoAtivoCard({ assetId }: { assetId: string }) {
  const { can } = useAutenticacao();
  const podeGerenciar = can('ativo:gerenciar');
  const [dados, setDados] = useState<SoftwareDoAtivo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [instalando, setInstalando] = useState<{ softwareId: string; version: string; installedAt: string } | null>(null);
  const [catalogo, setCatalogo] = useState<SoftwareView[]>([]);
  /** Licenças com assento livre do software que se quer cobrir. */
  const [cobrindo, setCobrindo] = useState<{ softwareId: string; licencas: LicencaView[] } | null>(null);

  const carregar = useCallback(async () => setDados(await softwareDoAtivo(assetId)), [assetId]);

  useEffect(() => {
    void carregar().catch(() => setErro('Não foi possível carregar o software deste equipamento.'));
  }, [carregar]);

  async function agir(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      const r = await acao();
      if (r && typeof r === 'object' && 'installations' in r) setDados(r as SoftwareDoAtivo);
      else await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function abrirInstalacao() {
    setInstalando({ softwareId: '', version: '', installedAt: '' });
    if (catalogo.length === 0) setCatalogo(await listarSoftware().catch(() => []));
  }

  async function instalar(evento: FormEvent) {
    evento.preventDefault();
    if (!instalando) return;
    const ok = await agir(() =>
      instalarSoftware(assetId, {
        softwareId: instalando.softwareId,
        version: instalando.version.trim(),
        installedAt: instalando.installedAt || null,
      }),
    );
    if (ok) setInstalando(null);
  }

  async function abrirCobertura(softwareId: string) {
    setErro(null);
    try {
      const sw = await obterSoftware(softwareId);
      setCobrindo({ softwareId, licencas: sw.licenses.filter((l) => l.seats === null || l.seatsUsed < l.seats) });
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar as licenças.');
    }
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Software instalado</h3>
          <p className="card-sub">E se cada um está coberto por licença.</p>
        </div>
        {podeGerenciar && !instalando ? (
          <button type="button" className="btn -sm" onClick={() => void abrirInstalacao()}>Instalar</button>
        ) : null}
      </div>
      <div className="card-corpo pilha-sm">
        {erro ? (
          <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div>
        ) : null}

        {instalando ? (
          <form className="pilha-sm" onSubmit={instalar} noValidate>
            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="inst-sw">Software</label>
                <select id="inst-sw" className="input" value={instalando.softwareId}
                  onChange={(e) => setInstalando({ ...instalando, softwareId: e.target.value })}>
                  <option value="">Escolha…</option>
                  {catalogo.map((s) => <option key={s.id} value={s.id}>{s.name}{s.manufacturer ? ` — ${s.manufacturer.name}` : ''}</option>)}
                </select>
                <span className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
                  Não está na lista? Cadastre em <Link to="/software">Software e licenças</Link>.
                </span>
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="inst-versao">Versão</label>
                <input id="inst-versao" className="input" placeholder="2021, 24.1…" value={instalando.version}
                  onChange={(e) => setInstalando({ ...instalando, version: e.target.value })} />
              </div>
              <div className="campo">
                <label className="campo-rotulo" htmlFor="inst-data">Instalado em</label>
                <input id="inst-data" className="input" type="date" value={instalando.installedAt}
                  onChange={(e) => setInstalando({ ...instalando, installedAt: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn -primario" disabled={!instalando.softwareId || !instalando.version.trim()}>Instalar</button>
              <button type="button" className="btn -fantasma" onClick={() => setInstalando(null)}>Cancelar</button>
            </div>
          </form>
        ) : null}

        {!dados ? (
          <div className="sk sk-linha" />
        ) : dados.installations.length === 0 ? (
          <p className="campo-ajuda">Nenhum software registrado neste equipamento.</p>
        ) : (
          dados.installations.map((i) => (
            <div key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link to={`/software/${i.software.id}`}><strong>{i.software.name}</strong></Link>
              <span className="suave">{i.version.name}{i.installedAt ? ` · desde ${dataCurta(i.installedAt)}` : ''}</span>
              {i.licensed ? <span className="selo -sucesso">Coberta</span> : <span className="selo -erro">Sem licença</span>}
              {podeGerenciar && !i.licensed ? (
                <button type="button" className="btn -fantasma -sm" onClick={() => void abrirCobertura(i.software.id)}>Cobrir com licença</button>
              ) : null}
              {podeGerenciar ? (
                <button type="button" className="btn -fantasma -sm"
                  onClick={() => {
                    if (window.confirm(`Registrar que ${i.software.name} ${i.version.name} foi desinstalado?`)) {
                      void agir(() => desinstalarSoftware(assetId, i.id));
                    }
                  }}>
                  Desinstalar
                </button>
              ) : null}
              {cobrindo?.softwareId === i.software.id ? (
                <div style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {cobrindo.licencas.length === 0 ? (
                    <span className="suave">
                      Nenhuma licença com assento livre. <Link to={`/software/${i.software.id}`}>Cadastrar licença</Link>.
                    </span>
                  ) : (
                    cobrindo.licencas.map((l) => (
                      <button key={l.id} type="button" className="btn -sm"
                        onClick={() => void agir(() => atribuirLicenca(l.id, { assetId })).then((ok) => ok && setCobrindo(null))}>
                        {l.name} ({l.seats === null ? 'ilimitada' : `${l.seats - l.seatsUsed} livre(s)`})
                      </button>
                    ))
                  )}
                  <button type="button" className="btn -fantasma -sm" onClick={() => setCobrindo(null)}>Fechar</button>
                </div>
              ) : null}
            </div>
          ))
        )}

        {dados && dados.licenses.length > 0 ? (
          <>
            <div className="divisor-texto"><span>Assentos que esta máquina ocupa</span></div>
            {dados.licenses.map((a) => (
              <div key={a.assignmentId} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Link to={`/software/${a.software.id}`}>{a.software.name}</Link>
                <span className="suave">
                  {a.license.name}{a.license.expiresAt ? ` · válida até ${dataCurta(a.license.expiresAt)}` : ''}
                </span>
                {podeGerenciar ? (
                  <button type="button" className="btn -fantasma -sm"
                    onClick={() => void agir(() => liberarAssento(a.license.id, a.assignmentId))}>
                    Liberar assento
                  </button>
                ) : null}
              </div>
            ))}
          </>
        ) : null}
      </div>
    </section>
  );
}
