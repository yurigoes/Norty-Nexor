import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { AgendaItem } from '@norty-desk/shared';

import { criarEvento, editarEvento, listarAgenda, removerEvento } from '../../api/agenda';
import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { listarTimes } from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';

const DIA = 24 * 3600 * 1000;
const NOMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Segunda-feira 00:00 (hora local) da semana da data. */
function inicioDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dia = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dia);
  return x;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const diaMes = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const paraInputData = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const CLASSE: Record<AgendaItem['kind'], string> = {
  EVENTO: '-info',
  TAREFA_CHAMADO: '-aviso',
  TAREFA_PROJETO: '-contorno',
};
const ROTULO: Record<AgendaItem['kind'], string> = {
  EVENTO: 'Compromisso',
  TAREFA_CHAMADO: 'Tarefa de chamado',
  TAREFA_PROJETO: 'Tarefa de projeto',
};

type Visao = { tipo: 'eu' } | { tipo: 'pessoa'; id: string } | { tipo: 'time'; id: string };

type FormEvento = {
  id: string | null;
  title: string;
  date: string;
  start: string;
  end: string;
  allDay: boolean;
  isPrivate: boolean;
  location: string;
  description: string;
  ownerId: string;
};

/**
 * A semana de uma pessoa ou de um time: compromissos, tarefas de chamado
 * agendadas e tarefas de projeto, num lugar só. Nada é copiado — as
 * tarefas aparecem pelas próprias datas.
 */
export function Agenda() {
  const { perfil } = useAutenticacao();
  const eu = perfil?.user.id ?? '';
  const [semana, setSemana] = useState(() => inicioDaSemana(new Date()));
  const [visao, setVisao] = useState<Visao>({ tipo: 'eu' });
  const [itens, setItens] = useState<AgendaItem[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [times, setTimes] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<FormEvento | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const fimDaSemana = useMemo(() => new Date(semana.getTime() + 7 * DIA), [semana]);

  const carregar = useCallback(async () => {
    setItens(
      await listarAgenda({
        from: semana.toISOString(),
        to: fimDaSemana.toISOString(),
        ...(visao.tipo === 'pessoa' ? { userIds: [visao.id] } : {}),
        ...(visao.tipo === 'time' ? { teamId: visao.id } : {}),
      }),
    );
  }, [semana, fimDaSemana, visao]);

  useEffect(() => {
    setItens(null);
    void carregar().catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível carregar a agenda.'));
  }, [carregar]);

  useEffect(() => {
    void listarPessoas().then(setPessoas).catch(() => undefined);
    void listarTimes().then((t) => setTimes(t as { id: string; name: string }[])).catch(() => undefined);
  }, []);

  const dias = Array.from({ length: 7 }, (_, i) => new Date(semana.getTime() + i * DIA));
  const doDia = (d: Date) => {
    const a = d.getTime();
    const b = a + DIA;
    return (itens ?? []).filter((i) => new Date(i.start).getTime() < b && new Date(i.end).getTime() >= a);
  };
  const variasPessoas = visao.tipo === 'time';

  function novo(d: Date) {
    setErro(null);
    setForm({
      id: null,
      title: '',
      date: paraInputData(d),
      start: '09:00',
      end: '10:00',
      allDay: false,
      isPrivate: false,
      location: '',
      description: '',
      ownerId: visao.tipo === 'pessoa' ? visao.id : eu,
    });
  }

  function abrir(i: AgendaItem) {
    if (i.kind !== 'EVENTO' || !i.editable) return;
    const ini = new Date(i.start);
    const fim = new Date(i.end);
    setForm({
      id: i.id,
      title: i.title,
      date: paraInputData(ini),
      start: ini.toTimeString().slice(0, 5),
      end: fim.toTimeString().slice(0, 5),
      allDay: i.allDay,
      isPrivate: i.private,
      location: i.location ?? '',
      description: i.description ?? '',
      ownerId: i.user?.id ?? eu,
    });
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!form) return;
    const [ano, mes, dia] = form.date.split('-').map(Number);
    const hora = (t: string) => t.split(':').map(Number) as [number, number];
    const [hi, mi] = form.allDay ? [0, 0] : hora(form.start);
    const [hf, mf] = form.allDay ? [23, 59] : hora(form.end);
    const inicio = new Date(ano!, mes! - 1, dia!, hi, mi);
    const fim = new Date(ano!, mes! - 1, dia!, hf, mf);
    const dados = {
      title: form.title.trim(),
      startsAt: inicio.toISOString(),
      endsAt: fim.toISOString(),
      allDay: form.allDay,
      isPrivate: form.isPrivate,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
    };
    setErro(null);
    try {
      if (form.id) await editarEvento(form.id, dados);
      else await criarEvento({ ...dados, ...(form.ownerId && form.ownerId !== eu ? { ownerId: form.ownerId } : {}) });
      setForm(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar.');
    }
  }

  return (
    <div className="pilha" style={{ maxWidth: 1300 }}>
      <div className="cabecalho-secao">
        <div>
          <h2 className="titulo-seccao">Agenda</h2>
          <p>Compromissos, tarefas de chamado e de projeto com data — da pessoa ou do time.</p>
        </div>
        <button type="button" className="btn -primario" onClick={() => novo(new Date())}>Novo compromisso</button>
      </div>

      {erro ? <div className="alerta-bloco -erro" role="alert"><span aria-hidden="true">!</span><span>{erro}</span></div> : null}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn -fantasma -sm" onClick={() => setSemana(new Date(semana.getTime() - 7 * DIA))} aria-label="Semana anterior">←</button>
        <button type="button" className="btn -fantasma -sm" onClick={() => setSemana(inicioDaSemana(new Date()))}>Hoje</button>
        <button type="button" className="btn -fantasma -sm" onClick={() => setSemana(new Date(semana.getTime() + 7 * DIA))} aria-label="Próxima semana">→</button>
        <strong>{diaMes(semana)} a {diaMes(new Date(fimDaSemana.getTime() - DIA))}</strong>
        <select
          className="input"
          style={{ maxWidth: 260, marginLeft: 'auto' }}
          value={visao.tipo === 'eu' ? 'eu' : `${visao.tipo}:${visao.id}`}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'eu') setVisao({ tipo: 'eu' });
            else {
              const [tipo, id] = v.split(':');
              setVisao({ tipo: tipo as 'pessoa' | 'time', id: id! });
            }
          }}
        >
          <option value="eu">Minha agenda</option>
          {times.length ? <optgroup label="Times">{times.map((t) => <option key={t.id} value={`time:${t.id}`}>{t.name}</option>)}</optgroup> : null}
          <optgroup label="Pessoas">{pessoas.filter((p) => p.id !== eu).map((p) => <option key={p.id} value={`pessoa:${p.id}`}>{p.name}</option>)}</optgroup>
        </select>
      </div>

      {form ? (
        <form className="card pilha-sm" style={{ padding: 16 }} onSubmit={salvar} noValidate>
          <h3>{form.id ? 'Editar compromisso' : 'Novo compromisso'}</h3>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="ev-tit">Título</label>
              <input id="ev-tit" className="input" value={form.title} placeholder="Visita técnica na filial" onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            {!form.id ? (
              <div className="campo"><label className="campo-rotulo" htmlFor="ev-dono">De quem</label>
                <select id="ev-dono" className="input" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                  <option value={eu}>Meu</option>
                  {pessoas.filter((p) => p.id !== eu).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></div>
            ) : null}
          </div>
          <div className="campo-grupo">
            <div className="campo"><label className="campo-rotulo" htmlFor="ev-dia">Dia</label>
              <input id="ev-dia" className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            {!form.allDay ? (
              <>
                <div className="campo"><label className="campo-rotulo" htmlFor="ev-ini">Das</label>
                  <input id="ev-ini" className="input" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
                <div className="campo"><label className="campo-rotulo" htmlFor="ev-fim">Até</label>
                  <input id="ev-fim" className="input" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
              </>
            ) : null}
            <div className="campo"><label className="campo-rotulo" htmlFor="ev-local">Local</label>
              <input id="ev-local" className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> Dia inteiro
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={form.isPrivate} onChange={(e) => setForm({ ...form, isPrivate: e.target.checked })} /> Privado (os outros veem só "Ocupado")
            </label>
          </div>
          <div className="campo"><label className="campo-rotulo" htmlFor="ev-desc">Detalhes</label>
            <textarea id="ev-desc" className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn -primario" disabled={!form.title.trim()}>Salvar</button>
            {form.id ? (
              <button type="button" className="btn -fantasma"
                onClick={() => { if (window.confirm('Excluir este compromisso?')) void removerEvento(form.id!).then(() => { setForm(null); return carregar(); }).catch((e) => setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível excluir.')); }}>
                Excluir
              </button>
            ) : null}
            <button type="button" className="btn -fantasma" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      ) : null}

      {!itens ? (
        <div className="sk sk-bloco" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))', gap: 8, overflowX: 'auto' }}>
          {dias.map((d, i) => {
            const hoje = paraInputData(d) === paraInputData(new Date());
            return (
              <div key={i} className="pilha-sm" style={{ background: 'var(--fundo-suave, #f8fafc)', borderRadius: 8, padding: 8, minHeight: 180, outline: hoje ? '2px solid var(--primaria, #2563eb)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{NOMES[i]} {diaMes(d)}</strong>
                  <button type="button" className="btn -fantasma -sm" onClick={() => novo(d)} aria-label={`Novo compromisso em ${diaMes(d)}`}>+</button>
                </div>
                {doDia(d).map((it) => (
                  <div
                    key={`${it.kind}-${it.id}`}
                    className="card"
                    style={{ padding: 8, cursor: it.editable ? 'pointer' : undefined, opacity: it.done ? 0.55 : 1 }}
                    onClick={() => abrir(it)}
                  >
                    <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>
                      {it.allDay ? 'Dia inteiro' : `${hhmm(it.start)}–${hhmm(it.end)}`}
                      {variasPessoas && it.user ? ` · ${it.user.name}` : ''}
                    </div>
                    <div style={{ textDecoration: it.done ? 'line-through' : undefined }}>
                      {it.link && !it.private ? <Link to={it.link} onClick={(e) => e.stopPropagation()}>{it.title}</Link> : it.title}
                    </div>
                    {it.location ? <div className="suave" style={{ fontSize: 'var(--t-corpo-sm)' }}>{it.location}</div> : null}
                    <span className={`selo ${CLASSE[it.kind]}`} style={{ fontSize: 11 }}>{ROTULO[it.kind]}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
