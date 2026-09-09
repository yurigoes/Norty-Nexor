import { useState } from 'react';
import type { BulkAction, BulkResult } from '@norty-desk/shared';
import { ROTULO_STATUS, TICKET_STATUSES } from '@norty-desk/shared';

import { acaoEmLote } from '../../api/lote';
import { ErroDaApi } from '../../api/cliente';
import { listarTimes, type TimeView } from '../../api/endpoints';
import { useRecurso } from '../../auth/Autenticacao';

/**
 * A barra que aparece quando há chamados selecionados.
 *
 * Só aparece com seleção: uma barra permanente com "atribuir a…" vazio
 * é ruído em 95% das visitas à fila.
 */
export function BarraDeLote({
  selecionados,
  aoConcluir,
  aoLimpar,
}: {
  selecionados: string[];
  aoConcluir: () => void;
  aoLimpar: () => void;
}) {
  const { dado: times } = useRecurso(() => listarTimes().catch(() => [] as TimeView[]), []);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<BulkResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // O resultado sobrevive à limpeza da seleção. Sumir junto com ela
  // esconderia justamente o que interessa — quais itens falharam e por
  // quê —, que é a razão de o lote devolver item a item.
  if (selecionados.length === 0 && !resultado && !erro) return null;

  async function executar(acao: BulkAction) {
    setErro(null);
    setResultado(null);
    setOcupado(true);
    try {
      const r = await acaoEmLote(selecionados, acao);
      setResultado(r);
      aoConcluir();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível concluir o lote.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="pilha-sm">
      {selecionados.length > 0 ? (
      <div className="card">
        <div className="card-corpo linha" style={{ gap: 'var(--e-3)', flexWrap: 'wrap' }}>
          <strong>
            {selecionados.length} chamado{selecionados.length > 1 ? 's' : ''} selecionado
            {selecionados.length > 1 ? 's' : ''}
          </strong>

          <select
            className="select -auto"
            aria-label="Atribuir ao time"
            value=""
            disabled={ocupado}
            onChange={(e) => {
              if (e.target.value) void executar({ tipo: 'ATRIBUIR', teamId: e.target.value });
            }}
          >
            <option value="">Atribuir ao time…</option>
            {(times ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            className="select -auto"
            aria-label="Mudar status"
            value=""
            disabled={ocupado}
            onChange={(e) => {
              if (e.target.value) {
                void executar({
                  tipo: 'MUDAR_STATUS',
                  status: e.target.value as (typeof TICKET_STATUSES)[number],
                });
              }
            }}
          >
            <option value="">Mudar status para…</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s]}
              </option>
            ))}
          </select>

          <select
            className="select -auto"
            aria-label="Urgência"
            value=""
            disabled={ocupado}
            onChange={(e) => {
              if (e.target.value) {
                void executar({ tipo: 'CLASSIFICAR', urgency: Number(e.target.value) as 1 });
              }
            }}
          >
            <option value="">Urgência…</option>
            {[5, 4, 3, 2, 1].map((u) => (
              <option key={u} value={u}>
                Urgência {u}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="btn -fantasma -sm"
            style={{ marginLeft: 'auto' }}
            onClick={aoLimpar}
          >
            Limpar seleção
          </button>
        </div>
      </div>
      ) : null}

      {erro ? (
        <div className="alerta-bloco -erro">
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      {resultado ? (
        <div className={`alerta-bloco ${resultado.falhas === 0 ? '-sucesso' : '-aviso'}`}>
          <span aria-hidden="true">{resultado.falhas === 0 ? '✓' : '!'}</span>
          <span style={{ flex: 1 }}>
            {resultado.concluidos} de {resultado.total} concluído(s).
            {resultado.falhas > 0 ? (
              // O motivo por item: sem ele o agente teria de conferir os
              // quarenta à mão, e não vai conferir.
              <ul style={{ margin: 'var(--e-2) 0 0', paddingLeft: 'var(--e-5)' }}>
                {resultado.itens
                  .filter((i) => !i.ok)
                  .map((i) => (
                    <li key={i.ticketId}>
                      {i.number ? `#${i.number}` : i.ticketId.slice(0, 8)} — {i.motivo}
                    </li>
                  ))}
              </ul>
            ) : null}
          </span>
          <button
            type="button"
            className="btn-icone"
            aria-label="Dispensar resultado"
            onClick={() => setResultado(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
