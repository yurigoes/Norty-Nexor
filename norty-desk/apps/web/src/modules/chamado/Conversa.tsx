import { useState } from 'react';
import type { TicketEventView } from '@norty-desk/shared';

import {
  ROTULO_CANAL,
  ROTULO_STATUS,
  dataCurta,
  iniciais,
  modificadorCanal,
} from '../../lib/formato';

/** Eventos que o sistema gera sozinho: registram, não interrompem. */
const TIPOS_DE_SISTEMA = new Set([
  'MUDANCA_STATUS',
  'MUDANCA_ATRIBUICAO',
  'MUDANCA_CLASSIFICACAO',
  'PAUSA_SLA',
  'RETOMADA_SLA',
]);

/**
 * A conversa do chamado.
 *
 * Nome escolhido com cuidado: `.timeline` no sistema do LICITA+ é a
 * linha de etapas com ponto e conector — no Desk ela serve à aprovação
 * em etapas. A conversa é outra coisa e tem componente próprio.
 *
 * No GLPI, montar esta lista exige `UNION` de quatro tabelas e
 * reconciliação em PHP. Aqui é um `SELECT ... ORDER BY createdAt`, e um
 * canal novo não pede tabela nova (`docs/02-gap-analysis.md`, item 4).
 */
export function Conversa({ eventos }: { eventos: TicketEventView[] }) {
  return (
    <div className="conversa">
      {eventos.map((evento) => {
        const ehSistema = TIPOS_DE_SISTEMA.has(evento.type);
        const ehInterna = evento.visibility === 'INTERNA';
        const autor = evento.author?.name ?? 'Sistema';

        return (
          <article
            key={evento.id}
            className={[
              'conversa-evento',
              ehInterna ? '-interna' : '',
              ehSistema ? '-sistema' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <header className="conversa-topo">
              {!ehSistema ? (
                <span
                  className={`avatar -sm ${evento.author?.kind === 'CONTACT' ? '-externo' : ''}`}
                  aria-hidden="true"
                >
                  {iniciais(autor)}
                </span>
              ) : null}

              <span className={`canal ${modificadorCanal(evento.channel)}`} />
              <span className="conversa-autor">{autor}</span>
              <span className="conversa-sep">·</span>
              <span>{ROTULO_CANAL[evento.channel]}</span>
              <span className="conversa-sep">·</span>
              <span className="num">{dataCurta(evento.createdAt)}</span>

              {ehInterna ? <span className="selo -aviso">Nota interna</span> : null}
            </header>

            <p className="conversa-corpo">{corpoDoEvento(evento)}</p>

            {evento.attachments.length > 0 ? (
              <div className="conversa-anexos">
                {evento.attachments.map((anexo) => (
                  <a key={anexo.id} href="#anexo" className="conversa-anexo">
                    <span aria-hidden="true">📎</span>
                    {anexo.filename}
                    <span className="conversa-anexo-peso">
                      {Math.round(anexo.sizeBytes / 1024)} KB
                    </span>
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}

      <Responder />
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
 * A caixa de resposta.
 *
 * Dois seletores e uma regra: omitir o canal responde por onde o
 * solicitante falou — é o que impede mandar e-mail para quem escreveu
 * pelo WhatsApp.
 *
 * Ao marcar "nota interna" a caixa inteira muda de cor. O aviso chega
 * antes de o dedo alcançar o botão de enviar, e não depois.
 */
function Responder() {
  const [interna, setInterna] = useState(false);

  return (
    <form
      className={`responder ${interna ? '-interna' : ''}`}
      onSubmit={(evento) => evento.preventDefault()}
    >
      <label className="so-leitor" htmlFor="corpo-resposta">
        Resposta
      </label>
      <textarea
        id="corpo-resposta"
        className="textarea"
        placeholder={interna ? 'Nota visível só para a equipe…' : 'Escreva a resposta…'}
      />

      <div className="responder-acoes">
        <label className="so-leitor" htmlFor="visibilidade">
          Visibilidade
        </label>
        <select
          id="visibilidade"
          className="select -auto"
          value={interna ? 'INTERNA' : 'PUBLICA'}
          onChange={(evento) => setInterna(evento.target.value === 'INTERNA')}
        >
          <option value="PUBLICA">Resposta pública</option>
          <option value="INTERNA">Nota interna</option>
        </select>

        <label className="so-leitor" htmlFor="canal-saida">
          Canal de saída
        </label>
        <select id="canal-saida" className="select -auto" disabled={interna}>
          <option value="">Canal de origem</option>
          <option value="EMAIL">E-mail</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>

        <button type="submit" className="btn -primario responder-enviar">
          {interna ? 'Salvar nota' : 'Enviar resposta'}
        </button>
      </div>
    </form>
  );
}
