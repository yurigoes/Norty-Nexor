import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  NOME_DA_IA,
  podeRemoverAnexo,
  type CopilotIntencao,
  type TicketDetail,
  type TicketEventView,
} from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { ErroDaApi } from '../../api/cliente';
import { useAutenticacao, useRecurso } from '../../auth/Autenticacao';
import { ROTULO_CANAL, ROTULO_STATUS, dataCurta, iniciais, modificadorCanal } from '../../lib/formato';
import { EscolherModelo } from '../modelo/EscolherModelo';
import { useAvisarQueDigita } from './ChatAoVivo';

const TIPOS_DE_SISTEMA = new Set([
  'MUDANCA_STATUS',
  'MUDANCA_ATRIBUICAO',
  'MUDANCA_CLASSIFICACAO',
  'PAUSA_SLA',
  'RETOMADA_SLA',
  'ANEXO_REMOVIDO',
  'AGENDAMENTO',
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
  versao = 0,
}: {
  chamado: TicketDetail;
  aoMudar: () => void;
  somenteLeitura?: boolean;
  /**
   * Sobe a cada mensagem que chega pelo chat ao vivo.
   *
   * A conversa relê em vez de encaixar a mensagem que veio pelo fluxo:
   * encaixar exigiria manter duas listas iguais em sincronia — a do
   * fluxo e a da leitura — e é assim que nasce a mensagem que aparece
   * duas vezes, ou que some ao recarregar.
   */
  versao?: number;
}) {
  const { dado: eventos, carregando } = useRecurso(
    () => api.eventosDoChamado(chamado.id),
    [chamado.id, versao],
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
        <Evento
          key={evento.id}
          evento={evento}
          // Chamado fechado não perde anexo pela mesma razão que não
          // recebe: reabra antes. A API recusa, e a tela não oferece.
          podeMexer={!somenteLeitura && chamado.status !== 'FECHADO'}
          aoMudar={aoMudar}
        />
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

function Evento({
  evento,
  podeMexer,
  aoMudar,
}: {
  evento: TicketEventView;
  podeMexer: boolean;
  aoMudar: () => void;
}) {
  const { perfil } = useAutenticacao();
  const ehSistema = TIPOS_DE_SISTEMA.has(evento.type);
  const ehInterna = evento.visibility === 'INTERNA';
  const autor = evento.author?.name ?? 'Sistema';
  const [retirando, setRetirando] = useState<string | null>(null);

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
        {/* A tarefa também é interna, mas dizer "nota interna" nela
            confundiria com a nota escrita à mão — e ela tem cartão
            próprio logo acima. */}
        {evento.type === 'TAREFA' ? (
          <span className="selo -info">Tarefa</span>
        ) : ehInterna ? (
          <span className="selo -aviso">Nota interna</span>
        ) : null}
        {/* O selo vem do banco (`TicketEvent.aiGenerated`), não de uma
            chave no payload: a declaração de que o texto é de IA não
            pode depender de alguém lembrar de gravá-la. A mesma verdade
            sai por e-mail e WhatsApp — ver `MARCA_DE_IA`. */}
        {evento.aiGenerated ? (
          <span className="selo -ia" title={`Redigido pelo ${NOME_DA_IA} e enviado por ${autor}.`}>
            <span aria-hidden="true">🤖</span> IA
          </span>
        ) : null}
      </header>

      <p className="conversa-corpo">{corpoDoEvento(evento)}</p>

      {evento.attachments.length > 0 ? (
        <div className="conversa-anexos">
          {evento.attachments.map((anexo) => {
            // A mesma função que a API usa para decidir se aceita o
            // DELETE. Fossem duas implementações, a divergência
            // apareceria como botão que não funciona — ou, pior, como
            // botão ausente numa ação que a API aceitaria.
            const podeRetirar =
              podeMexer &&
              perfil !== null &&
              podeRemoverAnexo(perfil.role, perfil.user.id, anexo);

            return (
              <div key={anexo.id} className="conversa-anexo-linha">
                <a
                  className="conversa-anexo"
                  href={api.urlDoAnexo(anexo.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span aria-hidden="true">📎</span>
                  {anexo.filename}
                  <span className="conversa-anexo-peso">
                    {Math.round(anexo.sizeBytes / 1024)} KB
                  </span>
                </a>

                {podeRetirar ? (
                  <button
                    type="button"
                    className="btn -fantasma -sm"
                    disabled={retirando === anexo.id}
                    aria-label={`Retirar ${anexo.filename}`}
                    onClick={() => {
                      setRetirando(anexo.id);
                      void api
                        .removerAnexo(anexo.id)
                        .then(aoMudar)
                        .finally(() => setRetirando(null));
                    }}
                  >
                    Retirar
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

/**
 * O adiamento em palavras.
 *
 * Zero é o caso comum e o que mais interessa dizer: a visita cabe no
 * prazo que já existia, e ninguém ganhou folga por tê-la marcado.
 */
function textoDoAdiamento(segundos: number): string {
  if (segundos <= 0) return ' O prazo não mudou.';
  const horas = Math.round(segundos / 360) / 10;
  return ` O prazo de resolução andou ${horas} h úteis.`;
}

function corpoDoEvento(evento: TicketEventView): string {
  // O corpo do evento é o nome do arquivo; sozinho na linha do tempo
  // ele pareceria alguém tendo dito "foto.png".
  if (evento.type === 'ANEXO_REMOVIDO') return `Anexo retirado: ${evento.body ?? 'arquivo'}.`;
  if (evento.body) return evento.body;

  const payload = evento.payload;
  if (payload?.type === 'MUDANCA_STATUS') {
    return `Status alterado de ${ROTULO_STATUS[payload.from]} para ${ROTULO_STATUS[payload.to]}.`;
  }
  if (payload?.type === 'MUDANCA_ATRIBUICAO') return 'Atribuição alterada.';
  if (payload?.type === 'MUDANCA_CLASSIFICACAO') return 'Classificação alterada.';
  if (payload?.type === 'AGENDAMENTO') {
    const quando = new Date(payload.scheduledFor).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
    const verbo = {
      MARCADO: 'Atendimento marcado para',
      REMARCADO: 'Atendimento remarcado para',
      CANCELADO: 'Atendimento cancelado — estava marcado para',
      REALIZADO: 'Atendimento realizado em',
    }[payload.action];
    const prazo =
      payload.action === 'MARCADO' || payload.action === 'REMARCADO'
        ? textoDoAdiamento(payload.postponedSeconds)
        : '';
    return `${verbo} ${quando}.${prazo}`;
  }
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

  /**
   * O texto no campo veio do Copilot.
   *
   * Liga quando o rascunho entra e só desliga quando o campo fica
   * vazio — editar não apaga a marca. Tentar medir "o quanto ainda é
   * da IA" seria adivinhação, e o erro seguro aqui é declarar demais:
   * quem recebe de fora é quem não tem como desconfiar.
   */
  const [porIa, setPorIa] = useState(false);
  const [pensando, setPensando] = useState<CopilotIntencao | null>(null);
  const [sugestao, setSugestao] = useState<string | null>(null);
  const [temCopilot, setTemCopilot] = useState(false);

  const podeNotaInterna = can('chamado:nota-interna');
  const avisarQueDigita = useAvisarQueDigita(chamado.id);

  // Pergunta antes de oferecer: botão que não responde é pior que botão
  // nenhum. Falha em silêncio de propósito — sem Copilot a caixa de
  // resposta continua sendo a caixa de resposta.
  useEffect(() => {
    let vivo = true;
    void api
      .copilotDisponivel()
      .then((r) => {
        if (vivo) setTemCopilot(r.disponivel);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, []);

  async function pedir(intencao: CopilotIntencao) {
    setPensando(intencao);
    setErro(null);
    try {
      const resposta = await api.pedirAoCopilot(chamado.id, intencao);
      if (intencao === 'SUGERIR') {
        // Sugestão é para o técnico ler, não para o cliente receber.
        // Vai para um painel ao lado do campo, nunca para dentro dele.
        setSugestao(resposta.texto);
      } else {
        setCorpo((atual) => (atual.trim() ? `${atual.trimEnd()}\n\n${resposta.texto}` : resposta.texto));
        setPorIa(true);
      }
    } catch (e) {
      setErro(e instanceof ErroDaApi ? e.message : `O ${NOME_DA_IA} não respondeu.`);
    } finally {
      setPensando(null);
    }
  }

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
          porIa,
        );
      }
      if (arquivo) await api.anexar(chamado.id, arquivo);

      setCorpo('');
      setPorIa(false);
      setSugestao(null);
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
        onChange={(e) => {
          setCorpo(e.target.value);
          if (!e.target.value.trim()) setPorIa(false);
          avisarQueDigita();
        }}
      />

      {porIa ? (
        <p className="responder-ia">
          <span aria-hidden="true">🤖</span> Rascunho do {NOME_DA_IA}. Revise antes de enviar — a
          resposta vai marcada como IA para quem receber.{' '}
          <button type="button" className="btn -fantasma -sm" onClick={() => setPorIa(false)}>
            Reescrevi do zero
          </button>
        </p>
      ) : null}

      {sugestao ? (
        <aside className="responder-sugestao">
          <header>
            <strong>
              <span aria-hidden="true">🤖</span> {NOME_DA_IA} sugere verificar
            </strong>
            <button type="button" className="btn -fantasma -sm" onClick={() => setSugestao(null)}>
              Fechar
            </button>
          </header>
          {/* Só o técnico lê. Não entra no campo e não vai para o
              cliente — se fosse para dentro do campo, uma lista de
              hipóteses viraria resposta com um clique distraído. */}
          <p>{sugestao}</p>
        </aside>
      ) : null}

      <div className="responder-acoes">
        <EscolherModelo
          chamado={chamado}
          kind="RESPOSTA"
          aoEscolher={(texto, modelo) => {
            // Acrescenta ao que já foi escrito em vez de substituir:
            // apagar o parágrafo de alguém por um clique errado é o tipo
            // de coisa que faz o recurso parar de ser usado.
            setCorpo((atual) => (atual.trim() ? `${atual.trimEnd()}\n\n${texto}` : texto));
            if (podeNotaInterna) setInterna(modelo.isInternal);
          }}
        />

        {temCopilot ? (
          <>
            <button
              type="button"
              className={`btn -secundario -sm ${pensando === 'REDIGIR' ? '-carregando' : ''}`}
              disabled={pensando !== null}
              title={`O ${NOME_DA_IA} escreve um rascunho a partir do chamado. Você revisa e envia.`}
              onClick={() => void pedir('REDIGIR')}
            >
              <span aria-hidden="true">🤖</span> Redigir
            </button>
            <button
              type="button"
              className={`btn -fantasma -sm ${pensando === 'SUGERIR' ? '-carregando' : ''}`}
              disabled={pensando !== null}
              title="O que verificar primeiro. Só você lê."
              onClick={() => void pedir('SUGERIR')}
            >
              <span aria-hidden="true">🤖</span> Sugerir
            </button>
          </>
        ) : null}

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
