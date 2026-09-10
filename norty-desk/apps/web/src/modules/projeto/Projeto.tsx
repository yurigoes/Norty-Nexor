import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  PROJECT_STATUSES,
  PROJECT_TASK_STATUSES,
  ROTULO_PROJETO_STATUS,
  ROTULO_TAREFA_PROJETO,
  type ProjectStatus,
  type ProjectTaskStatus,
  type ProjetoDetail,
  type ProjetoView,
  type TarefaDeProjetoView,
  type WriteTarefaDeProjetoRequest,
} from '@norty-desk/shared';

import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { listarTimes } from '../../api/endpoints';
import {
  criarTarefaDeProjeto,
  desvincularChamadoDoProjeto,
  editarProjeto,
  editarTarefaDeProjeto,
  listarProjetos,
  obterProjeto,
  removerProjeto,
  removerTarefaDeProjeto,
  vincularChamadoAoProjeto,
} from '../../api/projetos';
import { useAutenticacao } from '../../auth/Autenticacao';
import { dataCurta } from '../../lib/formato';
import { Progresso, SeloDoProjeto, horas } from './comum';

type FormProjeto = {
  name: string;
  code: string;
  description: string;
  status: ProjectStatus;
  priority: string;
  managerId: string;
  teamId: string;
  parentId: string;
  plannedStart: string;
  plannedEnd: string;
};

type FormTarefa = {
  id: string | null;
  name: string;
  description: string;
  status: ProjectTaskStatus;
  assigneeId: string;
  plannedStart: string;
  plannedEnd: string;
  plannedHours: string;
  dependsOnId: string;
  parentId: string;
};

const soData = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function formTarefa(t: TarefaDeProjetoView | null, status: ProjectTaskStatus = 'A_FAZER'): FormTarefa {
  return {
    id: t?.id ?? null,
    name: t?.name ?? '',
    description: t?.description ?? '',
    status: t?.status ?? status,
    assigneeId: t?.assignee?.id ?? '',
    plannedStart: soData(t?.plannedStart ?? null),
    plannedEnd: soData(t?.plannedEnd ?? null),
    plannedHours: t?.plannedMinutes ? String(t.plannedMinutes / 60) : '',
    dependsOnId: t?.dependsOn?.id ?? '',
    parentId: t?.parentId ?? '',
  };
}

/**
 * Um projeto: andamento, quadro de tarefas, linha do tempo, chamados e
 * subprojetos. O percentual vem das tarefas; o custo, dos chamados.
 */
export function Projeto() {
  const { id = '' } = useParams();
  const navegar = useNavigate();
  const { can, perfil } = useAutenticacao();
  const gerencia = can('projeto:gerenciar');
  const eu = perfil?.user.id;

  const [projeto, setProjeto] = useState<ProjetoDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<FormProjeto | null>(null);
  const [tarefa, setTarefa] = useState<FormTarefa | null>(null);
  const [numero, setNumero] = useState('');
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [times, setTimes] = useState<{ id: string; name: string }[]>([]);
  const [outros, setOutros] = useState<ProjetoView[]>([]);
  const [apontando, setApontando] = useState<{ id: string; percent: string; horas: string } | null>(null);

  const carregar = useCallback(async () => setProjeto(await obterProjeto(id)), [id]);
  useEffect(() => {
    void carregar().catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar.'));
  }, [carregar]);

  async function agir(acao: () => Promise<ProjetoDetail | void>) {
    setErro(null);
    try {
      const r = await acao();
      if (r) setProjeto(r);
      return true;
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir.');
      return false;
    }
  }

  async function garantirPessoas() {
    if (pessoas.length === 0) setPessoas(await listarPessoas().catch(() => []));
  }

  async function abrirEdicao() {
    if (!projeto) return;
    setEdicao({
      name: projeto.name,
      code: projeto.code ?? '',
      description: projeto.description ?? '',
      status: projeto.status,
      priority: String(projeto.priority),
      managerId: projeto.manager?.id ?? '',
      teamId: projeto.team?.id ?? '',
      parentId: projeto.parent?.id ?? '',
      plannedStart: soData(projeto.plannedStart),
      plannedEnd: soData(projeto.plannedEnd),
    });
    await garantirPessoas();
    if (times.length === 0) setTimes((await listarTimes().catch(() => [])) as { id: string; name: string }[]);
    if (outros.length === 0) setOutros((await listarProjetos({ incluirEncerrados: true }).catch(() => [])).filter((p) => p.id !== id));
  }

  async function salvarEdicao(evento: FormEvent) {
    evento.preventDefault();
    if (!edicao) return;
    const ok = await agir(() =>
      editarProjeto(id, {
        name: edicao.name.trim(),
        code: edicao.code.trim() || null,
        description: edicao.description.trim() || null,
        status: edicao.status,
        priority: Number(edicao.priority),
        managerId: edicao.managerId || null,
        teamId: edicao.teamId || null,
        parentId: edicao.parentId || null,
        plannedStart: edicao.plannedStart || null,
        plannedEnd: edicao.plannedEnd || null,
      }),
    );
    if (ok) setEdicao(null);
  }

  async function salvarTarefa(evento: FormEvent) {
    evento.preventDefault();
    if (!tarefa) return;
    const dados: WriteTarefaDeProjetoRequest = {
      name: tarefa.name.trim(),
      description: tarefa.description.trim() || null,
      status: tarefa.status,
      assigneeId: tarefa.assigneeId || null,
      plannedStart: tarefa.plannedStart || null,
      plannedEnd: tarefa.plannedEnd || null,
      plannedMinutes: tarefa.plannedHours.trim() ? Math.round(Number(tarefa.plannedHours.replace(',', '.')) * 60) : null,
      dependsOnId: tarefa.dependsOnId || null,
      parentId: tarefa.parentId || null,
    };
    const ok = await agir(() => (tarefa.id ? editarTarefaDeProjeto(id, tarefa.id, dados) : criarTarefaDeProjeto(id, dados)));
    if (ok) setTarefa(null);
  }

  const colunas = useMemo(() => {
    const porStatus = new Map<ProjectTaskStatus, TarefaDeProjetoView[]>(PROJECT_TASK_STATUSES.map((s) => [s, []]));
    for (const t of projeto?.tasks ?? []) porStatus.get(t.status)!.push(t);
    return porStatus;
  }, [projeto]);

  if (erro && !projeto) return <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div>;
  if (!projeto) return <div className="sk sk-bloco" />;

  const podeMexer = (t: TarefaDeProjetoView) => gerencia || t.assignee?.id === eu;
  const mover = (t: TarefaDeProjetoView, passo: number) => {
    const i = PROJECT_TASK_STATUSES.indexOf(t.status) + passo;
    const status = PROJECT_TASK_STATUSES[i];
    if (status) void agir(() => editarTarefaDeProjeto(id, t.id, { status }));
  };

  return (
    <div className="pilha" style={{ maxWidth: 1200 }}>
      <div className="cabecalho-secao">
        <div>
          <p className="suave">
            <Link to="/projetos">Projetos</Link>
            {projeto.parent ? <> · subprojeto de <Link to={`/projetos/${projeto.parent.id}`}>{projeto.parent.name}</Link></> : null}
          </p>
          <h2 className="titulo-seccao">
            {projeto.code ? <span className="mono suave">{projeto.code} · </span> : null}
            {projeto.name} <SeloDoProjeto status={projeto.status} />
            {projeto.late ? <span className="selo -erro" style={{ marginLeft: 6 }}>Atrasado</span> : null}
          </h2>
          <p>
            {projeto.manager ? `Responsável: ${projeto.manager.name}` : 'Sem responsável'}
            {projeto.team ? ` · time ${projeto.team.name}` : ''}
            {` · prioridade ${projeto.priority}`}
            {projeto.plannedStart || projeto.plannedEnd
              ? ` · previsto ${projeto.plannedStart ? dataCurta(projeto.plannedStart) : '?'} a ${projeto.plannedEnd ? dataCurta(projeto.plannedEnd) : '?'}`
              : ''}
            {projeto.realStart ? ` · começou ${dataCurta(projeto.realStart)}` : ''}
            {projeto.realEnd ? ` · concluído ${dataCurta(projeto.realEnd)}` : ''}
          </p>
          {projeto.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{projeto.description}</p> : null}
        </div>
        {gerencia ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn -fantasma" onClick={() => void abrirEdicao()}>Editar</button>
            {projeto.taskCount === 0 && projeto.ticketCount === 0 ? (
              <button type="button" className="btn -fantasma"
                onClick={() => { if (window.confirm(`Excluir "${projeto.name}"?`)) void agir(() => removerProjeto(id)).then((ok) => ok && navegar('/projetos')); }}>
                Excluir
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Andamento</div>
          <Progresso valor={projeto.percentDone} />
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Tarefas</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{projeto.taskCount - projeto.openTaskCount} de {projeto.taskCount}</div>
        </div>
        <div className="card" style={{ padding: 16 }}>
          <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Horas</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>
            {horas(projeto.tasks.reduce((s, t) => s + t.spentMinutes, 0))}
            <span className="suave" style={{ fontSize: 14, fontWeight: 400 }}> de {horas(projeto.tasks.reduce((s, t) => s + (t.plannedMinutes ?? 0), 0))} previstas</span>
          </div>
        </div>
        {projeto.totalCost !== null ? (
          <div className="card" style={{ padding: 16 }}>
            <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>Custo (chamados)</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>R$ {projeto.totalCost.replace('.', ',')}</div>
          </div>
        ) : null}
      </div>

      {edicao ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvarEdicao} noValidate>
          <h3>Editar projeto</h3>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-nome">Nome</label>
              <input id="ep-nome" className="input" value={edicao.name} onChange={(e) => setEdicao({ ...edicao, name: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-cod">Código</label>
              <input id="ep-cod" className="input mono" value={edicao.code} onChange={(e) => setEdicao({ ...edicao, code: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-sit">Situação</label>
              <select id="ep-sit" className="input" value={edicao.status} onChange={(e) => setEdicao({ ...edicao, status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{ROTULO_PROJETO_STATUS[s]}</option>)}
              </select></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-pri">Prioridade</label>
              <select id="ep-pri" className="input" value={edicao.priority} onChange={(e) => setEdicao({ ...edicao, priority: e.target.value })}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select></div>
          </div>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-resp">Responsável</label>
              <select id="ep-resp" className="input" value={edicao.managerId} onChange={(e) => setEdicao({ ...edicao, managerId: e.target.value })}>
                <option value="">—</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-time">Time</label>
              <select id="ep-time" className="input" value={edicao.teamId} onChange={(e) => setEdicao({ ...edicao, teamId: e.target.value })}>
                <option value="">—</option>{times.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-pai">Subprojeto de</label>
              <select id="ep-pai" className="input" value={edicao.parentId} onChange={(e) => setEdicao({ ...edicao, parentId: e.target.value })}>
                <option value="">—</option>{outros.map((p) => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>)}
              </select></div>
          </div>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-ini">Início previsto</label>
              <input id="ep-ini" className="input" type="date" value={edicao.plannedStart} onChange={(e) => setEdicao({ ...edicao, plannedStart: e.target.value })} /></div>
            <div className="campo"><label className="campo-rotulo" htmlFor="ep-fim">Fim previsto</label>
              <input id="ep-fim" className="input" type="date" value={edicao.plannedEnd} onChange={(e) => setEdicao({ ...edicao, plannedEnd: e.target.value })} /></div>
          </div>
          <div className="campo"><label className="campo-rotulo" htmlFor="ep-desc">Descrição</label>
            <textarea id="ep-desc" className="input" rows={3} value={edicao.description} onChange={(e) => setEdicao({ ...edicao, description: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario">Salvar</button>
            <button type="button" className="btn -fantasma" onClick={() => setEdicao(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {/* ---------------------------------------------------- Quadro */}
      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Quadro de tarefas</h3>
            <p className="card-sub">Cada um move as próprias tarefas; quem gerencia move todas.</p>
          </div>
          {gerencia ? <button type="button" className="btn -sm" onClick={() => { setTarefa(formTarefa(null)); void garantirPessoas(); }}>Nova tarefa</button> : null}
        </div>
        <div className="card-corpo pilha-sm">
          {tarefa ? (
            <form className="pilha-sm" onSubmit={salvarTarefa} noValidate style={{ borderBottom: '1px solid var(--borda, #ddd)', paddingBottom: 16 }}>
              <h4>{tarefa.id ? 'Editar tarefa' : 'Nova tarefa'}</h4>
              <div className="campo-grupo">
                <div className="campo"><label className="campo-rotulo" htmlFor="t-nome">Tarefa</label>
                  <input id="t-nome" className="input" value={tarefa.name} onChange={(e) => setTarefa({ ...tarefa, name: e.target.value })} /></div>
                <div className="campo"><label className="campo-rotulo" htmlFor="t-resp">Responsável</label>
                  <select id="t-resp" className="input" value={tarefa.assigneeId} onChange={(e) => setTarefa({ ...tarefa, assigneeId: e.target.value })}>
                    <option value="">—</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select></div>
                <div className="campo"><label className="campo-rotulo" htmlFor="t-sit">Situação</label>
                  <select id="t-sit" className="input" value={tarefa.status} onChange={(e) => setTarefa({ ...tarefa, status: e.target.value as ProjectTaskStatus })}>
                    {PROJECT_TASK_STATUSES.map((s) => <option key={s} value={s}>{ROTULO_TAREFA_PROJETO[s]}</option>)}
                  </select></div>
              </div>
              <div className="campo-grupo">
                <div className="campo"><label className="campo-rotulo" htmlFor="t-ini">Início</label>
                  <input id="t-ini" className="input" type="date" value={tarefa.plannedStart} onChange={(e) => setTarefa({ ...tarefa, plannedStart: e.target.value })} /></div>
                <div className="campo"><label className="campo-rotulo" htmlFor="t-fim">Fim</label>
                  <input id="t-fim" className="input" type="date" value={tarefa.plannedEnd} onChange={(e) => setTarefa({ ...tarefa, plannedEnd: e.target.value })} /></div>
                <div className="campo"><label className="campo-rotulo" htmlFor="t-horas">Horas previstas</label>
                  <input id="t-horas" className="input" inputMode="decimal" value={tarefa.plannedHours} onChange={(e) => setTarefa({ ...tarefa, plannedHours: e.target.value })} /></div>
                <div className="campo"><label className="campo-rotulo" htmlFor="t-dep">Depende de</label>
                  <select id="t-dep" className="input" value={tarefa.dependsOnId} onChange={(e) => setTarefa({ ...tarefa, dependsOnId: e.target.value })}>
                    <option value="">—</option>{projeto.tasks.filter((t) => t.id !== tarefa.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></div>
              </div>
              <div className="campo"><label className="campo-rotulo" htmlFor="t-desc">Descrição</label>
                <textarea id="t-desc" className="input" rows={2} value={tarefa.description} onChange={(e) => setTarefa({ ...tarefa, description: e.target.value })} /></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn -primario" disabled={!tarefa.name.trim()}>Salvar</button>
                <button type="button" className="btn -fantasma" onClick={() => setTarefa(null)}>Cancelar</button>
              </div>
            </form>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(200px, 1fr))', gap: 12, overflowX: 'auto' }}>
            {PROJECT_TASK_STATUSES.map((s) => (
              <div key={s} className="pilha-sm" style={{ background: 'var(--fundo-suave, #f8fafc)', borderRadius: 8, padding: 8, minHeight: 120 }}>
                <strong>{ROTULO_TAREFA_PROJETO[s]} <span className="suave">({colunas.get(s)!.length})</span></strong>
                {colunas.get(s)!.map((t) => (
                  <div key={t.id} className="card pilha-sm" style={{ padding: 10 }}>
                    <div><strong>{t.name}</strong></div>
                    <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
                      {t.assignee?.name ?? 'sem responsável'}
                      {t.plannedEnd ? ` · até ${dataCurta(t.plannedEnd)}` : ''}
                      {t.plannedMinutes ? ` · ${horas(t.spentMinutes)} de ${horas(t.plannedMinutes)}` : t.spentMinutes ? ` · ${horas(t.spentMinutes)}` : ''}
                    </div>
                    <Progresso valor={t.status === 'CONCLUIDA' ? 100 : t.percentDone} />
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {t.late ? <span className="selo -erro">Atrasada</span> : null}
                      {t.blockedByDependency ? <span className="selo -aviso" title={`Espera: ${t.dependsOn?.name}`}>Espera {t.dependsOn?.name}</span> : null}
                    </div>
                    {podeMexer(t) ? (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s !== 'A_FAZER' ? <button type="button" className="btn -fantasma -sm" onClick={() => mover(t, -1)} aria-label="Voltar uma coluna">←</button> : null}
                        {s !== 'CONCLUIDA' ? <button type="button" className="btn -fantasma -sm" onClick={() => mover(t, 1)} aria-label="Avançar uma coluna">→</button> : null}
                        <button type="button" className="btn -fantasma -sm" onClick={() => setApontando({ id: t.id, percent: String(t.percentDone), horas: '' })}>Apontar</button>
                        {gerencia ? <button type="button" className="btn -fantasma -sm" onClick={() => { setTarefa(formTarefa(t)); void garantirPessoas(); }}>Editar</button> : null}
                        {gerencia ? (
                          <button type="button" className="btn -fantasma -sm"
                            onClick={() => { if (window.confirm(`Excluir a tarefa "${t.name}"?`)) void agir(() => removerTarefaDeProjeto(id, t.id)); }}>
                            ×
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {apontando?.id === t.id ? (
                      <form style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const minutos = apontando.horas.trim() ? Math.round(Number(apontando.horas.replace(',', '.')) * 60) : 0;
                          void agir(() => editarTarefaDeProjeto(id, t.id, {
                            percentDone: Math.max(0, Math.min(100, Number(apontando.percent) || 0)),
                            ...(minutos > 0 ? { addSpentMinutes: minutos } : {}),
                          })).then((ok) => ok && setApontando(null));
                        }}>
                        <input className="input" style={{ width: 64 }} inputMode="numeric" aria-label="Percentual" value={apontando.percent}
                          onChange={(e) => setApontando({ ...apontando, percent: e.target.value })} />%
                        <input className="input" style={{ width: 72 }} inputMode="decimal" placeholder="+ horas" aria-label="Horas trabalhadas" value={apontando.horas}
                          onChange={(e) => setApontando({ ...apontando, horas: e.target.value })} />
                        <button type="submit" className="btn -sm">OK</button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <LinhaDoTempo tarefas={projeto.tasks} />

      {/* ---------------------------------------------------- Chamados */}
      <section className="card">
        <div className="card-topo">
          <div>
            <h3 className="card-titulo">Chamados do projeto</h3>
            <p className="card-sub">O custo do projeto soma os custos lançados neles.</p>
          </div>
        </div>
        <div className="card-corpo pilha-sm">
          {projeto.tickets.length === 0 ? <p className="campo-ajuda">Nenhum chamado vinculado (ou nenhum que você possa ver).</p> : (
            projeto.tickets.map((c) => (
              <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link to={`/chamados/${c.id}`}><span className="mono">#{c.number}</span> {c.subject}</Link>
                <span className="suave">{c.status}</span>
                {gerencia ? <button type="button" className="btn -fantasma -sm" onClick={() => void agir(() => desvincularChamadoDoProjeto(id, c.id))}>Tirar</button> : null}
              </div>
            ))
          )}
          {gerencia ? (
            <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => {
              e.preventDefault();
              const n = Number(numero.replace('#', ''));
              if (n > 0) void agir(() => vincularChamadoAoProjeto(id, n)).then((ok) => ok && setNumero(''));
            }}>
              <input className="input" style={{ maxWidth: 160 }} placeholder="Nº do chamado" value={numero} onChange={(e) => setNumero(e.target.value)} />
              <button type="submit" className="btn -sm" disabled={!numero.trim()}>Vincular</button>
            </form>
          ) : null}
        </div>
      </section>

      {projeto.children.length > 0 ? (
        <section className="card">
          <div className="card-topo"><div><h3 className="card-titulo">Subprojetos</h3></div></div>
          <div className="card-corpo pilha-sm">
            {projeto.children.map((p) => (
              <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 180px', gap: 12, alignItems: 'center' }}>
                <Link to={`/projetos/${p.id}`}>{p.code ? `${p.code} · ` : ''}{p.name}</Link>
                <SeloDoProjeto status={p.status} />
                <Progresso valor={p.percentDone} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Barras por tarefa entre o início mais cedo e o fim mais tarde. Sem biblioteca: é só proporção. */
function LinhaDoTempo({ tarefas }: { tarefas: TarefaDeProjetoView[] }) {
  const comDatas = tarefas.filter((t) => t.plannedStart || t.plannedEnd);
  if (comDatas.length === 0) return null;
  const ms = (s: string | null, reserva: string | null) => new Date((s ?? reserva)!).getTime();
  const inicio = Math.min(...comDatas.map((t) => ms(t.plannedStart, t.plannedEnd)));
  const fim = Math.max(...comDatas.map((t) => ms(t.plannedEnd, t.plannedStart))) + 24 * 3600 * 1000;
  const total = Math.max(fim - inicio, 1);
  const hoje = Date.now();

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Linha do tempo</h3>
          <p className="card-sub">{dataCurta(new Date(inicio).toISOString())} a {dataCurta(new Date(fim - 24 * 3600 * 1000).toISOString())}</p>
        </div>
      </div>
      <div className="card-corpo pilha-sm" style={{ position: 'relative' }}>
        {comDatas
          .slice()
          .sort((a, b) => ms(a.plannedStart, a.plannedEnd) - ms(b.plannedStart, b.plannedEnd))
          .map((t) => {
            const a = ms(t.plannedStart, t.plannedEnd);
            const b = ms(t.plannedEnd, t.plannedStart) + 24 * 3600 * 1000;
            const esquerda = ((a - inicio) / total) * 100;
            const largura = Math.max(((b - a) / total) * 100, 1);
            return (
              <div key={t.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 220px) 1fr', gap: 8, alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</span>
                <div style={{ position: 'relative', height: 14, background: 'var(--fundo-suave, #f1f5f9)', borderRadius: 4 }}>
                  <div
                    title={`${t.plannedStart ? dataCurta(t.plannedStart) : '?'} a ${t.plannedEnd ? dataCurta(t.plannedEnd) : '?'} · ${ROTULO_TAREFA_PROJETO[t.status]}`}
                    style={{
                      position: 'absolute',
                      left: `${esquerda}%`,
                      width: `${largura}%`,
                      top: 0,
                      bottom: 0,
                      borderRadius: 4,
                      background: t.status === 'CONCLUIDA' ? 'var(--sucesso, #16a34a)' : t.late ? 'var(--erro, #b42318)' : 'var(--primaria, #2563eb)',
                      opacity: t.status === 'CONCLUIDA' ? 0.6 : 1,
                    }}
                  />
                  {hoje >= inicio && hoje <= fim ? (
                    <div aria-hidden="true" style={{ position: 'absolute', left: `${((hoje - inicio) / total) * 100}%`, top: -2, bottom: -2, width: 2, background: 'var(--texto, #111)' }} />
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}
