import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FabricanteView, LicencaView, SoftwareView } from '@norty-desk/shared';

import { listarFabricantes } from '../../api/catalogoAtivo';
import { ErroDaApi } from '../../api/cliente';
import { criarSoftware, licencasVencendo, listarSoftware } from '../../api/software';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';
import { SeloDaSituacao, textoDeAssentos } from './comum';

/**
 * O catálogo de software da organização, com a conta que importa numa
 * auditoria de licença: quantos equipamentos têm, quantos assentos foram
 * comprados, e quantas instalações estão sem licença.
 */
export function Softwares() {
  const { can } = useAutenticacao();
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [inativos, setInativos] = useState(false);
  const [lista, setLista] = useState<SoftwareView[] | null>(null);
  const [vencendo, setVencendo] = useState<LicencaView[]>([]);
  const [novo, setNovo] = useState<{ name: string; manufacturerId: string; category: string } | null>(null);
  const [fabricantes, setFabricantes] = useState<FabricanteView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(async () => {
    setLista(await listarSoftware({ q: busca || undefined, incluirInativos: inativos }));
  }, [busca, inativos]);

  useEffect(() => {
    setLista(null);
    void recarregar().catch(() => setErro('Não foi possível carregar o software.'));
  }, [recarregar]);

  useEffect(() => {
    void licencasVencendo(30).then(setVencendo).catch(() => undefined);
  }, []);

  async function abrirNovo() {
    setErro(null);
    setNovo({ name: '', manufacturerId: '', category: '' });
    if (fabricantes.length === 0) setFabricantes(await listarFabricantes().catch(() => []));
  }

  async function salvarNovo(evento: FormEvent) {
    evento.preventDefault();
    if (!novo) return;
    setEnviando(true);
    setErro(null);
    try {
      const criado = await criarSoftware({
        name: novo.name.trim(),
        manufacturerId: novo.manufacturerId || null,
        category: novo.category.trim() || null,
      });
      navegar(`/software/${criado.id}`);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setEnviando(false);
    }
  }

  const semLicenca = (lista ?? []).reduce((soma, s) => soma + s.unlicensedInstalls, 0);

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Software e licenças</h2>
          <p>O que está instalado em cada equipamento, o que foi comprado e quem ocupa cada assento.</p>
        </div>
        {can('ativo:gerenciar') ? (
          <button type="button" className="btn -primario" onClick={() => void abrirNovo()}>
            Novo software
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="alerta-bloco -erro" role="alert">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {vencendo.length > 0 ? (
        <div className="alerta-bloco -erro" role="status">
          <span aria-hidden="true">!</span>
          <span>
            {vencendo.length} licença(s) vencida(s) ou vencendo em 30 dias:{' '}
            {vencendo.slice(0, 4).map((l, i) => (
              <span key={l.id}>
                {i > 0 ? ', ' : ''}
                <Link to={`/software/${l.software.id}`}>
                  {l.software.name} — {l.name}
                </Link>{' '}
                ({l.expiresAt ? dataCurta(l.expiresAt) : ''})
              </span>
            ))}
            {vencendo.length > 4 ? ` e mais ${vencendo.length - 4}.` : '.'}
          </span>
        </div>
      ) : null}

      {semLicenca > 0 ? (
        <div className="alerta-bloco -aviso" role="status">
          <span aria-hidden="true">!</span>
          <span>{semLicenca} instalação(ões) sem licença nesta lista — é o que uma auditoria do fabricante cobra.</span>
        </div>
      ) : null}

      {novo ? (
        <form className="pilha-sm card" style={{ padding: 16 }} onSubmit={salvarNovo} noValidate>
          <h3>Novo software</h3>
          <div className="campo">
            <label className="campo-rotulo" htmlFor="sw-nome">Nome</label>
            <input id="sw-nome" className="input" required minLength={2} value={novo.name}
              onChange={(e) => setNovo({ ...novo, name: e.target.value })} placeholder="Microsoft Office" />
          </div>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="sw-fab">Fabricante</label>
              <select id="sw-fab" className="input" value={novo.manufacturerId}
                onChange={(e) => setNovo({ ...novo, manufacturerId: e.target.value })}>
                <option value="">—</option>
                {fabricantes.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="sw-cat">Categoria</label>
              <input id="sw-cat" className="input" value={novo.category} placeholder="Escritório, Segurança…"
                onChange={(e) => setNovo({ ...novo, category: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={enviando || novo.name.trim().length < 2}>
              {enviando ? 'Salvando…' : 'Criar e abrir'}
            </button>
            <button type="button" className="btn -fantasma" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <form
        style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(termo.trim());
        }}
      >
        <input className="input" type="search" style={{ flex: 1, minWidth: 220 }}
          placeholder="Buscar por nome, fabricante ou categoria" value={termo}
          onChange={(e) => setTermo(e.target.value)} />
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={inativos} onChange={(e) => setInativos(e.target.checked)} />
          Mostrar desativados
        </label>
      </form>

      {!lista ? (
        <div className="sk sk-bloco" />
      ) : lista.length === 0 ? (
        <div className="vazio">
          <h3>Nenhum software</h3>
          <p>Cadastre o primeiro — ou instale direto pela tela de um equipamento.</p>
        </div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Software</th>
                  <th>Fabricante</th>
                  <th className="-num">Equipamentos</th>
                  <th>Assentos</th>
                  <th>Situação</th>
                  <th>Próxima validade</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td className="tabela-titulo-celula">
                      <Link to={`/software/${s.id}`}>{s.name}</Link>
                      {s.category ? <span className="suave"> · {s.category}</span> : null}
                      {!s.isActive ? <span className="selo -neutro" style={{ marginLeft: 6 }}>Desativado</span> : null}
                    </td>
                    <td>{s.manufacturer?.name ?? <span className="suave">—</span>}</td>
                    <td className="-num">{s.installCount}</td>
                    <td>{textoDeAssentos(s.seatsUsed, s.seats)}</td>
                    <td>
                      {s.unlicensedInstalls > 0 ? (
                        <span className="selo -erro">{s.unlicensedInstalls} sem licença</span>
                      ) : s.seats !== null && s.seatsUsed > s.seats ? (
                        <SeloDaSituacao situacao="excedida" />
                      ) : (
                        <span className="selo -sucesso">Em dia</span>
                      )}
                    </td>
                    <td>{s.nextExpiry ? dataCurta(s.nextExpiry) : <span className="suave">—</span>}</td>
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
