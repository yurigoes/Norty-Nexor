import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  NOME_DA_IA,
  podeRemoverAnexo,
  type AttachmentView,
  type CopilotIntencao,
  type TicketDetail,
  type TicketEventView,
} from '@norty-desk/shared';

import * as api from '../../api/endpoints';
import { ErroDaApi, buscarComoBlob } from '../../api/cliente';
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
  'TROCA_DE_ATIVO',
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
              <div key={anexo.id} className="conversa-anexo-item">
                <Previa anexo={anexo} />

                <div className="conversa-anexo-linha">
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
  if (payload?.type === 'TROCA_DE_ATIVO') {
    const onde = payload.destino === 'BAIXADO' ? 'foi para descarte' : 'voltou ao estoque';
    const patrimonio = (p: { patrimonio: string | null }) => (p.patrimonio ? ` (${p.patrimonio})` : '');

    return (
      `Equipamento trocado: entrou ${payload.entrou.nome}${patrimonio(payload.entrou)}, ` +
      `saiu ${payload.saiu.nome}${patrimonio(payload.saiu)} e ${onde}` +
      `${payload.comQuebra ? ', com termo de quebra assinado' : ''}.`
    );
  }
  if (payload?.type === 'PAUSA_SLA') return 'Chamado em pendência. O SLA foi pausado.';
  if (payload?.type === 'RETOMADA_SLA') {
    // Sem dizer "pendência": o mesmo evento nasce ao sair da aprovação,
    // onde quem demorou foi o gestor e não o cliente. Chamar aquilo de
    // pendência encerrada seria dizer ao cliente que ele atrasou.
    return `O prazo voltou a correr. ${Math.round(payload.pausedSeconds / 60)} minutos descontados.`;
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

  /**
   * O que o técnico tinha escrito antes de mandar reescrever.
   *
   * Reescrever **substitui** o campo — acrescentar deixaria as duas
   * versões grudadas e a pessoa apagando a sua à mão. Substituir sem
   * guardar, porém, apaga o trabalho de quem não gostou do resultado, e
   * um recurso que come o texto da pessoa uma vez não é usado uma
   * segunda. Então guarda-se, e o botão de voltar fica à vista.
   */
  const [meuTexto, setMeuTexto] = useState<string | null>(null);

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
    // Com texto no campo, REDIGIR vira "reescreva isto": quem atende
    // sabe a resposta, e o que falta é a forma. Vazio, continua sendo
    // "escreva a partir do chamado".
    const rascunho = intencao === 'REDIGIR' ? corpo.trim() : '';

    setPensando(intencao);
    setErro(null);
    try {
      const resposta = await api.pedirAoCopilot(chamado.id, intencao, rascunho || undefined);
      if (intencao === 'SUGERIR') {
        // Sugestão é para o técnico ler, não para o cliente receber.
        // Vai para um painel ao lado do campo, nunca para dentro dele.
        setSugestao(resposta.texto);
      } else if (rascunho) {
        setMeuTexto(rascunho);
        setCorpo(resposta.texto);
        setPorIa(true);
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
      setMeuTexto(null);
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
          if (!e.target.value.trim()) {
            setPorIa(false);
            setMeuTexto(null);
          }
          avisarQueDigita();
        }}
      />

      {porIa ? (
        <p className="responder-ia">
          <span aria-hidden="true">🤖</span>{' '}
          {meuTexto ? `O ${NOME_DA_IA} reescreveu o seu texto.` : `Rascunho do ${NOME_DA_IA}.`} Revise
          antes de enviar — a resposta vai marcada como IA para quem receber.{' '}
          {meuTexto ? (
            <button
              type="button"
              className="btn -fantasma -sm"
              onClick={() => {
                setCorpo(meuTexto);
                setMeuTexto(null);
                // Volta a ser texto da pessoa, então a marca de IA sai
                // junto: o que ela vai enviar é o que ela escreveu.
                setPorIa(false);
              }}
            >
              Voltar ao meu texto
            </button>
          ) : (
            <button type="button" className="btn -fantasma -sm" onClick={() => setPorIa(false)}>
              Reescrevi do zero
            </button>
          )}
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
              title={
                corpo.trim()
                  ? `O ${NOME_DA_IA} reescreve o que você digitou em linguagem técnica e formal. Você revisa e envia.`
                  : `O ${NOME_DA_IA} escreve um rascunho a partir do chamado. Você revisa e envia.`
              }
              onClick={() => void pedir('REDIGIR')}
            >
              <span aria-hidden="true">🤖</span> {corpo.trim() ? 'Formalizar' : 'Redigir'}
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

        <GravarAudio aoGravar={setArquivo} desabilitado={enviando} />

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

/**
 * A prévia de um anexo, quando é seguro desenhá-lo.
 *
 * ## Por que só foto e áudio
 *
 * A rota de anexo manda `Content-Disposition: attachment` e `nosniff`
 * de propósito: um HTML anexado por terceiro, servido inline na origem
 * da API, executaria script com a sessão ao alcance. Aqui o arquivo
 * vira `blob:` **desta** aba, então a mesma pergunta volta — e a
 * resposta é desenhar só o que não executa: imagem e áudio. Todo o
 * resto continua sendo um link para baixar.
 *
 * O tipo passado ao `Blob` é o que **nós** decidimos a partir de uma
 * lista fechada, não o que o servidor mandou: aceitar o do servidor
 * devolveria a decisão a quem subiu o arquivo.
 *
 * ## Por que buscar em vez de apontar
 *
 * A rota pede `Authorization`, e o navegador não manda o `Bearer` num
 * `<img src>`. Abrir a rota para resolver isso seria trocar uma prévia
 * por um vazamento.
 */
function Previa({ anexo }: { anexo: AttachmentView }) {
  const [endereco, setEndereco] = useState<string | null>(null);
  const tipo = tipoSeguro(anexo.contentType);

  useEffect(() => {
    if (!tipo) return undefined;

    let vivo = true;
    let criado: string | null = null;

    void buscarComoBlob(`/anexos/${anexo.id}`, tipo.mime)
      .then((url) => {
        criado = url;
        // Desmontado antes de chegar: solta agora, senão o blob fica na
        // memória da aba até ela fechar.
        if (vivo) setEndereco(url);
        else URL.revokeObjectURL(url);
      })
      // Falha em silêncio: o link de baixar continua logo abaixo, e um
      // erro vermelho por uma prévia que não carregou é barulho.
      .catch(() => undefined);

    return () => {
      vivo = false;
      if (criado) URL.revokeObjectURL(criado);
    };
  }, [anexo.id, tipo]);

  if (!tipo || !endereco) return null;

  if (tipo.familia === 'imagem') {
    return (
      <a href={api.urlDoAnexo(anexo.id)} target="_blank" rel="noreferrer">
        <img className="conversa-previa" src={endereco} alt={anexo.filename} loading="lazy" />
      </a>
    );
  }

  // Sem `<track>`: áudio de conversa não tem legenda a oferecer. O que
  // há é o texto do evento ao lado — e, no WhatsApp, a transcrição
  // entra como corpo da mensagem.
  return <audio className="conversa-audio" controls preload="none" src={endereco} />;
}

/**
 * Os tipos que dá para desenhar, numa lista fechada.
 *
 * Fechada, e não "começa com image/": `image/svg+xml` é XML, e XML com
 * `<script>` dentro executa quando o navegador o desenha. Um SVG
 * anexado por terceiro numa aba nossa é a mesma falha que o HTML.
 */
function tipoSeguro(contentType: string): { familia: 'imagem' | 'audio'; mime: string } | null {
  const tipo = contentType.split(';')[0]!.trim().toLowerCase();

  const imagens = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'];
  if (imagens.includes(tipo)) return { familia: 'imagem', mime: tipo };

  const audios = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/aac'];
  if (audios.includes(tipo)) return { familia: 'audio', mime: tipo };

  return null;
}

/** Extensão e tipo do que o navegador consegue gravar, na ordem da preferência. */
const FORMATOS_DE_AUDIO = [
  // Ogg/Opus é o que o WhatsApp toca nativamente, e o Firefox grava.
  { mime: 'audio/ogg;codecs=opus', extensao: 'ogg' },
  // O Chrome só grava webm. A Meta não aceita webm como `audio`, então
  // ele sai como documento — chega tocável no aparelho, em vez de não
  // chegar. É o compromisso, e está escrito para ninguém descobrir
  // depois.
  { mime: 'audio/webm;codecs=opus', extensao: 'webm' },
  { mime: 'audio/webm', extensao: 'webm' },
  { mime: 'audio/mp4', extensao: 'm4a' },
];

/**
 * Gravar um recado de voz na própria caixa de resposta.
 *
 * Quem atende em campo, com o celular na mão, digita mal e devagar —
 * e o cliente do outro lado está no WhatsApp, onde o áudio é a moeda
 * corrente. Uma resposta de voz de vinte segundos sai mais rápida e
 * mais clara que dois parágrafos digitados no ônibus.
 *
 * O áudio entra como **anexo comum**: mesma linha do tempo, mesmo
 * armazenamento, mesma regra de retirada. Não há "mensagem de voz" no
 * modelo — teria virado uma segunda história do mesmo atendimento, que
 * é o defeito que a regra 8 existe para corrigir.
 *
 * O botão só aparece onde dá para gravar. `MediaRecorder` não existe em
 * navegador antigo, e `getUserMedia` exige HTTPS — em `http://` sem
 * TLS ele simplesmente não está lá. Mostrar um botão que abre um erro
 * é pior que não mostrar.
 */
function GravarAudio({
  aoGravar,
  desabilitado,
}: {
  aoGravar: (arquivo: File) => void;
  desabilitado: boolean;
}) {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const gravador = useRef<MediaRecorder | null>(null);

  const disponivel =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  // O relógio da gravação. Sem ele a pessoa não sabe se está gravando
  // há cinco segundos ou há cinco minutos — e manda um áudio de cinco
  // minutos.
  useEffect(() => {
    if (!gravando) return undefined;
    const relogio = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(relogio);
  }, [gravando]);

  // Soltar o microfone ao sair da tela. Sem isto a luz da câmera/mic
  // fica acesa depois que a pessoa navegou para outro chamado — e ela
  // com razão acha que está sendo ouvida.
  useEffect(() => {
    return () => {
      gravador.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (!disponivel) return null;

  async function comecar() {
    setErro(null);
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formato =
        FORMATOS_DE_AUDIO.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;

      const rec = new MediaRecorder(fluxo, formato ? { mimeType: formato.mime } : undefined);
      const pedacos: Blob[] = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedacos.push(e.data);
      };

      rec.onstop = () => {
        // O microfone solta **aqui**, e não no clique de parar: parar o
        // gravador é assíncrono, e soltar antes corta o último pedaço.
        fluxo.getTracks().forEach((t) => t.stop());

        const tipo = formato?.mime.split(';')[0] ?? 'audio/webm';
        const blob = new Blob(pedacos, { type: tipo });

        // Menos de um segundo é toque sem querer, não recado.
        if (blob.size < 1000) return;

        const carimbo = new Date().toISOString().slice(11, 19).replace(/:/g, '');
        aoGravar(
          new File([blob], `recado-${carimbo}.${formato?.extensao ?? 'webm'}`, { type: tipo }),
        );
      };

      rec.start();
      gravador.current = rec;
      setSegundos(0);
      setGravando(true);
    } catch {
      // Permissão negada, sem microfone, ou `http://` sem TLS. Uma
      // frase, e a caixa de resposta continua a caixa de resposta.
      setErro('Não consegui usar o microfone. Verifique a permissão do navegador.');
    }
  }

  function parar() {
    gravador.current?.stop();
    gravador.current = null;
    setGravando(false);
  }

  if (erro) {
    return (
      <span className="campo-ajuda" role="status">
        {erro}
      </span>
    );
  }

  return (
    <button
      type="button"
      className={`btn -sm ${gravando ? '-perigo' : '-secundario'}`}
      disabled={desabilitado}
      aria-pressed={gravando}
      onClick={() => (gravando ? parar() : void comecar())}
    >
      <span aria-hidden="true">{gravando ? '⏹' : '🎙'}</span>{' '}
      {gravando
        ? `Parar (${String(Math.floor(segundos / 60)).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')})`
        : 'Gravar áudio'}
    </button>
  );
}
