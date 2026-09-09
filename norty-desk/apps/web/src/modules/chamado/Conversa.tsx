import { useRef, useState, type FormEvent } from 'react';
import type { TicketDetail, TicketEventView } from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';
import { useAutenticacao, useRecurso } from '../../auth/Autenticacao';
import { ROTULO_CANAL, ROTULO_STATUS, dataCurta, iniciais, modificadorCanal } from '../../lib/formato';

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
 * `.timeline` no sistema é a linha de etapas com ponto e conector — no
 * Desk ela serve à aprovação. A linha do tempo do chamado é isto, e tem
 * componente próprio (`docs/08-design.md`, seção 5).
 */
export function Conversa({
  chamado,
  aoMudar,
  somenteLeitura = false,
}: {
  chamado: TicketDetail;
  aoMudar: () => void;
  somenteLeitura?: boolean;
}) {
  const { dado: eventos, carregando } = useRecurso(
    () => api.eventosDoChamado(chamado.id),
    [chamado.id],
  );

  return (
    <div className="conversa">
      <article className="conversa-evento">
        <header className="conversa-topo">
          <span className={`canal ${modificadorCanal(chamado.originChannel)}`} />
          <span className="conversa-autor">{chamado.requester?.name ?? 'Solicitante'}</span>
          <span className="conversa-sep">·</span>
          <span>abertura</span>
          <span className="conversa-sep">·</span>
          <span className="num">{dataCurta(chamado.createdAt)}</span>
        </header>
        <p className="conversa-corpo">{chamado.description}</p>
      </article>

      {carregando ? <div className="sk sk-bloco" /> : null}

      {(eventos ?? []).map((evento) => (
        <Evento key={evento.id} evento={evento} />
      ))}

      {somenteLeitura || chamado.status === 'FECHADO' ? (
        chamado.status === 'FECHADO' ? (
          <div className="alerta-bloco -info">
            <span aria-hidden="true">i</span>
            <span>Chamado fechado. Reabra para voltar a escrever.</span>
          </div>
        ) : null
      ) : (
        <Responder chamado={chamado} aoEnviar={aoMudar} />
      )}
    </div>
  );
}

function Evento({ evento }: { evento: TicketEventView }) {
  const ehSistema = TIPOS_DE_SISTEMA.has(evento.type);
  const ehInterna = evento.visibility === 'INTERNA';
  const autor = evento.author?.name ?? 'Sistema';

  return (
    <article
      className={['conversa-evento', ehInterna ? '-interna' : '', ehSistema ? '-sistema' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <header className="conversa-topo">
        {!ehSistema ? (
          <span className="avatar -sm" aria-hidden="true">
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
            <a
              key={anexo.id}
              className="conversa-anexo"
              href={api.urlDoAnexo(anexo.id)}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden="true">📎</span>
              {anexo.filename}
              <span className="conversa-anexo-peso">{Math.round(anexo.sizeBytes / 1024)} KB</span>
            </a>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function corpoDoEvento(evento: TicketEventView): string {
  if (evento.body) return evento.body;

  const payload = evento.payload;
  if (payload?.type === 'MUDANCA_STATUS') {
    return `Status alterado de ${ROTULO_STATUS[payload.from]} para ${ROTULO_STATUS[payload.to]}.`;
  }
  if (payload?.type === 'MUDANCA_ATRIBUICAO') return 'Atribuição alterada.';
  if (payload?.type === 'MUDANCA_CLASSIFICACAO') return 'Classificação alterada.';
  if (payload?.type === 'PAUSA_SLA') return 'Chamado em pendência. O SLA foi pausado.';
  if (payload?.type === 'RETOMADA_SLA') {
    return `Pendência encerrada. ${Math.round(payload.pausedSeconds / 60)} minutos descontados do prazo.`;
  }
  return '—';
}

/**
 * A caixa de resposta.
 *
 * Ao marcar nota interna, a caixa inteira muda de cor e o seletor de
 * canal é desabilitado: o aviso chega antes de o dedo alcançar o enviar,
 * e não depois.
 */
function Responder({ chamado, aoEnviar }: { chamado: TicketDetail; aoEnviar: () => void }) {
  const { can } = useAutenticacao();
  const [corpo, setCorpo] = useState('');
  const [interna, setInterna] = useState(false);
  const [canal, setCanal] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoArquivo = useRef<HTMLInputElement>(null);

  const podeNotaInterna = can('chamado:nota-interna');

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!corpo.trim() && !arquivo) return;

    setEnviando(true);
    setErro(null);

    try {
      if (corpo.trim()) {
        await api.responder(
          chamado.id,
          corpo.trim(),
          interna ? 'INTERNA' : 'PUBLICA',
          interna ? undefined : canal || undefined,
        );
      }
      if (arquivo) await api.anexar(chamado.id, arquivo);

      setCorpo('');
      setArquivo(null);
      if (campoArquivo.current) campoArquivo.current.value = '';
      aoEnviar();
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className={`responder ${interna ? '-interna' : ''}`} onSubmit={enviar}>
      {erro ? (
        <div className="alerta-bloco -erro" style={{ marginBottom: 'var(--e-3)' }}>
          <span aria-hidden="true">!</span>
          <span>{erro}</span>
        </div>
      ) : null}

      <label className="so-leitor" htmlFor="corpo-resposta">
        Resposta
      </label>
      <textarea
        id="corpo-resposta"
        className="textarea"
        placeholder={interna ? 'Nota visível só para a equipe…' : 'Escreva a resposta…'}
        value={corpo}
        onChange={(e) => setCorpo(e.target.value)}
      />

      <div className="responder-acoes">
        {podeNotaInterna ? (
          <>
            <label className="so-leitor" htmlFor="visibilidade">
              Visibilidade
            </label>
            <select
              id="visibilidade"
              className="select -auto"
              value={interna ? 'INTERNA' : 'PUBLICA'}
              onChange={(e) => setInterna(e.target.value === 'INTERNA')}
            >
              <option value="PUBLICA">Resposta pública</option>
              <option value="INTERNA">Nota interna</option>
            </select>
          </>
        ) : null}

        <label className="so-leitor" htmlFor="canal-saida">
          Canal de saída
        </label>
        <select
          id="canal-saida"
          className="select -auto"
          value={canal}
          disabled={interna}
          onChange={(e) => setCanal(e.target.value)}
          title={
            interna
              ? 'Nota interna não sai por canal externo.'
              : `Sem escolher, responde por ${ROTULO_CANAL[chamado.originChannel]}`
          }
        >
          <option value="">Canal de origem ({ROTULO_CANAL[chamado.originChannel]})</option>
          <option value="EMAIL">E-mail</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>

        <input
          ref={campoArquivo}
          type="file"
          className="so-leitor"
          id="anexo"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        <label className="btn -secundario -sm" htmlFor="anexo" style={{ cursor: 'pointer' }}>
          {arquivo ? arquivo.name.slice(0, 24) : 'Anexar'}
        </label>

        <button
          type="submit"
          className={`btn -primario responder-enviar ${enviando ? '-carregando' : ''}`}
          disabled={enviando || (!corpo.trim() && !arquivo)}
        >
          {interna ? 'Salvar nota' : 'Enviar resposta'}
        </button>
      </div>
    </form>
  );
}
