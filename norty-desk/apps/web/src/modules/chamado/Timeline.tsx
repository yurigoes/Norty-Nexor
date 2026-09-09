import type { TicketEventView } from '@norty-desk/shared';

import { ROTULO_CANAL, ROTULO_STATUS, dataCurta } from '../../lib/formato';

/** Eventos que o sistema gera sozinho: registram, não interrompem. */
const TIPOS_DE_SISTEMA = new Set([
  'MUDANCA_STATUS',
  'MUDANCA_ATRIBUICAO',
  'MUDANCA_CLASSIFICACAO',
  'PAUSA_SLA',
  'RETOMADA_SLA',
]);

/**
 * A linha do tempo do chamado.
 *
 * No GLPI, montar esta lista exige `UNION` de quatro tabelas e
 * reconciliação em PHP. Aqui é um `SELECT ... ORDER BY createdAt`, e um
 * canal novo não pede tabela nova (`docs/02-gap-analysis.md`, item 4).
 */
export function Timeline({ eventos }: { eventos: TicketEventView[] }) {
  return (
    <div className="timeline">
      {eventos.map((evento) => {
        const ehSistema = TIPOS_DE_SISTEMA.has(evento.type);
        const ehInterno = evento.visibility === 'INTERNA';

        return (
          <article
            key={evento.id}
            className={[
              'evento',
              ehInterno ? 'evento--interno' : '',
              ehSistema ? 'evento--sistema' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <header className="evento__cabecalho">
              <span className={`canal canal--${evento.channel}`} />
              <span className="evento__autor">{evento.author?.name ?? 'Sistema'}</span>
              <span className="evento__separador">·</span>
              <span>{ROTULO_CANAL[evento.channel]}</span>
              <span className="evento__separador">·</span>
              <span className="numerico">{dataCurta(evento.createdAt)}</span>
              {ehInterno ? <span className="etiqueta etiqueta--aviso">Nota interna</span> : null}
            </header>

            <div className="evento__corpo">{corpoDoEvento(evento)}</div>

            {evento.attachments.length > 0 ? (
              <ul className="evento__anexos">
                {evento.attachments.map((anexo) => (
                  <li key={anexo.id} className="evento__anexo">
                    {anexo.filename}
                    <span className="evento__anexo-peso">
                      {Math.round(anexo.sizeBytes / 1024)} KB
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}

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
 * A caixa de resposta fica fixa no fim da timeline, com seletor de
 * visibilidade e de canal de saída. Omitir o canal responde por onde o
 * solicitante falou — é o que impede mandar e-mail para quem escreveu
 * pelo WhatsApp.
 */
function ComporResposta() {
  return (
    <form className="evento" onSubmit={(evento) => evento.preventDefault()}>
      <label className="so-leitor" htmlFor="corpo-resposta">
        Resposta
      </label>
      <textarea
        id="corpo-resposta"
        className="campo campo--area"
        placeholder="Escreva a resposta…"
      />

      <div className="responder__acoes">
        <select className="campo campo--estreito" aria-label="Visibilidade">
          <option value="PUBLICA">Resposta pública</option>
          <option value="INTERNA">Nota interna</option>
        </select>

        <select className="campo campo--estreito" aria-label="Canal de saída">
          <option value="">Canal de origem</option>
          <option value="EMAIL">E-mail</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>

        <button type="submit" className="botao botao--primario responder__enviar">
          Enviar
        </button>
      </div>
    </form>
  );
}
