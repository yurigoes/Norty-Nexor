import { useCallback, useEffect, useState } from 'react';
import type { TicketDetail, TicketTaskView } from '@norty-desk/shared';

import { listarPessoas, type PessoaView } from '../../api/aprovacoes';
import { ErroDaApi } from '../../api/cliente';
import { criarTarefa, editarTarefa, removerTarefa, tarefasDoChamado } from '../../api/tarefas';
import { useAutenticacao } from '../../auth/Autenticacao';
import { duracaoCurta } from '../../lib/formato';
import { EscolherModelo } from '../modelo/EscolherModelo';

/**
 * As tarefas do chamado.
 *
 * Cada uma é um evento `TAREFA` da linha do tempo, sempre interna:
 * "conferir o log do servidor" é organização do atendimento, não
 * conversa com quem pediu. O total apontado é a soma delas, e é ele que
 * aparece no trilho do chamado.
 */
export function Tarefas({ chamado, aoMudar }: { chamado: TicketDetail; aoMudar: () => void }) {
  const { can } = useAutenticacao();
  const [tarefas, setTarefas] = useState<TicketTaskView[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaView[]>([]);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setTarefas(await tarefasDoChamado(chamado.id));
  }, [chamado.id]);

  useEffect(() => {
    void recarregar().catch(() => setTarefas([]));
  }, [recarregar]);

  useEffect(() => {
    if (!can('tarefa:criar')) return;
    void listarPessoas()
      .then(setPessoas)
      .catch(() => undefined);
  }, [can]);

  if (!tarefas) return null;

  const podeCriar = can('tarefa:criar') && chamado.status !== 'FECHADO';
  if (tarefas.length === 0 && !podeCriar) return null;

  const feitas = tarefas.filter((t) => t.done).length;
  const total = tarefas.reduce((soma, t) => soma + t.spentSeconds, 0);

  async function agir<T>(acao: () => Promise<T>) {
    setErro(null);
    try {
      await acao();
      await recarregar();
      // O tempo do chamado mudou: o trilho mostra a soma.
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível salvar a tarefa.');
    }
  }

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h3 className="card-titulo">Tarefas</h3>
          <p className="card-sub">
            {tarefas.length === 0
              ? 'O que precisa ser feito neste chamado. Sempre interno.'
              : `${feitas} de ${tarefas.length} concluída(s)${
                  total > 0 ? ` · ${duracaoCurta(total)} apontados` : ''
                }.`}
          </p>
        </div>
        {podeCriar && !abrindo ? (
          <button type="button" className="btn -secundario -sm" onClick={() => setAbrindo(true)}>
            Nova tarefa
          </button>
        ) : null}
      </div>

      {erro ? (
        <div className="card-corpo">
          <div className="alerta-bloco -erro">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        </div>
      ) : null}

      {tarefas.length > 0 ? (
        <div className="card-corpo pilha-sm">
          {tarefas.map((tarefa) => (
            <Linha
              key={tarefa.id}
              tarefa={tarefa}
              podeMexer={can('tarefa:concluir') && chamado.status !== 'FECHADO'}
              podeApagar={podeCriar}
              aoConcluir={(done) =>
                agir(() => editarTarefa(chamado.id, tarefa.id, { done }))
              }
              aoApontar={(segundos) =>
                agir(() => editarTarefa(chamado.id, tarefa.id, { addSpentSeconds: segundos }))
              }
              aoApagar={() => agir(() => removerTarefa(chamado.id, tarefa.id))}
            />
          ))}
        </div>
      ) : null}

      {abrindo ? (
        <Nova
          chamado={chamado}
          pessoas={pessoas}
          aoCancelar={() => setAbrindo(false)}
          aoCriar={async (dados) => {
            await agir(() => criarTarefa(chamado.id, dados));
            setAbrindo(false);
          }}
        />
      ) : null}
    </section>
  );
}

function Linha({
  tarefa,
  podeMexer,
  podeApagar,
  aoConcluir,
  aoApontar,
  aoApagar,
}: {
  tarefa: TicketTaskView;
  podeMexer: boolean;
  podeApagar: boolean;
  aoConcluir: (done: boolean) => void;
  aoApontar: (segundos: number) => void;
  aoApagar: () => void;
}) {
  const [minutos, setMinutos] = useState('');

  return (
    <div className="pilha-sm" style={{ opacity: tarefa.done ? 0.6 : 1 }}>
      <div className="linha-entre" style={{ gap: 'var(--e-3)' }}>
        <label className="check" style={{ minWidth: 0, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={tarefa.done}
            disabled={!podeMexer}
            onChange={(e) => aoConcluir(e.target.checked)}
          />
          <span style={{ textDecoration: tarefa.done ? 'line-through' : undefined }}>
            {tarefa.body}
          </span>
        </label>

        <span className="linha" style={{ gap: 'var(--e-2)', flex: 'none' }}>
          {tarefa.spentSeconds > 0 ? (
            <span className="selo -neutro">{duracaoCurta(tarefa.spentSeconds)}</span>
          ) : null}
          {podeApagar ? (
            <button
              type="button"
              className="btn-icone"
              aria-label="Apagar tarefa"
              onClick={aoApagar}
            >
              ×
            </button>
          ) : null}
        </span>
      </div>

      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <span className="campo-ajuda">
          {tarefa.assignee ? `Para ${tarefa.assignee.name}` : 'Sem responsável'}
          {tarefa.author ? ` · por ${tarefa.author.name}` : ''}
        </span>

        {podeMexer && !tarefa.done ? (
          <span className="linha" style={{ gap: 'var(--e-1)' }}>
            <label className="so-leitor" htmlFor={`apontar-${tarefa.id}`}>
              Minutos a apontar
            </label>
            <input
              id={`apontar-${tarefa.id}`}
              className="input"
              style={{ width: 84 }}
              type="number"
              min={1}
              max={1440}
              placeholder="min"
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
            />
            <button
              type="button"
              className="btn -secundario -sm"
              disabled={!minutos || Number(minutos) <= 0}
              onClick={() => {
                aoApontar(Number(minutos) * 60);
                setMinutos('');
              }}
            >
              Apontar
            </button>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Nova({
  chamado,
  pessoas,
  aoCancelar,
  aoCriar,
}: {
  chamado: TicketDetail;
  pessoas: PessoaView[];
  aoCancelar: () => void;
  aoCriar: (dados: {
    body: string;
    assigneeId?: string | null;
    spentSeconds?: number;
  }) => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [minutos, setMinutos] = useState('');
  const [ocupado, setOcupado] = useState(false);

  return (
    <form
      className="card-rodape pilha-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setOcupado(true);
        void aoCriar({
          body: body.trim(),
          assigneeId: assigneeId || null,
          ...(minutos ? { spentSeconds: Number(minutos) * 60 } : {}),
        }).finally(() => setOcupado(false));
      }}
    >
      <label className="so-leitor" htmlFor="nova-tarefa">
        O que precisa ser feito
      </label>
      <textarea
        id="nova-tarefa"
        className="textarea"
        rows={2}
        required
        placeholder="O que precisa ser feito."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
        <EscolherModelo
          chamado={chamado}
          kind="TAREFA"
          rotulo="Modelo de tarefa"
          aoEscolher={(texto) => setBody((atual) => (atual.trim() ? atual : texto))}
        />

        <label className="so-leitor" htmlFor="responsavel-tarefa">
          Responsável
        </label>
        <select
          id="responsavel-tarefa"
          className="select -auto"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">Sem responsável</option>
          {pessoas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <label className="so-leitor" htmlFor="tempo-nova-tarefa">
          Minutos já gastos
        </label>
        <input
          id="tempo-nova-tarefa"
          className="input"
          style={{ width: 110 }}
          type="number"
          min={0}
          max={1440}
          placeholder="min gastos"
          value={minutos}
          onChange={(e) => setMinutos(e.target.value)}
        />

        <span style={{ marginLeft: 'auto' }} className="linha">
          <button type="button" className="btn -fantasma -sm" onClick={aoCancelar}>
            Cancelar
          </button>
          <button type="submit" className="btn -primario -sm" disabled={ocupado || !body.trim()}>
            Criar tarefa
          </button>
        </span>
      </div>
    </form>
  );
}
