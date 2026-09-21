import { useCallback, useEffect, useState } from 'react';
import {
  DURACAO_MINIMA_MINUTOS,
  agendamentoInvalido,
  type AppointmentView,
  type TicketDetail,
} from '@norty-desk/shared';

import { ErroDaApi } from '../../api/cliente';
import {
  cancelarAtendimento,
  concluirAtendimento,
  listarAgendamentos,
  marcarAtendimento,
} from '../../api/endpoints';
import { useAutenticacao } from '../../auth/Autenticacao';

const DURACOES = [30, 60, 90, 120, 180, 240];

/**
 * O atendimento marcado.
 *
 * A frase que importa nesta tela é a que explica o efeito no prazo:
 * marcar visita **pode** esticar o prazo do chamado, e pode não
 * esticar nada — se a data cabe no prazo que já existe, nada muda. Sem
 * dizer isso, quem marca não sabe o que acabou de fazer com o
 * indicador, e é assim que um indicador de SLA perde o sentido.
 */
export function Agendamento({
  chamado,
  aoMudar,
}: {
  chamado: TicketDetail;
  aoMudar: () => void;
}) {
  const { can } = useAutenticacao();
  const [agendamentos, setAgendamentos] = useState<AppointmentView[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [quando, setQuando] = useState('');
  const [duracao, setDuracao] = useState(60);
  const [nota, setNota] = useState('');

  const recarregar = useCallback(async () => {
    setAgendamentos(await listarAgendamentos(chamado.id));
  }, [chamado.id]);

  useEffect(() => {
    if (!can('chamado:ler:proprios')) return;
    void recarregar().catch(() => setAgendamentos([]));
  }, [recarregar, can]);

  if (!agendamentos) return null;

  const podeAgendar = can('chamado:agendar') && chamado.status !== 'FECHADO';
  const marcado = agendamentos.find((a) => a.status === 'AGENDADO') ?? null;
  const anteriores = agendamentos.filter((a) => a.status !== 'AGENDADO');

  if (agendamentos.length === 0 && !podeAgendar) return null;

  async function tentar(acao: () => Promise<unknown>) {
    setErro(null);
    try {
      await acao();
      await recarregar();
      aoMudar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir a ação.');
    }
  }

  // A mesma função que a API usa: a tela não reimplementa a regra
  // (CLAUDE.md, regra 1). `datetime-local` vem sem fuso, e o navegador
  // o interpreta como hora local — que é o que a pessoa digitou.
  const problema = quando ? agendamentoInvalido(new Date(quando), duracao) : null;

  return (
    <section className="card">
      <div className="card-topo">
        <div>
          <h2 className="card-titulo">Atendimento agendado</h2>
          <p className="card-sub">Data marcada com o cliente para ir até lá.</p>
        </div>
      </div>

      <div className="card-corpo pilha">
        {erro ? (
          <div className="alerta-bloco -erro" role="status">
            <span aria-hidden="true">!</span>
            <span>{erro}</span>
          </div>
        ) : null}

        {marcado ? (
          <div className="pilha-sm">
            <p>
              <strong>{dataHora(marcado.scheduledFor)}</strong> · {marcado.durationMinutes} min
              {marcado.technician ? ` · ${marcado.technician.name}` : ''}
            </p>

            <p className="campo-ajuda">
              {marcado.postponedSeconds > 0
                ? `O prazo de resolução andou ${horas(marcado.postponedSeconds)} úteis por causa desta data.`
                : 'A visita cabe no prazo atual — o prazo não mudou.'}
            </p>

            {marcado.note ? <p className="campo-ajuda">{marcado.note}</p> : null}

            {podeAgendar ? (
              <div className="linha" style={{ gap: 'var(--e-2)', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn -secundario -sm"
                  onClick={() => void tentar(() => concluirAtendimento(marcado.id))}
                >
                  Marcar como realizado
                </button>
                <button
                  type="button"
                  className="btn -fantasma -sm"
                  onClick={() => void tentar(() => cancelarAtendimento(marcado.id))}
                >
                  Cancelar visita
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="campo-ajuda">Nenhum atendimento marcado.</p>
        )}

        {podeAgendar ? (
          <form
            className="pilha-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!quando || problema) return;
              const iso = new Date(quando).toISOString();
              setQuando('');
              setNota('');
              void tentar(() =>
                marcarAtendimento(chamado.id, {
                  scheduledFor: iso,
                  durationMinutes: duracao,
                  note: nota.trim() || undefined,
                }),
              );
            }}
          >
            <div className="campo-grupo">
              <div className="campo">
                <label className="campo-rotulo" htmlFor="quando">
                  {marcado ? 'Remarcar para' : 'Marcar para'}
                </label>
                <input
                  id="quando"
                  type="datetime-local"
                  className="input"
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                />
              </div>

              <div className="campo">
                <label className="campo-rotulo" htmlFor="duracao">
                  Duração
                </label>
                <select
                  id="duracao"
                  className="select"
                  value={duracao}
                  onChange={(e) => setDuracao(Number(e.target.value))}
                >
                  {DURACOES.map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} minutos` : `${m / 60} h`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="campo">
              <label className="campo-rotulo" htmlFor="nota-agenda">
                Observação (opcional)
              </label>
              <input
                id="nota-agenda"
                className="input"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Falar com a recepção na chegada"
                maxLength={500}
              />
            </div>

            {problema ? <p className="campo-erro">{problema}</p> : null}

            <p className="campo-ajuda">
              Marcar uma visita para depois do prazo estica o prazo de resolução até o fim dela,
              e o quanto esticou fica registrado à parte — o indicador continua sabendo dizer
              por quê. Duração mínima de {DURACAO_MINIMA_MINUTOS} minutos.
            </p>

            <button type="submit" className="btn -primario" disabled={!quando || Boolean(problema)}>
              {marcado ? 'Remarcar' : 'Marcar atendimento'}
            </button>
          </form>
        ) : null}

        {anteriores.length > 0 ? (
          <details>
            <summary className="campo-ajuda">
              {anteriores.length} {anteriores.length === 1 ? 'visita anterior' : 'visitas anteriores'}
            </summary>
            <ul className="pilha-sm" style={{ listStyle: 'none', padding: 0, marginTop: 'var(--e-2)' }}>
              {anteriores.map((a) => (
                <li key={a.id} className="campo-ajuda">
                  {dataHora(a.scheduledFor)} ·{' '}
                  {a.status === 'REALIZADO' ? 'realizada' : 'cancelada'}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Horas úteis com uma casa, que é a precisão que a frase suporta. */
function horas(segundos: number): string {
  return `${Math.round(segundos / 360) / 10} h`;
}
