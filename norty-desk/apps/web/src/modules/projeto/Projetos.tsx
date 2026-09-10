import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PROJECT_STATUSES, ROTULO_PROJETO_STATUS, type ProjetoView } from '@norty-desk/shared';

import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { criarProjeto, listarProjetos } from '../../api/projetos';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';
import { Progresso, SeloDoProjeto } from './comum';

type Novo = { name: string; code: string; managerId: string; plannedStart: string; plannedEnd: string; priority: string };

/** Projetos da organização: o que está andando, de quem é, quanto falta e o que está atrasado. */
export function Projetos() {
  const { can } = useAutenticacao();
  const navegar = useNavigate();
  const [termo, setTermo] = useState('');
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('');
  const [encerrados, setEncerrados] = useState(false);
  const [lista, setLista] = useState<ProjetoView[] | null>(null);
  const [novo, setNovo] = useState<Novo | null>(null);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(async () => {
    setLista(await listarProjetos({ q: busca || undefined, status: status || undefined, incluirEncerrados: encerrados }));
  }, [busca, status, encerrados]);

  useEffect(() => {
    setLista(null);
    void recarregar().catch(() => setErro('Não foi possível carregar os projetos.'));
  }, [recarregar]);

  async function abrirNovo() {
    setErro(null);
    setNovo({ name: '', code: '', managerId: '', plannedStart: '', plannedEnd: '', priority: '3' });
    if (pessoas.length === 0) setPessoas(await listarPessoas().catch(() => []));
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!novo) return;
    setEnviando(true);
    setErro(null);
    try {
      const criado = await criarProjeto({
        name: novo.name.trim(),
        code: novo.code.trim() || null,
        managerId: novo.managerId || null,
        plannedStart: novo.plannedStart || null,
        plannedEnd: novo.plannedEnd || null,
        priority: Number(novo.priority) || 3,
      });
      navegar(`/projetos/${criado.id}`);
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    } finally {
      setEnviando(false);
    }
  }

  const atrasados = (lista ?? []).filter((p) => p.late).length;

  return (
    <div className="pilha" style={{ maxWidth: 1100 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Projetos</h2>
          <p>O que está andando, de quem é, quanto falta — e o que já passou do prazo.</p>
        </div>
        {can('projeto:gerenciar') ? (
          <button type="button" className="btn -primario" onClick={() => void abrirNovo()}>Novo projeto</button>
        ) : null}
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}
      {atrasados > 0 ? (
        <div className="alerta-bloco -aviso" role="status"><span aria-hidden="true">!</span><span>{atrasados} projeto(s) passaram do fim previsto.</span></div>
      ) : null}

      {novo ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvar} noValidate>
          <h3>Novo projeto</h3>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="p-nome">Nome</label>
              <input id="p-nome" className="input" value={novo.name} placeholder="Troca dos switches do 2º andar"
                onChange={(e) => setNovo({ ...novo, name: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="p-cod">Código</label>
              <input id="p-cod" className="input mono" value={novo.code} placeholder="PRJ-2026-04" onChange={(e) => setNovo({ ...novo, code: e.target.value })} />
            </div>
          </div>
          <div className="campo-grupo">
            <div className="campo">
              <label className="campo-rotulo" htmlFor="p-resp">Responsável</label>
              <select id="p-resp" className="input" value={novo.managerId} onChange={(e) => setNovo({ ...novo, managerId: e.target.value })}>
                <option value="">—</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="p-ini">Início previsto</label>
              <input id="p-ini" className="input" type="date" value={novo.plannedStart} onChange={(e) => setNovo({ ...novo, plannedStart: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="p-fim">Fim previsto</label>
              <input id="p-fim" className="input" type="date" value={novo.plannedEnd} onChange={(e) => setNovo({ ...novo, plannedEnd: e.target.value })} />
            </div>
            <div className="campo">
              <label className="campo-rotulo" htmlFor="p-pri">Prioridade</label>
              <select id="p-pri" className="input" value={novo.priority} onChange={(e) => setNovo({ ...novo, priority: e.target.value })}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}{n === 5 ? ' (mais alta)' : n === 1 ? ' (mais baixa)' : ''}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={enviando || novo.name.trim().length < 2}>{enviando ? 'Salvando…' : 'Criar e abrir'}</button>
            <button type="button" className="btn -fantasma" onClick={() => setNovo(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      <form style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); setBusca(termo.trim()); }}>
        <input className="input" type="search" style={{ flex: 1, minWidth: 220 }} placeholder="Buscar por nome ou código" value={termo} onChange={(e) => setTermo(e.target.value)} />
        <select className="input" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Em aberto</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{ROTULO_PROJETO_STATUS[s]}</option>)}
        </select>
        {!status ? (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={encerrados} onChange={(e) => setEncerrados(e.target.checked)} />
            Incluir concluídos e cancelados
          </label>
        ) : null}
      </form>

      {!lista ? (
        <div className="sk sk-bloco" />
      ) : lista.length === 0 ? (
        <div className="vazio"><h3>Nenhum projeto</h3><p>Crie o primeiro e quebre em tarefas: o andamento sai delas.</p></div>
      ) : (
        <div className="tabela-caixa">
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr><th>Projeto</th><th>Situação</th><th>Responsável</th><th style={{ minWidth: 140 }}>Andamento</th><th className="-num">Tarefas abertas</th><th>Fim previsto</th></tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id}>
                    <td className="tabela-titulo-celula">
                      {p.code ? <span className="mono suave">{p.code} · </span> : null}
                      <Link to={`/projetos/${p.id}`}>{p.name}</Link>
                    </td>
                    <td><SeloDoProjeto status={p.status} /></td>
                    <td>{p.manager?.name ?? <span className="suave">—</span>}</td>
                    <td><Progresso valor={p.percentDone} /></td>
                    <td className="-num">{p.openTaskCount}</td>
                    <td>
                      {p.plannedEnd ? dataCurta(p.plannedEnd) : <span className="suave">—</span>}
                      {p.late ? <span className="selo -erro" style={{ marginLeft: 6 }}>Atrasado</span> : null}
                    </td>
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
