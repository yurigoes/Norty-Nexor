import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  type AnexoRecebido,
  type Channel,
  normalizePhone,
  ticketTag,
} from '@norty-desk/shared';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { TranscricaoService } from '../transcricao/transcricao.service';
import { PORTA_DE_ARMAZENAMENTO, type PortaDeArmazenamento } from '../attachments/armazenamento';
import { RegrasService } from '../regras/regras.service';
import { TicketsService } from '../tickets/tickets.service';
import { EntradaService } from './entrada.service';
import { EvolutionClient } from './evolution.client';
import { corpoDaMensagem, limparAssunto } from './limpeza';
import { MetaClient } from './meta.client';
import { decifrarConfig } from './segredos';
import {
  interpretarToque,
  listaDeChamados,
  listaDeEmpresas,
  listaEmTexto,
  menuDeToque,
  type ListaInterativa,
} from './meta.mensagem';
import { SaidaService } from './saida.service';
import { WhatsappBot } from './whatsapp.bot';
import {
  interpretarComando,
  montarMenu,
  montarStatus,
  numeroEscolhido,
} from './whatsapp.conversa';

/**
 * Segunda fase do canal: a mensagem recebida vira evento de chamado.
 *
 * A primeira fase (`EntradaService.receber`) só grava e devolve 202,
 * para o provedor não reentregar. Esta roda depois, sem ninguém
 * esperando — e por isso pode buscar mídia, criar contato e abrir
 * chamado sem estourar o tempo do webhook.
 */
@Injectable()
export class ProcessamentoService {
  private readonly logger = new Logger(ProcessamentoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entrada: EntradaService,
    @Inject(forwardRef(() => TicketsService)) private readonly tickets: TicketsService,
    private readonly saida: SaidaService,
    private readonly regras: RegrasService,
    private readonly evolution: EvolutionClient,
    @Inject(PORTA_DE_ARMAZENAMENTO) private readonly armazenamento: PortaDeArmazenamento,
    private readonly transcricao: TranscricaoService,
    private readonly bot: WhatsappBot,
    private readonly meta: MetaClient,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processarPendentes(): Promise<void> {
    const pendentes = await this.prisma.inboundMessage.findMany({
      where: { processedAt: null, discardedReason: null },
      orderBy: { receivedAt: 'asc' },
      take: 50,
      select: { id: true },
    });

    for (const { id } of pendentes) {
      await this.processarUma(id).catch((erro: Error) => {
        this.logger.error(`Falha ao processar ${id}: ${erro.message}`);
        return this.descartar(id, `Erro no processamento: ${erro.message.slice(0, 300)}`);
      });
    }
  }

  async processarUma(id: string): Promise<void> {
    const mensagem = await this.prisma.inboundMessage.findUnique({
      where: { id },
      include: { channelAccount: true },
    });

    if (!mensagem || mensagem.processedAt || mensagem.discardedReason) return;

    if (mensagem.channel === 'EMAIL') await this.processarEmail(mensagem);
    else if (mensagem.channel === 'WHATSAPP') await this.processarWhatsapp(mensagem);
    else await this.descartar(id, `Canal ${mensagem.channel} não tem processador.`);
  }

  private async descartar(id: string, motivo: string): Promise<void> {
    await this.prisma.inboundMessage.update({
      where: { id },
      data: { discardedReason: motivo, processedAt: new Date() },
    });
  }

  private async concluir(id: string, eventId: string): Promise<void> {
    await this.prisma.inboundMessage.update({
      where: { id },
      data: { eventId, processedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------
  // E-mail
  // -------------------------------------------------------------------

  private async processarEmail(
    mensagem: Prisma.InboundMessageGetPayload<{ include: { channelAccount: true } }>,
  ): Promise<void> {
    const corpo = corpoDaMensagem(mensagem.bodyText, mensagem.bodyHtml);
    const anexos = (mensagem.attachments as AnexoRecebido[] | null) ?? [];

    if (!corpo && anexos.length === 0) {
      await this.descartar(mensagem.id, 'Mensagem sem corpo e sem anexo.');
      return;
    }

    const contato = await this.resolverContato(mensagem.organizationId, {
      email: mensagem.fromAddress,
      nome: this.nomeDoRemetente(mensagem),
    });

    const referencias = (mensagem.rawHeaders as { references?: string[] } | null)?.references;

    const ticketId = await this.entrada.resolverChamadoPorEmail(mensagem.organizationId, {
      inReplyTo: mensagem.inReplyTo ?? undefined,
      references: referencias,
      subject: mensagem.subject ?? undefined,
    });

    if (ticketId) {
      const evento = await this.tickets.responderPorCanal({
        ticketId,
        contactId: contato.id,
        channel: 'EMAIL',
        body: corpo || '(mensagem com anexo)',
      });

      await this.vincularAnexos(ticketId, evento.id, anexos, mensagem.organizationId);
      await this.concluir(mensagem.id, evento.id);
      return;
    }

    const assunto = limparAssunto(mensagem.subject ?? '') || 'Chamado por e-mail';

    // As regras decidem antes de o chamado existir: descartar spam
    // depois de abrir já custou um número de chamado e um aviso ao
    // remetente.
    const decisao = await this.regras.classificar(mensagem.organizationId, {
      assunto,
      corpo,
      remetente: mensagem.fromAddress,
      canal: 'EMAIL',
    });

    if (decisao.descartar) {
      await this.descartar(mensagem.id, `Regra de entrada: ${decisao.descartar}`);
      return;
    }

    const chamado = await this.tickets.abrirPorCanal({
      organizationId: mensagem.organizationId,
      contactId: contato.id,
      channel: 'EMAIL',
      subject: assunto,
      description: corpo || '(mensagem com anexo)',
      teamId: decisao.timeId ?? mensagem.channelAccount.defaultTeamId,
      categoryId: decisao.categoriaId,
      urgency: decisao.urgencia,
      ticketType: decisao.tipo,
      agreementIds: decisao.acordoIds,
      regrasAplicadas: decisao.regrasAplicadas,
    });

    const abertura = await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'ENTRADA_CANAL',
        visibility: 'PUBLICA',
        authorContactId: contato.id,
        channel: 'EMAIL',
        payload: {
          type: 'ENTRADA_CANAL',
          channel: 'EMAIL',
          externalId: mensagem.externalId,
          address: mensagem.fromAddress,
        },
      },
      select: { id: true },
    });

    await this.vincularAnexos(chamado.id, abertura.id, anexos, mensagem.organizationId);
    await this.concluir(mensagem.id, abertura.id);

    await this.avisarAbertura(mensagem.organizationId, chamado, 'EMAIL', mensagem.fromAddress);
  }

  private nomeDoRemetente(mensagem: { rawHeaders: Prisma.JsonValue | null }): string | undefined {
    const cabecalhos = mensagem.rawHeaders as { fromName?: string } | null;
    return cabecalhos?.fromName;
  }

  // -------------------------------------------------------------------
  // WhatsApp
  // -------------------------------------------------------------------

  private async processarWhatsapp(
    mensagem: Prisma.InboundMessageGetPayload<{ include: { channelAccount: true } }>,
  ): Promise<void> {
    const telefone = normalizePhone(mensagem.fromAddress);
    const texto = (mensagem.bodyText ?? '').trim();
    // `decifrarConfig` e não o `config` cru: os segredos são cifrados
    // na gravação (AES-256-GCM, `segredos.ts`), e ler o campo direto
    // entrega `v1:...` no lugar da chave.
    //
    // Estava assim desde antes, e o efeito era invisível: a Evolution
    // recusava a busca de mídia com uma chave que não existe, o `catch`
    // devolvia `null`, e o chamado abria sem o anexo. Ninguém via erro
    // — só faltava o arquivo, e quem atende culpava o cliente por não
    // ter mandado.
    const config = decifrarConfig(mensagem.channelAccount.config as Record<string, unknown>) as {
      janelaHoras?: number;
      menuAtivo?: boolean;
      baseUrl?: string;
      instance?: string;
      apiKey?: string;
      maxAttachmentBytes?: number;
      phoneNumberId?: string;
      token?: string;
      versao?: string;
    };

    const contato = await this.resolverContato(mensagem.organizationId, {
      telefone,
      nome: this.nomeDoRemetente(mensagem),
    });

    const midia = await this.baixarMidiaSeHouver(mensagem, config);

    // Áudio vira texto antes de qualquer decisão: sem isso ele não entra
    // na regra de entrada, não vira assunto e o agente precisa ouvir
    // quarenta segundos para saber do que se trata.
    const transcrito = await this.transcreverSeForAudio(midia);
    const textoEfetivo = transcrito ? TranscricaoService.comMarca(transcrito, texto) : texto;

    const conta = mensagem.channelAccount;
    const cabecalhos = (mensagem.rawHeaders ?? {}) as {
      toque?: string | null;
      provedor?: string;
    };
    const lembrado = await this.bot.lembrar(conta.id, telefone);

    // As duas marcas azuis. Vale mais do que parece: sem elas a pessoa
    // fica olhando uma mensagem entregue e sem resposta, sem saber se
    // ela chegou a alguém. Falha em silêncio de propósito — um recibo
    // que não saiu não pode derrubar o processamento da mensagem.
    if (cabecalhos.provedor === 'META' && config.phoneNumberId && config.token) {
      await this.meta.marcarComoLida(
        { phoneNumberId: config.phoneNumberId, token: config.token, versao: config.versao },
        mensagem.externalId,
      );
    }

    // 0. A pessoa **tocou** numa lista que mandamos.
    //
    //    Vem antes de tudo porque a resposta já vem identificada: a
    //    Meta devolve o `id` exato da linha tocada, então não há o que
    //    interpretar nem como errar. É a diferença para o menu digitado,
    //    em que "Status", "status?" e "ver status" são três coisas.
    const toque = interpretarToque(cabecalhos.toque ?? undefined);
    if (toque) {
      await this.tratarToque(mensagem, contato.id, telefone, toque);
      return;
    }

    // 0.1. Estávamos esperando a escolha de empresa, e ela veio escrita.
    //
    //      É o caminho de quem está na Evolution, que não desenha lista
    //      de toque: a lista saiu em texto e a pessoa respondeu o nome.
    if (lembrado?.aguardando === 'EMPRESA' && textoEfetivo && !midia) {
      const quem = await this.bot.identificar(mensagem.organizationId, telefone);
      const empresa = WhatsappBot.acharEmpresaPorTexto(textoEfetivo, quem.empresas);

      if (empresa) {
        await this.bot.anotar({
          organizationId: mensagem.organizationId,
          channelAccountId: conta.id,
          telefone,
          clientId: empresa.id,
          aguardando: 'ASSUNTO',
        });

        await this.saida.enfileirarAviso({
          organizationId: mensagem.organizationId,
          ticketId: null,
          channel: 'WHATSAPP',
          para: telefone,
          channelAccountId: conta.id,
          corpo: `Certo, ${empresa.nome}. Me conte o que está acontecendo.`,
        });

        await this.descartar(mensagem.id, `Empresa escolhida: ${empresa.nome}.`);
        return;
      }

      // Não casou com nenhuma: repete a pergunta em vez de abrir na
      // errada. Uma pergunta repetida incomoda; um chamado cobrado da
      // empresa errada custa dinheiro e confiança.
      if (quem.empresas.length > 1) {
        await this.pedirEmpresa(mensagem, telefone, quem.empresas);
        return;
      }
    }

    // 1. Comando explícito ganha da conversa em andamento. O bot não
    //    tenta interpretar linguagem natural: comando é previsível, e
    //    previsível é o que faz o cliente confiar no canal.
    const comando = config.menuAtivo === false ? null : interpretarComando(texto);

    if (comando && !midia) {
      const tratado = await this.tratarComando(mensagem, contato.id, telefone, comando);
      if (tratado) return;
    }

    // 2. Um número sozinho é a resposta à pergunta "sobre qual
    //    chamado?". Só vale se o número for de um chamado aberto do
    //    próprio contato — senão é conteúdo, e conteúdo não some.
    const escolhido = numeroEscolhido(texto);
    if (escolhido !== null && !midia) {
      const alvo = await this.prisma.ticket.findFirst({
        where: {
          organizationId: mensagem.organizationId,
          number: escolhido,
          status: { not: 'FECHADO' },
          actors: { some: { contactId: contato.id, role: 'REQUERENTE' } },
        },
        select: { id: true, number: true, subject: true },
      });

      if (alvo) {
        await this.saida.enfileirarAviso({
          organizationId: mensagem.organizationId,
          ticketId: alvo.id,
          channel: 'WHATSAPP',
          para: telefone,
          channelAccountId: conta.id,
          corpo: `${ticketTag(alvo.number)} ${alvo.subject}\n\nPode mandar. Estou ouvindo.`,
        });

        // Uma marca no chamado faz a janela de conversa passar a
        // apontar para ele na próxima mensagem.
        await this.prisma.ticket.update({
          where: { id: alvo.id },
          data: { updatedAt: new Date() },
        });

        await this.descartar(mensagem.id, `Contato escolheu o chamado #${escolhido}.`);
        return;
      }
    }

    // 3. Sem comando e sem escolha, resolve pela janela de conversa.
    const janela = config.janelaHoras ?? 24;
    const alvo = await this.entrada.resolverChamadoPorWhatsapp(
      mensagem.organizationId,
      telefone,
      janela,
    );

    if (alvo.tipo === 'AMBIGUO') {
      await this.perguntarQualChamado(mensagem, telefone, alvo.ticketIds);
      return;
    }

    if (alvo.tipo === 'CHAMADO') {
      const evento = await this.tickets.responderPorCanal({
        ticketId: alvo.ticketId,
        contactId: contato.id,
        channel: 'WHATSAPP',
        body: textoEfetivo || '(mídia)',
      });

      await this.vincularAnexos(
        alvo.ticketId,
        evento.id,
        midia ? [midia] : [],
        mensagem.organizationId,
      );
      await this.concluir(mensagem.id, evento.id);
      return;
    }

    // 4. Conversa nova: abre chamado.
    if (!texto && !midia) {
      await this.descartar(mensagem.id, 'Mensagem sem texto e sem mídia.');
      return;
    }

    // 4.1. Só um "bom dia": oferece o menu em vez de abrir um chamado
    //      chamado "Oi".
    //
    //      Um cumprimento não é um problema, e virava um chamado com
    //      assunto "Oi" que alguém tinha de abrir para descobrir do que
    //      se tratava. Quem já está no meio de um fluxo (`lembrado`) não
    //      recebe o menu de novo — aí ele seria uma pergunta repetida.
    if (
      config.menuAtivo !== false &&
      !midia &&
      !lembrado &&
      ProcessamentoService.ehSoUmCumprimento(texto)
    ) {
      await this.oferecerMenu(mensagem, contato.id, telefone);
      return;
    }

    // 4.2. De quem é este chamado.
    //
    //      O número identifica a pessoa e a empresa, e o chamado nasce
    //      com contrato e SLA certos sem ninguém digitar nada. Quando o
    //      mesmo número aparece em mais de uma empresa, o bot pergunta:
    //      adivinhar pela primeira erraria em silêncio, e o erro só
    //      apareceria no relatório do mês.
    const quem = await this.bot.identificar(mensagem.organizationId, telefone);
    let clientId = lembrado?.clientId ?? null;

    if (!clientId && quem.empresas.length > 1) {
      await this.pedirEmpresa(mensagem, telefone, quem.empresas);
      return;
    }

    clientId = clientId ?? quem.empresas[0]?.id ?? null;

    // Com a empresa decidida, sabe-se **qual** das contas com este
    // número está falando — e o chamado sai no nome dela, que é do que
    // depende ela o enxergar ao entrar no portal.
    const requerente =
      clientId && !quem.userId
        ? await this.bot.pessoaDaEmpresa(mensagem.organizationId, telefone, clientId)
        : null;

    // O assunto sai da transcrição quando o áudio veio sem legenda: um
    // chamado chamado "(mídia sem texto)" não se acha na fila.
    const assunto = ProcessamentoService.assuntoDeTexto(transcrito || texto);

    const decisao = await this.regras.classificar(mensagem.organizationId, {
      assunto,
      corpo: textoEfetivo,
      remetente: telefone,
      canal: 'WHATSAPP',
    });

    if (decisao.descartar) {
      await this.descartar(mensagem.id, `Regra de entrada: ${decisao.descartar}`);
      return;
    }

    const chamado = await this.tickets.abrirPorCanal({
      organizationId: mensagem.organizationId,
      contactId: contato.id,
      requesterUserId: quem.userId ?? requerente?.id ?? null,
      clientId,
      channel: 'WHATSAPP',
      // O WhatsApp não tem assunto: a primeira linha vira o título e o
      // texto inteiro vira a descrição.
      subject: assunto,
      description: textoEfetivo || '(mídia sem texto)',
      teamId: decisao.timeId ?? mensagem.channelAccount.defaultTeamId,
      categoryId: decisao.categoriaId,
      urgency: decisao.urgencia,
      ticketType: decisao.tipo,
      agreementIds: decisao.acordoIds,
      regrasAplicadas: decisao.regrasAplicadas,
    });

    const abertura = await this.prisma.ticketEvent.create({
      data: {
        ticketId: chamado.id,
        type: 'ENTRADA_CANAL',
        visibility: 'PUBLICA',
        authorContactId: contato.id,
        channel: 'WHATSAPP',
        payload: {
          type: 'ENTRADA_CANAL',
          channel: 'WHATSAPP',
          externalId: mensagem.externalId,
          address: telefone,
        },
      },
      select: { id: true },
    });

    await this.vincularAnexos(
      chamado.id,
      abertura.id,
      midia ? [midia] : [],
      mensagem.organizationId,
    );
    await this.concluir(mensagem.id, abertura.id);

    // O chamado nasceu: o que o bot estava esperando já aconteceu.
    // Guardar a escolha depois disso faria a mensagem seguinte, sobre
    // outro assunto, herdar a empresa escolhida para esta.
    await this.bot.esquecer(conta.id, telefone);

    await this.avisarAbertura(
      mensagem.organizationId,
      chamado,
      'WHATSAPP',
      telefone,
      conta.id,
    );
  }

  /**
   * "Oi", "bom dia", "boa tarde" — e nada mais.
   *
   * Curto **e** reconhecível: um "bom dia, a impressora parou" é um
   * problema, e tratá-lo como cumprimento faria a pessoa contar tudo de
   * novo. A regra é o texto ser só a saudação, com pontuação e emoji
   * descontados.
   */
  private static ehSoUmCumprimento(texto: string): boolean {
    const limpo = texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Emoji e pontuação fora: "oi!! 👋" é um oi.
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!limpo || limpo.length > 30) return false;

    return /^(oi|ola|opa|eai|e ai|alo|bom dia|boa tarde|boa noite|tudo bem|tudo bom|preciso de ajuda|ajuda|menu)$/.test(
      limpo,
    );
  }

  /** A primeira linha, ou os primeiros oitenta caracteres. */
  private static assuntoDeTexto(texto: string): string {
    const primeira = texto.split('\n')[0]?.trim() ?? '';
    if (primeira.length >= 8 && primeira.length <= 90) return primeira;
    return (texto.slice(0, 80).trim() || 'Chamado por WhatsApp') + (texto.length > 80 ? '…' : '');
  }

  private async tratarComando(
    mensagem: { id: string; organizationId: string; channelAccountId: string },
    contactId: string,
    telefone: string,
    comando: NonNullable<ReturnType<typeof interpretarComando>>,
  ): Promise<boolean> {
    const responder = async (corpo: string) => {
      await this.saida.enfileirarAviso({
        organizationId: mensagem.organizationId,
        // Resposta de comando não pertence a chamado nenhum.
        ticketId: null,
        channel: 'WHATSAPP',
        para: telefone,
        // A resposta sai pela conta em que a pessoa falou. Sem isto, uma
        // organização com Meta **e** Evolution responderia sempre pela
        // Meta — e quem escreveu no número antigo receberia de um
        // número que, para ele, é de outra empresa.
        channelAccountId: mensagem.channelAccountId,
        corpo,
      });
      await this.descartar(mensagem.id, `Comando "${comando.tipo}" respondido.`);
    };

    const abertos = await this.prisma.ticket.findMany({
      where: {
        organizationId: mensagem.organizationId,
        status: { not: 'FECHADO' },
        actors: { some: { contactId, role: 'REQUERENTE' } },
      },
      include: { commitments: { where: { achievedAt: null }, take: 1 } },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    switch (comando.tipo) {
      case 'MENU':
        await responder(montarMenu());
        return true;

      case 'STATUS':
        await responder(montarStatus(abertos, comando.numero));
        return true;

      case 'FECHAR': {
        const alvo = abertos.find((t) => t.number === comando.numero);
        if (!alvo) {
          await responder(
            `Não encontrei o chamado ${ticketTag(comando.numero)} entre os seus abertos. ` +
              'Mande *status* para ver a lista.',
          );
          return true;
        }

        await this.prisma.$transaction([
          this.prisma.ticket.update({
            where: { id: alvo.id },
            data: { status: 'FECHADO', closedAt: new Date() },
          }),
          this.prisma.ticketEvent.create({
            data: {
              ticketId: alvo.id,
              type: 'MUDANCA_STATUS',
              visibility: 'PUBLICA',
              authorContactId: contactId,
              channel: 'WHATSAPP',
              payload: { type: 'MUDANCA_STATUS', from: alvo.status, to: 'FECHADO' },
            },
          }),
        ]);

        await responder(`Chamado ${ticketTag(alvo.number)} encerrado. Obrigado!`);
        return true;
      }

      case 'ATENDENTE': {
        const alvo = abertos[0];
        if (!alvo) return false;

        await this.prisma.ticketEvent.create({
          data: {
            ticketId: alvo.id,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            channel: 'SISTEMA',
            body: 'O solicitante pediu atendimento humano pelo WhatsApp.',
          },
        });

        await responder(
          'Avisei a equipe que você quer falar com uma pessoa. ' +
            `Alguém responde neste chamado ${ticketTag(alvo.number)}.`,
        );
        return true;
      }

      case 'NOVO':
        // "novo" só anuncia a intenção; o chamado nasce da próxima
        // mensagem, que é onde está o problema.
        await responder('Certo. Me conte o que está acontecendo e eu abro um chamado novo.');
        return true;

      default:
        return false;
    }
  }

  /**
   * Manda uma lista de toque — e a mesma coisa escrita.
   *
   * As duas juntas, sempre: a lista é o que a Meta desenha, e o texto é
   * o que sai pela Evolution, o que fica no banco e o que a tela de
   * diagnóstico mostra. Um `payload` sem texto equivalente seria uma
   * mensagem que ninguém consegue ler depois.
   */
  private async responderComLista(
    mensagem: { organizationId: string; channelAccountId: string },
    telefone: string,
    lista: ListaInterativa,
  ): Promise<void> {
    await this.saida.enfileirarAviso({
      organizationId: mensagem.organizationId,
      ticketId: null,
      channel: 'WHATSAPP',
      para: telefone,
      channelAccountId: mensagem.channelAccountId,
      corpo: listaEmTexto(lista),
      lista,
    });
  }

  /** O menu, para quem só cumprimentou ou pediu ajuda. */
  private async oferecerMenu(
    mensagem: { id: string; organizationId: string; channelAccountId: string },
    contactId: string,
    telefone: string,
  ): Promise<void> {
    const abertos = await this.prisma.ticket.count({
      where: {
        organizationId: mensagem.organizationId,
        status: { not: 'FECHADO' },
        actors: { some: { contactId, role: 'REQUERENTE' } },
      },
    });

    await this.responderComLista(mensagem, telefone, menuDeToque(abertos > 0));
    await this.descartar(mensagem.id, 'Cumprimento: ofereci o menu.');
  }

  /**
   * "Para qual empresa é este chamado?"
   *
   * O bot anota que perguntou — é a única coisa que ele precisa lembrar
   * entre uma mensagem e outra. Tudo o mais que ele pergunta volta
   * respondido dentro do próprio toque.
   */
  private async pedirEmpresa(
    mensagem: { id: string; organizationId: string; channelAccountId: string },
    telefone: string,
    empresas: { id: string; nome: string }[],
  ): Promise<void> {
    await this.bot.anotar({
      organizationId: mensagem.organizationId,
      channelAccountId: mensagem.channelAccountId,
      telefone,
      aguardando: 'EMPRESA',
    });

    await this.responderComLista(mensagem, telefone, listaDeEmpresas(empresas));
    await this.descartar(mensagem.id, `Número em ${empresas.length} empresas: perguntei qual.`);
  }

  /**
   * O que a pessoa tocou na lista.
   *
   * Cada ramo termina em `descartar`: o toque **não** é conteúdo de
   * chamado. Gravá-lo como mensagem encheria a conversa de "Abrir um
   * chamado" e "Ver meus chamados" ditos pelo cliente.
   */
  private async tratarToque(
    mensagem: Prisma.InboundMessageGetPayload<{ include: { channelAccount: true } }>,
    contactId: string,
    telefone: string,
    toque: NonNullable<ReturnType<typeof interpretarToque>>,
  ): Promise<void> {
    const conta = mensagem.channelAccount;

    const responder = async (corpo: string) => {
      await this.saida.enfileirarAviso({
        organizationId: mensagem.organizationId,
        ticketId: null,
        channel: 'WHATSAPP',
        para: telefone,
        channelAccountId: conta.id,
        corpo,
      });
    };

    switch (toque.tipo) {
      case 'EMPRESA': {
        // O id veio da lista que **nós** mandamos, mas chega de fora:
        // conferir que a empresa é desta organização e que este número
        // tem vínculo com ela é a mesma cerca de sempre (CLAUDE.md,
        // regra 3). Sem isso, um id trocado abriria chamado na empresa
        // de outro cliente.
        const pessoa = await this.bot.pessoaDaEmpresa(
          mensagem.organizationId,
          telefone,
          toque.clientId,
        );

        if (!pessoa) {
          await responder('Não reconheci essa empresa. Me conte o que precisa que eu resolvo.');
          await this.descartar(mensagem.id, 'Toque de empresa sem vínculo com este número.');
          return;
        }

        const empresa = await this.prisma.client.findFirst({
          where: { id: toque.clientId, organizationId: mensagem.organizationId },
          select: { name: true },
        });

        await this.bot.anotar({
          organizationId: mensagem.organizationId,
          channelAccountId: conta.id,
          telefone,
          clientId: toque.clientId,
          aguardando: 'ASSUNTO',
        });

        await responder(
          `Certo, ${empresa?.name ?? 'sua empresa'}. Me conte o que está acontecendo.`,
        );
        await this.descartar(mensagem.id, 'Empresa escolhida pelo toque.');
        return;
      }

      case 'NOVO': {
        const quem = await this.bot.identificar(mensagem.organizationId, telefone);

        if (quem.empresas.length > 1) {
          await this.pedirEmpresa(mensagem, telefone, quem.empresas);
          return;
        }

        await this.bot.anotar({
          organizationId: mensagem.organizationId,
          channelAccountId: conta.id,
          telefone,
          clientId: quem.empresas[0]?.id ?? null,
          aguardando: 'ASSUNTO',
        });

        await responder('Certo. Me conte o que está acontecendo e eu abro um chamado.');
        await this.descartar(mensagem.id, 'Toque: abrir chamado.');
        return;
      }

      case 'STATUS': {
        const abertos = await this.prisma.ticket.findMany({
          where: {
            organizationId: mensagem.organizationId,
            status: { not: 'FECHADO' },
            actors: { some: { contactId, role: 'REQUERENTE' } },
          },
          include: { commitments: { where: { achievedAt: null }, take: 1 } },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        });

        // Com mais de um, a lista de toque vale mais que o texto: a
        // pessoa escolhe sem digitar número de chamado.
        if (abertos.length > 1) {
          await this.responderComLista(
            mensagem,
            telefone,
            listaDeChamados(
              abertos.map((c) => ({
                number: c.number,
                subject: c.subject,
                status: montarStatus([c]).split('\n')[1] ?? '',
              })),
              'Estes são os seus chamados abertos. Toque em um para falar sobre ele.',
            ),
          );
          await this.descartar(mensagem.id, 'Toque: status (lista).');
          return;
        }

        await responder(montarStatus(abertos));
        await this.descartar(mensagem.id, 'Toque: status.');
        return;
      }

      case 'ATENDENTE': {
        const alvo = await this.prisma.ticket.findFirst({
          where: {
            organizationId: mensagem.organizationId,
            status: { not: 'FECHADO' },
            actors: { some: { contactId, role: 'REQUERENTE' } },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, number: true },
        });

        if (!alvo) {
          // Sem chamado aberto não há onde avisar a equipe. Vira o fluxo
          // de abrir: o pedido de falar com gente é, ele mesmo, o
          // chamado.
          await this.bot.anotar({
            organizationId: mensagem.organizationId,
            channelAccountId: conta.id,
            telefone,
            aguardando: 'ASSUNTO',
          });
          await responder(
            'Claro. Me conte em uma frase do que se trata e eu já chamo alguém da equipe.',
          );
          await this.descartar(mensagem.id, 'Toque: atendente, sem chamado aberto.');
          return;
        }

        await this.prisma.ticketEvent.create({
          data: {
            ticketId: alvo.id,
            type: 'NOTA_INTERNA',
            visibility: 'INTERNA',
            channel: 'SISTEMA',
            body: 'O solicitante pediu atendimento humano pelo WhatsApp.',
          },
        });

        await responder(
          'Avisei a equipe que você quer falar com uma pessoa. ' +
            `Alguém responde neste chamado ${ticketTag(alvo.number)}.`,
        );
        await this.descartar(mensagem.id, 'Toque: atendente.');
        return;
      }

      case 'CHAMADO': {
        const alvo = await this.prisma.ticket.findFirst({
          where: {
            organizationId: mensagem.organizationId,
            number: toque.numero,
            status: { not: 'FECHADO' },
            actors: { some: { contactId, role: 'REQUERENTE' } },
          },
          select: { id: true, number: true, subject: true },
        });

        if (!alvo) {
          await responder('Esse chamado não está mais aberto. Me conte o que precisa.');
          await this.descartar(mensagem.id, 'Toque num chamado que não está aberto.');
          return;
        }

        await responder(`${ticketTag(alvo.number)} ${alvo.subject}\n\nPode mandar. Estou ouvindo.`);

        // A marca faz a janela de conversa apontar para ele na próxima
        // mensagem, que é como a escolha "gruda".
        await this.prisma.ticket.update({
          where: { id: alvo.id },
          data: { updatedAt: new Date() },
        });

        await this.descartar(mensagem.id, `Toque no chamado #${alvo.number}.`);
        return;
      }
    }
  }

  private async perguntarQualChamado(
    mensagem: { id: string; organizationId: string; channelAccountId: string },
    telefone: string,
    ticketIds: string[],
  ): Promise<void> {
    const chamados = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { number: true, subject: true },
      orderBy: { updatedAt: 'desc' },
    });

    // Lista de toque: a pessoa escolhe sem digitar número de chamado.
    // O texto embaixo continua sendo a mesma coisa escrita, com a
    // instrução de responder com o número — é o que sai pela Evolution,
    // que não desenha lista.
    const lista = listaDeChamados(
      chamados.map((c) => ({ number: c.number, subject: c.subject, status: '' })),
    );

    const escrita = chamados.map((c) => `${ticketTag(c.number)} ${c.subject}`).join('\n');

    await this.saida.enfileirarAviso({
      organizationId: mensagem.organizationId,
      ticketId: null,
      channel: 'WHATSAPP',
      para: telefone,
      channelAccountId: mensagem.channelAccountId,
      lista,
      corpo:
        `Você tem ${chamados.length} chamados abertos:\n\n${escrita}\n\n` +
        'Responda com o número (por exemplo: *#' +
        `${chamados[0]!.number}*) para falar sobre ele, ou *novo* para abrir outro.`,
    });

    await this.descartar(mensagem.id, 'Mais de um chamado aberto: pedi desambiguação.');
  }

  /**
   * Transcreve o áudio recebido, quando houver.
   *
   * Lê o arquivo já guardado — não o baixa de novo. Devolve `null` em
   * tudo que não for áudio e em qualquer falha: o chamado abre com o
   * áudio anexado exatamente como antes de existir transcrição.
   */
  private async transcreverSeForAudio(midia: AnexoRecebido | null): Promise<string | null> {
    if (!midia || !this.transcricao.habilitada) return null;
    if (!this.transcricao.ehAudio(midia.contentType)) return null;

    try {
      // `ler` devolve um `Readable` — o driver de disco e o do MinIO
      // transmitem. Aqui o áudio inteiro precisa ir junto para o modelo.
      const fluxo = await this.armazenamento.ler(midia.storageKey);
      const pedacos: Buffer[] = [];
      for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco as Buffer));

      return await this.transcricao.transcrever(Buffer.concat(pedacos), midia.contentType);
    } catch (erro) {
      this.logger.warn(`Não consegui ler o áudio para transcrever: ${(erro as Error).message}`);
      return null;
    }
  }

  /**
   * Busca o binário da mídia recebida — pela Evolution ou pela Meta.
   *
   * Os dois provedores mandam só uma referência no webhook; o arquivo
   * vem num segundo pedido. Na Evolution a referência é o próprio id da
   * mensagem e o retorno é base64; na Meta é um `media_id` que vira uma
   * URL assinada, e **essa URL também exige o token** — o que surpreende
   * quem esperava um link público e devolve 401 numa URL que parece
   * aberta.
   *
   * A falha é sempre `null`, nunca exceção: mídia que não baixou não
   * pode impedir a mensagem de virar chamado. O texto chega, e o
   * atendente pede o arquivo de novo se precisar.
   */
  private async baixarMidiaSeHouver(
    mensagem: { externalId: string; organizationId: string; rawHeaders: Prisma.JsonValue | null },
    config: {
      baseUrl?: string;
      instance?: string;
      apiKey?: string;
      maxAttachmentBytes?: number;
      phoneNumberId?: string;
      token?: string;
      versao?: string;
    },
  ): Promise<AnexoRecebido | null> {
    const cabecalhos = mensagem.rawHeaders as {
      messageType?: string;
      provedor?: string;
      midia?: { id?: string; mimeType?: string; filename?: string } | null;
    } | null;

    const limite = config.maxAttachmentBytes ?? 16 * 1024 * 1024;

    try {
      let conteudo: Buffer;
      let mimetype: string;
      let nome: string;

      if (cabecalhos?.provedor === 'META') {
        const referencia = cabecalhos.midia;
        if (!referencia?.id || !config.phoneNumberId || !config.token) return null;

        const midia = await this.meta.baixarMidia(
          {
            phoneNumberId: config.phoneNumberId,
            token: config.token,
            versao: config.versao,
          },
          referencia.id,
        );

        conteudo = midia.bytes;
        mimetype = referencia.mimeType ?? midia.mimeType;
        nome = referencia.filename ?? ProcessamentoService.nomeDeMidia(mimetype, referencia.id);
      } else {
        const tipo = cabecalhos?.messageType;
        const ehMidia =
          tipo === 'imageMessage' ||
          tipo === 'documentMessage' ||
          tipo === 'audioMessage' ||
          tipo === 'videoMessage';

        if (!ehMidia || !config.baseUrl || !config.apiKey || !config.instance) return null;

        const midia = await this.evolution.baixarMidia(
          { baseUrl: config.baseUrl, instance: config.instance, apiKey: config.apiKey },
          mensagem.externalId,
        );

        conteudo = Buffer.from(midia.base64, 'base64');
        mimetype = midia.mimetype;
        nome = midia.fileName ?? `whatsapp-${mensagem.externalId.slice(0, 8)}`;
      }

      if (conteudo.length > limite) {
        this.logger.warn(`Mídia de ${mensagem.externalId} acima do limite; ignorada.`);
        return null;
      }

      const { createHash, randomUUID } = await import('node:crypto');
      const checksum = createHash('sha256').update(conteudo).digest('hex');
      const chave = `${mensagem.organizationId}/entrada/${randomUUID()}-${nome}`;

      await this.armazenamento.guardar(chave, conteudo, mimetype);

      return {
        storageKey: chave,
        filename: nome,
        contentType: mimetype,
        sizeBytes: conteudo.length,
        checksum: `sha256:${checksum}`,
      };
    } catch (erro) {
      this.logger.warn(
        `Não consegui baixar a mídia de ${mensagem.externalId}: ${(erro as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Um nome de arquivo para a mídia que veio sem nome.
   *
   * Foto e áudio do WhatsApp não têm nome — só documento tem. Sem isto,
   * o anexo na tela do chamado se chamaria pelo id da Meta, que não
   * conta nada a ninguém, e o navegador não saberia o que fazer ao
   * baixar.
   */
  private static nomeDeMidia(mimetype: string, id: string): string {
    const extensao =
      {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'audio/ogg': 'ogg',
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/amr': 'amr',
        'video/mp4': 'mp4',
        'application/pdf': 'pdf',
      }[mimetype.split(';')[0]!.trim()] ?? 'bin';

    const rotulo = mimetype.startsWith('audio/')
      ? 'audio'
      : mimetype.startsWith('image/')
        ? 'foto'
        : mimetype.startsWith('video/')
          ? 'video'
          : 'arquivo';

    return `${rotulo}-whatsapp-${id.slice(-8)}.${extensao}`;
  }

  // -------------------------------------------------------------------
  // Comum
  // -------------------------------------------------------------------

  /**
   * Acha ou cria o contato.
   *
   * É assim que quem escreve de fora entra no chamado sem ter conta: o
   * `Contact` é a pessoa conhecida por e-mail ou telefone, e vira
   * usuário só se alguém a cadastrar.
   */
  private async resolverContato(
    organizationId: string,
    quem: { email?: string; telefone?: string; nome?: string },
  ): Promise<{ id: string }> {
    const email = quem.email?.toLowerCase().trim();
    const phone = quem.telefone?.trim();

    const existente = await this.prisma.contact.findFirst({
      where: {
        organizationId,
        ...(email ? { email } : {}),
        ...(phone && !email ? { phone } : {}),
      },
    });

    if (existente) {
      // O nome do WhatsApp (`pushName`) só chega junto da mensagem;
      // aproveitamos a primeira vez que ele aparece.
      if (!existente.name && quem.nome) {
        await this.prisma.contact.update({
          where: { id: existente.id },
          data: { name: quem.nome },
        });
      }
      return existente;
    }

    return this.prisma.contact.create({
      data: { organizationId, email, phone, name: quem.nome },
    });
  }

  private async vincularAnexos(
    ticketId: string,
    eventId: string,
    anexos: AnexoRecebido[],
    _organizationId: string,
  ): Promise<void> {
    for (const anexo of anexos) {
      await this.prisma.attachment.create({
        data: {
          ticketId,
          eventId,
          filename: anexo.filename,
          contentType: anexo.contentType,
          sizeBytes: anexo.sizeBytes,
          storageKey: anexo.storageKey,
          checksum: anexo.checksum,
        },
      });
    }
  }

  /** O aviso de que o chamado foi aberto, pelo canal em que ele nasceu. */
  private async avisarAbertura(
    organizationId: string,
    chamado: { id: string; number: number },
    canal: Channel,
    para: string,
    channelAccountId?: string,
  ): Promise<void> {
    const corpo =
      canal === 'WHATSAPP'
        ? `${ticketTag(chamado.number)} Chamado aberto! Vamos responder por aqui mesmo. ` +
          'Mande *status* quando quiser acompanhar.'
        : `Recebemos a sua mensagem e abrimos o chamado ${ticketTag(chamado.number)}. ` +
          'Basta responder a este e-mail para acrescentar informação.';

    await this.saida.enfileirarAviso({
      organizationId,
      ticketId: chamado.id,
      channel: canal,
      para,
      channelAccountId,
      corpo,
    });
  }
}
