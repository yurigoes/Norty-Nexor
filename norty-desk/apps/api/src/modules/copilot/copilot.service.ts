import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { CopilotIntencao, CopilotResposta } from '@norty-desk/shared';
import type { AiProvider } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { decifrar } from '../channels/segredos';

/**
 * Norty Copilot.
 *
 * Duas coisas, e só estas duas: **redigir** uma resposta com pontuação
 * e concordância certas, e **sugerir** ao técnico o que verificar.
 *
 * ## O Copilot nunca responde sozinho
 *
 * Ele devolve texto; quem envia é a pessoa. Não há caminho em que uma
 * resposta chegue ao cliente sem alguém ter lido. É a diferença entre
 * uma ferramenta que ajuda a escrever e uma que fala pela empresa.
 *
 * Quando a pessoa envia o rascunho, a resposta vai marcada
 * (`TicketEvent.aiGenerated`) e carrega o selo na tela **e** a linha no
 * e-mail e no WhatsApp. Quem recebe de fora é justamente quem não tem
 * como desconfiar.
 *
 * ## O que sai da casa
 *
 * Gemini e Groq são terceiros, e a decisão de mandar texto do cliente
 * para fora é do Yuri — está registrada em `docs/13`. O que **não**
 * sai, e é cercado aqui:
 *
 * - **Nota interna**: é conversa da equipe sobre o chamado. Nunca.
 * - **Campo interno** do formulário: mesma razão.
 * - **Dado de acesso**: senha, IP de VPN, id de acesso remoto.
 * - **Identificador**: id de chamado, de pessoa, de empresa.
 *
 * Vai o assunto, a descrição e as mensagens públicas — que é o que o
 * cliente já escreveu e o que a empresa já respondeu a ele.
 */
@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * O Copilot está ligado nesta organização?
   *
   * A tela pergunta antes de mostrar o botão: oferecer o que não
   * responde é pior que não oferecer.
   */
  async disponivel(organizationId: string): Promise<boolean> {
    const config = await this.prisma.aiConfig.findUnique({
      where: { organizationId },
      select: { isActive: true, apiKeyCifrada: true },
    });
    return Boolean(config?.isActive && config.apiKeyCifrada);
  }

  async responder(
    usuario: UsuarioAutenticado,
    ticketId: string,
    intencao: CopilotIntencao,
  ): Promise<CopilotResposta> {
    const config = await this.prisma.aiConfig.findUnique({
      where: { organizationId: usuario.organizationId },
    });

    if (!config?.isActive || !config.apiKeyCifrada) {
      throw new BadRequestException(
        'O Norty Copilot não está configurado nesta organização.',
      );
    }

    const contexto = await this.contextoPublico(usuario.organizationId, ticketId);
    const prompt = CopilotService.montarPrompt(intencao, contexto);

    const texto = await this.chamarProvedor(
      config.provider,
      decifrar(config.apiKeyCifrada),
      config.model,
      prompt,
    );

    return { texto, provider: config.provider, model: config.model };
  }

  /**
   * O chamado como o provedor o enxerga: só o que é público.
   *
   * A cerca é uma consulta, não um filtro depois: o que não pode sair
   * não é carregado. Filtrar em memória deixa o dado passar por aqui, e
   * um `console.log` de depuração no lugar errado já o teria mandado
   * para o log.
   */
  private async contextoPublico(organizationId: string, ticketId: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { id: ticketId, organizationId },
      select: {
        subject: true,
        description: true,
        category: { select: { name: true } },
        actors: { where: { role: 'REQUERENTE' }, select: { userId: true } },
        events: {
          where: { visibility: 'PUBLICA', type: { in: ['MENSAGEM', 'SOLUCAO'] } },
          orderBy: { createdAt: 'asc' },
          take: 20,
          select: { body: true, authorId: true, createdAt: true },
        },
      },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');

    // Quem abriu o chamado. Sem isto, "tem autor" seria lido como
    // atendimento — e o solicitante logado tem autor, então a conversa
    // inteira dele apareceria do lado errado.
    const requerenteId = chamado.actors[0]?.userId ?? null;

    return {
      assunto: chamado.subject,
      descricao: chamado.description,
      categoria: chamado.category?.name ?? null,
      // Quem falou, sem dizer quem é: "cliente" ou "atendimento" basta
      // para o modelo entender a conversa, e nome de pessoa não precisa
      // sair da casa para isso.
      conversa: chamado.events
        .filter((e): e is typeof e & { body: string } => Boolean(e.body))
        .map((e) => ({
          de: e.authorId && e.authorId !== requerenteId ? 'atendimento' : 'cliente',
          texto: e.body,
        })),
    };
  }

  private static montarPrompt(
    intencao: CopilotIntencao,
    contexto: {
      assunto: string;
      descricao: string;
      categoria: string | null;
      conversa: { de: string; texto: string }[];
    },
  ): string {
    const conversa = contexto.conversa
      .map((m) => `${m.de === 'cliente' ? 'Cliente' : 'Atendimento'}: ${m.texto}`)
      .join('\n');

    const chamado = [
      `Assunto: ${contexto.assunto}`,
      contexto.categoria ? `Tipo: ${contexto.categoria}` : null,
      `Descrição: ${contexto.descricao}`,
      conversa ? `\nConversa até aqui:\n${conversa}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    if (intencao === 'SUGERIR') {
      return (
        'Você ajuda um técnico de suporte brasileiro. Leia o chamado e liste, ' +
        'em até cinco itens curtos, o que verificar primeiro — do mais provável ' +
        'para o menos. Nada de saudação, nada de explicar o que você está fazendo. ' +
        'Português do Brasil.\n\n' +
        chamado
      );
    }

    return (
      'Você escreve a resposta de um atendimento de suporte brasileiro para o ' +
      'cliente. Escreva em português do Brasil, com pontuação e concordância ' +
      'corretas, em tom cordial e direto. Não invente informação que não esteja ' +
      'no chamado: se falta um dado para resolver, peça esse dado. Não prometa ' +
      'prazo. Devolva só o texto da resposta.\n\n' +
      chamado
    );
  }

  /**
   * Fala com o provedor. Os dois falam REST; a diferença é o formato.
   *
   * Erro vira `BadRequestException` com a razão, e **não** degrada em
   * silêncio como a transcrição: ali a pessoa não pediu nada e o áudio
   * segue anexado; aqui ela clicou num botão e está esperando texto.
   * Silêncio seria um botão que às vezes não faz nada.
   */
  private async chamarProvedor(
    provider: AiProvider,
    apiKey: string,
    model: string,
    prompt: string,
  ): Promise<string> {
    const corpo: { url: string; headers: Record<string, string>; body: unknown } =
      provider === 'GEMINI'
        ? {
            url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: { contents: [{ parts: [{ text: prompt }] }] },
          }
        : {
            url: 'https://api.groq.com/openai/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: { model, messages: [{ role: 'user', content: prompt }] },
          };

    let resposta: Response;
    try {
      resposta = await fetch(corpo.url, {
        method: 'POST',
        headers: corpo.headers,
        body: JSON.stringify(corpo.body),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (erro) {
      // A mensagem do provedor pode conter a chave na URL; o log fica
      // com a causa, a pessoa com uma frase útil.
      this.logger.warn(`Copilot (${provider}) não respondeu: ${String(erro)}`);
      throw new BadRequestException('O Copilot não respondeu. Tente de novo.');
    }

    if (!resposta.ok) {
      const bruto = await resposta.text().catch(() => '');
      this.logger.warn(`Copilot (${provider}) devolveu ${resposta.status}: ${bruto.slice(0, 300)}`);

      // O texto do provedor **não** vai para a pessoa: ele é lido só
      // para classificar. Repassá-lo devolveria inglês na tela e, no
      // pior caso, a URL com a chave dentro.
      throw new BadRequestException(CopilotService.razaoDoErro(resposta.status, bruto));
    }

    const json = (await resposta.json()) as Record<string, unknown>;
    const texto = CopilotService.extrairTexto(provider, json);

    if (!texto) throw new BadRequestException('O Copilot devolveu uma resposta vazia.');
    return texto.trim();
  }

  /**
   * O erro do provedor em português, e útil.
   *
   * Os dois erros que o administrador comete são chave errada e nome de
   * modelo errado, e nenhum dos dois se reconhece pelo código HTTP: o
   * Gemini devolve **400** para chave inválida, não 401. Ficar só no
   * código deixaria "O Copilot devolveu erro 400" na tela — verdadeiro
   * e inútil, que é o tipo de mensagem que faz alguém abrir chamado
   * para o suporte do próprio sistema de chamados.
   */
  private static razaoDoErro(status: number, bruto: string): string {
    const texto = bruto.toLowerCase();

    if (status === 401 || status === 403 || texto.includes('api key') || texto.includes('api_key')) {
      return 'A chave do Copilot foi recusada pelo provedor. Confira a chave na configuração.';
    }

    if (status === 404 || texto.includes('not found') || texto.includes('does not exist')) {
      return 'O provedor não conhece este modelo. Confira o nome do modelo na configuração.';
    }

    if (status === 429 || texto.includes('quota') || texto.includes('rate limit')) {
      return 'O provedor recusou por limite de uso. Tente de novo em instantes.';
    }

    return `O Copilot devolveu erro ${status}.`;
  }

  /** Cada provedor embrulha o texto do seu jeito. */
  private static extrairTexto(provider: AiProvider, json: Record<string, unknown>): string | null {
    if (provider === 'GEMINI') {
      const candidatos = json.candidates as { content?: { parts?: { text?: string }[] } }[];
      return candidatos?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') || null;
    }

    const escolhas = json.choices as { message?: { content?: string } }[];
    return escolhas?.[0]?.message?.content ?? null;
  }
}
