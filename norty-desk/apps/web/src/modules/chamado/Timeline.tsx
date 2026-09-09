import type { TicketEventView } from '@norty-desk/shared';

import { ROTULO_CANAL, ROTULO_STATUS, dataCurta } from '../../lib/formato';

/**
 * A linha do tempo do chamado.
 *
 * No GLPI, montar esta lista exige `UNION` de quatro tabelas e
 * reconciliação em PHP. Aqui é um `SELECT ... ORDER BY createdAt`, e
 * um canal novo não pede tabela nova (`docs/02-gap-analysis.md`, item 4).
 */
export function Timeline({ eventos }: { eventos: TicketEventView[] }) {
  return (
    <div className="timeline">
      {eventos.map((evento) => (
        <article
          key={evento.id}
          className={`evento ${evento.visibility === 'INTERNA' ? 'evento--interno' : ''}`}
        >
          <header className="evento__cabecalho">
            <span className={`canal canal--${evento.channel}`} />
            <span className="evento__autor">{evento.author?.name ?? 'Sistema'}</span>
            <span>·</span>
            <span>{ROTULO_CANAL[evento.channel]}</span>
            <span>·</span>
            <span>{dataCurta(evento.createdAt)}</span>
            {evento.visibility === 'INTERNA' ? (
              <span className="etiqueta etiqueta--aviso">Nota interna</span>
            ) : null}
          </header>

          <div className="evento__corpo">{corpoDoEvento(evento)}</div>

          {evento.attachments.length > 0 ? (
            <ul style={{ margin: 'var(--space-3) 0 0', paddingLeft: 'var(--space-5)' }}>
              {evento.attachments.map((anexo) => (
                <li key={anexo.id} style={{ fontSize: 'var(--text-sm)' }}>
                  {anexo.filename}{' '}
                  <span style={{ color: 'var(--text-subtle)' }}>
                    ({Math.round(anexo.sizeBytes / 1024)} KB)
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}

      <ComporResposta />
    </div>
  );
}

/** Eventos de sistema não têm corpo: o texto vem do payload tipado. */
function corpoDoEvento(evento: TicketEventView): string {
  if (evento.body) return evento.body;

  const payload = evento.payload;
  if (payload?.type === 'MUDANCA_STATUS') {
    return `Status alterado de ${ROTULO_STATUS[payload.from]} para ${ROTULO_STATUS[payload.to]}.`;
  }
  if (payload?.type === 'PAUSA_SLA') return 'Chamado colocado em pendência. O SLA foi pausado.';
  if (payload?.type === 'RETOMADA_SLA') {
    return `Pendência encerrada. ${Math.round(payload.pausedSeconds / 60)} minutos descontados do prazo.`;
  }

  return '—';
}

/**
 * A caixa de resposta fica fixa no rodapé da timeline, com seletor de
 * visibilidade e de canal de saída. Omitir o canal responde por onde o
 * solicitante falou.
 */
function ComporResposta() {
  return (
    <form className="evento" onSubmit={(evento) => evento.preventDefault()}>
      <textarea
        className="campo"
        style={{ height: 'auto', minHeight: 88, padding: 'var(--space-3)', resize: 'vertical' }}
        placeholder="Escreva a resposta…"
        aria-label="Resposta"
      />
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          marginTop: 'var(--space-3)',
          alignItems: 'center',
        }}
      >
        <select className="campo" style={{ width: 160 }} aria-label="Visibilidade">
          <option value="PUBLICA">Resposta pública</option>
          <option value="INTERNA">Nota interna</option>
        </select>
        <select className="campo" style={{ width: 180 }} aria-label="Canal de saída">
          <option value="">Canal de origem</option>
          <option value="EMAIL">E-mail</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <button type="submit" className="botao botao--primario" style={{ marginLeft: 'auto' }}>
          Enviar
        </button>
      </div>
    </form>
  );
}
