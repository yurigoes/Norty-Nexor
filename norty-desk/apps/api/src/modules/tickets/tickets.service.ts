import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  type Channel,
  type Paginated,
  type Scale,
  type TicketDetail,
  type TicketType,
  type TicketEventView,
  type TicketListItem,
  type TicketStatus,
  canTransition,
} from '@norty-desk/shared';
import { Prisma } from '@prisma/client';

import type { UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { derivarPrioridade } from '../../common/prioridade';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SaidaService } from '../channels/saida.service';
import { FormulariosService } from '../formularios/formularios.service';
import { SatisfacaoService } from '../satisfacao/satisfacao.service';
import type { EventoDeWebhook } from '../webhooks/eventos';
import { WebhooksService } from '../webhooks/webhooks.service';
import { SlaService } from '../sla/sla.service';
import { escopoDeLeitura } from './tickets.escopo';
import {
  INCLUDE_DETALHE,
  INCLUDE_EVENTO,
  INCLUDE_LISTA,
  paraDetalhe,
  paraEvento,
  paraLista,
} from './tickets.serializador';
import type {
  AtribuirDto,
  ClassificarDto,
  CriarChamadoDto,
  FiltroFilaDto,
  ParteDto,
  ResponderDto,
  VincularDto,
} from './dto';

/** O cursor é opaco de propósito: hoje é um id, amanhã pode ser outra coisa. */
function paraCursor(id: string): string {
  return Buffer.from(id, 'utf8').toString('base64url');
}
function doCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64url').toString('utf8');
}

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    @Inject(forwardRef(() => SaidaService)) private readonly saida: SaidaService,
    @Inject(forwardRef(() => SatisfacaoService)) private readonly satisfacao: SatisfacaoService,
    private readonly webhooks: WebhooksService,
    private readonly formularios: FormulariosService,
  ) {}

  /**
   * Avisa quem assinou o evento.
   *
   * Nunca lança: um webhook mal configurado não pode derrubar a ação
   * que o gerou. O chamado abre; a entrega falha e fica no log.
   */
  private async avisarAssinantes(
    organizationId: string,
    evento: EventoDeWebhook,
    ticketId: string,
  ): Promise<void> {
    const chamado = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        type: true,
        priority: true,
        urgency: true,
        impact: true,
        originChannel: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
      },
    });

    if (chamado) await this.webhooks.emitir(organizationId, evento, chamado);
  }

  // -------------------------------------------------------------------
  // Leitura
  // -------------------------------------------------------------------

  /**
   * A fila.
   *
   * O escopo do perfil entra por cima dos filtros, sempre — autorização
   * diz se a rota abre, escopo diz quais linhas voltam
   * (`docs/04-rbac.md`, seção 3).
   */
  async listar(
    usuario: UsuarioAutenticado,
    filtro: FiltroFilaDto,
  ): Promise<Paginated<TicketListItem>> {
    const limite = Math.min(filtro.limit ?? 50, 200);
    const where: Prisma.TicketWhereInput = {
      AND: [escopoDeLeitura(usuario), this.filtros(usuario, filtro)],
    };

    const chamados = await this.prisma.ticket.findMany({
      where,
      include: INCLUDE_LISTA,
      // O `id` fecha a ordenação: sem um critério único no fim, dois
      // chamados de mesma prioridade e mesma data podem trocar de lugar
      // entre páginas e um deles some.
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: limite + 1,
      ...(filtro.cursor ? { cursor: { id: doCursor(filtro.cursor) }, skip: 1 } : {}),
    });

    const temMais = chamados.length > limite;
    const pagina = temMais ? chamados.slice(0, limite) : chamados;

    return {
      data: pagina.map(paraLista),
      nextCursor: temMais ? paraCursor(pagina[pagina.length - 1]!.id) : null,
    };
  }

  private filtros(usuario: UsuarioAutenticado, filtro: FiltroFilaDto): Prisma.TicketWhereInput {
    const where: Prisma.TicketWhereInput = {};

    if (filtro.status?.length) where.status = { in: filtro.status };
    if (filtro.type) where.type = filtro.type;
    if (filtro.priority?.length) where.priority = { in: filtro.priority };
    if (filtro.channel?.length) where.originChannel = { in: filtro.channel };
    if (filtro.categoryId) where.categoryId = filtro.categoryId;

    if (filtro.assignedTeamId) {
      where.actors = { some: { role: 'ATRIBUIDO', teamId: filtro.assignedTeamId } };
    }

    if (filtro.assignedUserId) {
      const id = filtro.assignedUserId === 'me' ? usuario.userId : filtro.assignedUserId;
      where.actors = { some: { role: 'ATRIBUIDO', userId: id } };
    }

    if (filtro.requesterId) {
      const id = filtro.requesterId === 'me' ? usuario.userId : filtro.requesterId;
      where.actors = { some: { role: 'REQUERENTE', userId: id } };
    }

    if (filtro.semAtribuicao) {
      where.actors = { none: { role: 'ATRIBUIDO' } };
    }

    // "SLA estourado" e "vence antes de" olham só o que ainda corre:
    // compromisso cumprido não é problema de ninguém.
    if (filtro.slaBreached) {
      where.commitments = { some: { achievedAt: null, dueAt: { lt: new Date() } } };
    }
    if (filtro.slaDueBefore) {
      where.commitments = {
        some: { achievedAt: null, dueAt: { lt: new Date(filtro.slaDueBefore) } },
      };
    }

    if (filtro.q) {
      const texto = filtro.q.trim();
      const numero = Number(texto.replace('#', ''));
      where.OR = [
        { subject: { contains: texto, mode: 'insensitive' } },
        { description: { contains: texto, mode: 'insensitive' } },
        ...(Number.isInteger(numero) && numero > 0 ? [{ number: numero }] : []),
      ];
    }

    return where;
  }

  /** 404, não 403, quando o chamado existe mas está fora do escopo. */
  async obter(usuario: UsuarioAutenticado, id: string): Promise<TicketDetail> {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id }] },
      include: INCLUDE_DETALHE,
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return paraDetalhe(chamado);
  }

  /**
   * A timeline.
   *
   * Quem não pode ver nota interna não recebe nota interna — o filtro é
   * de consulta, não de renderização. Um cliente curioso que chame a API
   * direto recebe a mesma coisa que a tela mostra.
   */
  async eventos(
    usuario: UsuarioAutenticado,
    id: string,
    limite = 100,
  ): Promise<TicketEventView[]> {
    await this.obter(usuario, id);

    const podeVerInterno = usuario.role !== 'SOLICITANTE';

    const eventos = await this.prisma.ticketEvent.findMany({
      where: {
        ticketId: id,
        ...(podeVerInterno ? {} : { visibility: 'PUBLICA' }),
      },
      include: INCLUDE_EVENTO,
      orderBy: { createdAt: 'asc' },
      take: limite,
    });

    return eventos.map(paraEvento);
  }

  // -------------------------------------------------------------------
  // Abertura
  // -------------------------------------------------------------------

  /**
   * Prioridade é derivada, nunca digitada (CLAUDE.md, regra 7).
   * Este é o único ponto do sistema que escreve em `Ticket.priority`.
   */
  async derivarPrioridade(organizationId: string, urgency: Scale, impact: Scale): Promise<Scale> {
    return derivarPrioridade(this.prisma, organizationId, urgency, impact);
  }

  /**
   * Aloca o próximo número da organização.
   *
   * `MAX(number) + 1` corre sob concorrência: duas aberturas simultâneas
   * pegam o mesmo número e uma viola o `@@unique`. O bloqueio consultivo
   * serializa só as aberturas da mesma organização, e some no fim da
   * transação.
   */
  private async proximoNumero(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<number> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    const [linha] = await tx.$queryRaw<{ proximo: number }[]>`
      SELECT COALESCE(MAX(number), 0) + 1 AS proximo
      FROM tickets WHERE "organizationId" = ${organizationId}::uuid
    `;
    return Number(linha?.proximo ?? 1);
  }

  /**
   * Resolve a parte informada num alvo de ator.
   *
   * Contato por e-mail ou telefone é criado se não existir: é assim que
   * quem escreve de fora entra no chamado sem ter conta
   * (`docs/03-modelo-de-dados.md`, tabela de rastreabilidade).
   */
  private async resolverParte(
    tx: Prisma.TransactionClient,
    organizationId: string,
    parte: ParteDto,
  ): Promise<Prisma.TicketActorUncheckedCreateWithoutTicketInput> {
    if (parte.kind === 'USER') {
      if (!parte.id) throw new BadRequestException('Informe o id do usuário.');
      const vinculo = await tx.membership.findUnique({
        where: { userId_organizationId: { userId: parte.id, organizationId } },
      });
      if (!vinculo) throw new BadRequestException('Usuário sem vínculo com esta organização.');
      return { role: 'REQUERENTE', userId: parte.id };
    }

    if (parte.kind === 'TEAM') {
      if (!parte.id) throw new BadRequestException('Informe o id do time.');
      const time = await tx.team.findFirst({ where: { id: parte.id, organizationId } });
      if (!time) throw new BadRequestException('Time não encontrado nesta organização.');
      return { role: 'ATRIBUIDO', teamId: parte.id };
    }

    if (parte.kind === 'SUPPLIER') {
      if (!parte.id) throw new BadRequestException('Informe o id do fornecedor.');
      return { role: 'OBSERVADOR', supplierId: parte.id };
    }

    const email = parte.email?.toLowerCase().trim();
    const phone = parte.phone?.trim();
    if (!parte.id && !email && !phone) {
      throw new BadRequestException('Contato precisa de id, e-mail ou telefone.');
    }

    if (parte.id) return { role: 'REQUERENTE', contactId: parte.id };

    const existente = await tx.contact.findFirst({
      where: { organizationId, ...(email ? { email } : { phone }) },
    });

    const contato =
      existente ??
      (await tx.contact.create({
        data: { organizationId, name: parte.name, email, phone },
      }));

    return { role: 'REQUERENTE', contactId: contato.id };
  }

  async abrir(
    usuario: UsuarioAutenticado,
    dto: CriarChamadoDto,
  ): Promise<TicketDetail> {
    const urgency = (dto.urgency ?? 3) as Scale;
    const impact = (dto.impact ?? 3) as Scale;
    const priority = await this.derivarPrioridade(usuario.organizationId, urgency, impact);

    const categoria = dto.categoryId
      ? await this.prisma.category.findFirst({
          where: { id: dto.categoryId, organizationId: usuario.organizationId },
          include: { defaultAgreements: { where: { isActive: true }, select: { id: true } } },
        })
      : null;

    if (dto.categoryId && !categoria) {
      throw new BadRequestException('Categoria não encontrada nesta organização.');
    }

    // O formulário vem da categoria, e as respostas são conferidas
    // contra o schema dele. Sem isto, `customFields` era JSON livre:
    // campo obrigatório em branco e chave inventada entravam iguais.
    const formulario = await this.formularios.validarAbertura(
      usuario.organizationId,
      usuario.role,
      categoria?.id,
      dto.customFields,
    );

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.proximoNumero(tx, usuario.organizationId);

      const atores: Prisma.TicketActorUncheckedCreateWithoutTicketInput[] = [];

      // Sem requerente informado, quem abre é quem pede. É o caso do
      // portal, e é o padrão que evita chamado órfão.
      atores.push(
        dto.requester
          ? { ...(await this.resolverParte(tx, usuario.organizationId, dto.requester)), role: 'REQUERENTE' }
          : { role: 'REQUERENTE', userId: usuario.userId },
      );

      for (const observador of dto.observers ?? []) {
        atores.push({
          ...(await this.resolverParte(tx, usuario.organizationId, observador)),
          role: 'OBSERVADOR',
        });
      }

      // A categoria carrega o time que atende. Cai na fila certa sem o
      // agente precisar distribuir na mão.
      if (categoria?.defaultTeamId) {
        atores.push({ role: 'ATRIBUIDO', teamId: categoria.defaultTeamId });
      }

      const chamado = await tx.ticket.create({
        data: {
          organizationId: usuario.organizationId,
          number,
          subject: dto.subject.trim(),
          description: dto.description,
          type: dto.type ?? 'INCIDENTE',
          status: categoria?.defaultTeamId ? 'ATRIBUIDO' : 'NOVO',
          urgency,
          impact,
          priority,
          categoryId: categoria?.id,
          formId: formulario.formId,
          originChannel: 'WEB',
          customFields: (formulario.customFields as Prisma.InputJsonValue) ?? undefined,
          actors: { create: atores },
        },
        select: { id: true },
      });

      return chamado.id;
    });

    // Os acordos vêm da categoria: TTO e TTR (e os internos, quando
    // houver) nascem com o chamado, não numa segunda chamada que alguém
    // pode esquecer de fazer.
    if (categoria?.defaultAgreements.length) {
      await this.sla.aplicarAcordos(
        id,
        categoria.defaultAgreements.map((a) => a.id),
      );
    }

    await this.avisarAssinantes(usuario.organizationId, 'ticket.criado', id);

    return this.obter(usuario, id);
  }

  /**
   * Abertura por canal externo.
   *
   * Não há usuário autenticado: quem escreveu é um `Contact`, e o
   * chamado nasce com o canal de origem marcado. É o mesmo caso de uso
   * de `abrir()` — o adaptador de canal traduz e sai, sem regra de
   * negócio própria (`docs/06-canais.md`).
   */
  async abrirPorCanal(dados: {
    organizationId: string;
    contactId: string;
    channel: Channel;
    subject: string;
    description: string;
    /** Time padrão do canal, quando a conta define um. */
    teamId?: string | null;
    /** O que as regras de entrada decidiram. */
    categoryId?: string;
    urgency?: Scale;
    impact?: Scale;
    ticketType?: TicketType;
    agreementIds?: string[];
    regrasAplicadas?: string[];
  }): Promise<{ id: string; number: number }> {
    // Sem categoria e sem regra que classifique, o chamado nasce sem
    // categoria: melhor sem do que na primeira que apareceu.
    const urgency = dados.urgency ?? (3 as Scale);
    const impact = dados.impact ?? (3 as Scale);
    const priority = await this.derivarPrioridade(dados.organizationId, urgency, impact);

    // A categoria pode trazer time e acordos próprios; a regra ganha
    // dela quando decide explicitamente.
    const categoria = dados.categoryId
      ? await this.prisma.category.findFirst({
          where: { id: dados.categoryId, organizationId: dados.organizationId },
          include: { defaultAgreements: { where: { isActive: true }, select: { id: true } } },
        })
      : null;

    const timeFinal = dados.teamId ?? categoria?.defaultTeamId ?? null;
    const acordos =
      dados.agreementIds?.length
        ? dados.agreementIds
        : (categoria?.defaultAgreements.map((a) => a.id) ?? []);

    const chamado = await this.prisma.$transaction(async (tx) => {
      const number = await this.proximoNumero(tx, dados.organizationId);

      return tx.ticket.create({
        data: {
          organizationId: dados.organizationId,
          number,
          subject: dados.subject.slice(0, 255),
          description: dados.description,
          type: dados.ticketType ?? 'INCIDENTE',
          status: timeFinal ? 'ATRIBUIDO' : 'NOVO',
          urgency,
          impact,
          priority,
          categoryId: categoria?.id,
          originChannel: dados.channel,
          actors: {
            create: [
              { role: 'REQUERENTE', contactId: dados.contactId },
              ...(timeFinal ? [{ role: 'ATRIBUIDO' as const, teamId: timeFinal }] : []),
            ],
          },
        },
        select: { id: true, number: true },
      });
    });

    if (acordos.length) await this.sla.aplicarAcordos(chamado.id, acordos);

    // Quais regras classificaram fica registrado: sem isso, ninguém
    // consegue explicar por que o chamado caiu naquela fila.
    if (dados.regrasAplicadas?.length) {
      await this.prisma.ticketEvent.create({
        data: {
          ticketId: chamado.id,
          type: 'MUDANCA_CLASSIFICACAO',
          visibility: 'INTERNA',
          channel: 'SISTEMA',
          body: `Classificado pelas regras de entrada: ${dados.regrasAplicadas.join(', ')}.`,
        },
      });
    }

    return chamado;
  }

  /**
   * Chamado aberto por uma agenda de recorrência.
   *
   * O requerente é um usuário, não um contato: manutenção preventiva
   * tem dono dentro de casa. O canal é `SISTEMA` — ninguém escreveu
   * este chamado, e marcar `WEB` faria a resposta tentar sair por um
   * canal que nunca existiu.
   *
   * Passa pelo mesmo `proximoNumero`, pela mesma matriz de prioridade e
   * pelos mesmos acordos da categoria que qualquer outro chamado: a
   * agenda decide *quando*, não *como*.
   */
  async abrirRecorrente(dados: {
    organizationId: string;
    recurringTicketId: string;
    requesterId: string;
    subject: string;
    description: string;
    ticketType: TicketType;
    urgency: Scale;
    impact: Scale;
    categoryId?: string | null;
    teamId?: string | null;
  }): Promise<{ id: string; number: number }> {
    const priority = await this.derivarPrioridade(
      dados.organizationId,
      dados.urgency,
      dados.impact,
    );

    const categoria = dados.categoryId
      ? await this.prisma.category.findFirst({
          where: { id: dados.categoryId, organizationId: dados.organizationId },
          include: { defaultAgreements: { where: { isActive: true }, select: { id: true } } },
        })
      : null;

    const timeFinal = dados.teamId ?? categoria?.defaultTeamId ?? null;
    const acordos = categoria?.defaultAgreements.map((a) => a.id) ?? [];

    const chamado = await this.prisma.$transaction(async (tx) => {
      const number = await this.proximoNumero(tx, dados.organizationId);

      return tx.ticket.create({
        data: {
          organizationId: dados.organizationId,
          number,
          subject: dados.subject.slice(0, 255),
          description: dados.description,
          type: dados.ticketType,
          status: timeFinal ? 'ATRIBUIDO' : 'NOVO',
          urgency: dados.urgency,
          impact: dados.impact,
          priority,
          categoryId: categoria?.id,
          originChannel: 'SISTEMA',
          recurringTicketId: dados.recurringTicketId,
          actors: {
            create: [
              { role: 'REQUERENTE', userId: dados.requesterId },
              ...(timeFinal ? [{ role: 'ATRIBUIDO' as const, teamId: timeFinal }] : []),
            ],
          },
        },
        select: { id: true, number: true },
      });
    });

    if (acordos.length) await this.sla.aplicarAcordos(chamado.id, acordos);

    return chamado;
  }

  /**
   * Resposta vinda de canal externo.
   *
   * Sempre pública e sempre do contato — quem escreve de fora não tem
   * como pedir nota interna, e não deveria.
   */
  async responderPorCanal(dados: {
    ticketId: string;
    contactId: string;
    channel: Channel;
    body: string;
  }): Promise<{ id: string }> {
    const evento = await this.prisma.ticketEvent.create({
      data: {
        ticketId: dados.ticketId,
        type: 'MENSAGEM',
        visibility: 'PUBLICA',
        authorContactId: dados.contactId,
        channel: dados.channel,
        body: dados.body,
      },
      select: { id: true },
    });

    // Resposta do solicitante em chamado solucionado o reabre: se ele
    // ainda tem o que dizer, não estava resolvido.
    const chamado = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: dados.ticketId },
      select: { status: true, pendingSince: true },
    });

    if (chamado.status === 'SOLUCIONADO' || chamado.status === 'PENDENTE') {
      if (chamado.status === 'PENDENTE' && chamado.pendingSince) {
        await this.sla.retomarAposPendencia(dados.ticketId, chamado.pendingSince);
      }

      await this.prisma.$transaction([
        this.prisma.ticket.update({
          where: { id: dados.ticketId },
          data: { status: 'ATRIBUIDO', pendingSince: null, pendingReasonId: null },
        }),
        this.prisma.ticketEvent.create({
          data: {
            ticketId: dados.ticketId,
            type: 'MUDANCA_STATUS',
            visibility: 'PUBLICA',
            channel: 'SISTEMA',
            payload: { type: 'MUDANCA_STATUS', from: chamado.status, to: 'ATRIBUIDO' },
          },
        }),
      ]);
    } else {
      await this.prisma.ticket.update({
        where: { id: dados.ticketId },
        data: { updatedAt: new Date() },
      });
    }

    return evento;
  }

  // -------------------------------------------------------------------
  // Comandos
  // -------------------------------------------------------------------

  private async carregar(usuario: UsuarioAutenticado, id: string) {
    const chamado = await this.prisma.ticket.findFirst({
      where: { AND: [escopoDeLeitura(usuario), { id }] },
      include: { actors: true },
    });
    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  /**
   * Chamado fechado não recebe evento: reabrir primeiro
   * (`docs/04-rbac.md`, seção 6).
   */
  private exigirAberto(status: TicketStatus): void {
    if (status === 'FECHADO') {
      throw new ConflictException('Chamado fechado. Reabra antes de escrever nele.');
    }
  }

  async responder(
    usuario: UsuarioAutenticado,
    id: string,
    dto: ResponderDto,
  ): Promise<TicketEventView> {
    const chamado = await this.carregar(usuario, id);
    this.exigirAberto(chamado.status);

    const interna = dto.visibility === 'INTERNA';

    if (interna && usuario.role === 'SOLICITANTE') {
      throw new ForbiddenException('Solicitante não escreve nota interna.');
    }

    const evento = await this.prisma.ticketEvent.create({
      data: {
        ticketId: id,
        type: interna ? 'NOTA_INTERNA' : 'MENSAGEM',
        visibility: interna ? 'INTERNA' : 'PUBLICA',
        authorId: usuario.userId,
        // Sem canal escolhido, responde pelo canal em que o solicitante
        // falou. É o que impede mandar e-mail para quem escreveu pelo
        // WhatsApp (`docs/06-canais.md`, seção 3).
        channel: interna ? 'WEB' : (dto.channel ?? chamado.originChannel),
        body: dto.body,
      },
      include: INCLUDE_EVENTO,
    });

    await this.prisma.ticket.update({ where: { id }, data: { updatedAt: new Date() } });

    // A resposta pública sai pelo canal em que a pessoa falou. Enfileira
    // e devolve: responder não espera o SMTP.
    await this.saida.enfileirarEventoDoChamado(evento.id);

    // A primeira resposta pública de quem atende cumpre o TTO. A do
    // próprio requerente não conta: responder a si mesmo não é
    // atendimento.
    const ehRequerente = chamado.actors.some(
      (a) => a.role === 'REQUERENTE' && a.userId === usuario.userId,
    );

    if (!interna && !ehRequerente && !chamado.firstResponseAt) {
      await this.prisma.ticket.update({
        where: { id },
        data: { firstResponseAt: evento.createdAt },
      });
      await this.sla.cumprir(id, 'TTO', evento.createdAt);
    }

    return paraEvento(evento);
  }

  async atribuir(usuario: UsuarioAutenticado, id: string, dto: AtribuirDto): Promise<TicketDetail> {
    const chamado = await this.carregar(usuario, id);
    this.exigirAberto(chamado.status);

    if (!dto.teamId && !dto.userId) {
      throw new BadRequestException('Informe um time, um usuário, ou os dois.');
    }

    // Atribuir a si mesmo é permissão à parte: um agente pode puxar
    // chamado para si sem poder distribuir a fila dos outros.
    if (dto.userId && dto.userId !== usuario.userId && usuario.role === 'AGENTE') {
      throw new ForbiddenException('Agente só atribui chamado a si mesmo.');
    }

    const anteriores = chamado.actors.filter((a) => a.role === 'ATRIBUIDO');

    await this.prisma.$transaction(async (tx) => {
      if (dto.teamId) {
        const time = await tx.team.findFirst({
          where: { id: dto.teamId, organizationId: usuario.organizationId },
        });
        if (!time) throw new BadRequestException('Time não encontrado nesta organização.');
      }

      if (dto.userId) {
        const vinculo = await tx.membership.findUnique({
          where: {
            userId_organizationId: { userId: dto.userId, organizationId: usuario.organizationId },
          },
        });
        if (!vinculo) throw new BadRequestException('Usuário sem vínculo com esta organização.');
      }

      await tx.ticketActor.deleteMany({ where: { ticketId: id, role: 'ATRIBUIDO' } });
      await tx.ticketActor.createMany({
        data: [
          ...(dto.teamId ? [{ ticketId: id, role: 'ATRIBUIDO' as const, teamId: dto.teamId }] : []),
          ...(dto.userId ? [{ ticketId: id, role: 'ATRIBUIDO' as const, userId: dto.userId }] : []),
        ],
      });

      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: 'MUDANCA_ATRIBUICAO',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: {
            type: 'MUDANCA_ATRIBUICAO',
            fromTeamId: anteriores.find((a) => a.teamId)?.teamId ?? undefined,
            toTeamId: dto.teamId,
            fromUserId: anteriores.find((a) => a.userId)?.userId ?? undefined,
            toUserId: dto.userId,
          },
        },
      });

      // Atribuir tira o chamado de "Novo": alguém agora é responsável.
      if (chamado.status === 'NOVO') {
        await tx.ticket.update({ where: { id }, data: { status: 'ATRIBUIDO' } });
      }
    });

    return this.obter(usuario, id);
  }

  async classificar(
    usuario: UsuarioAutenticado,
    id: string,
    dto: ClassificarDto,
  ): Promise<TicketDetail> {
    const chamado = await this.carregar(usuario, id);
    this.exigirAberto(chamado.status);

    const urgency = (dto.urgency ?? chamado.urgency) as Scale;
    const impact = (dto.impact ?? chamado.impact) as Scale;
    const priority = await this.derivarPrioridade(usuario.organizationId, urgency, impact);

    if (dto.categoryId) {
      const categoria = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, organizationId: usuario.organizationId },
      });
      if (!categoria) throw new BadRequestException('Categoria não encontrada nesta organização.');
    }

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id },
        data: {
          categoryId: dto.categoryId ?? chamado.categoryId,
          urgency,
          impact,
          priority,
          type: dto.type ?? chamado.type,
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId: id,
          type: 'MUDANCA_CLASSIFICACAO',
          visibility: 'INTERNA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: {
            type: 'MUDANCA_CLASSIFICACAO',
            fromCategoryId: chamado.categoryId ?? undefined,
            toCategoryId: dto.categoryId,
            fromUrgency: chamado.urgency as Scale,
            toUrgency: urgency,
            fromImpact: chamado.impact as Scale,
            toImpact: impact,
          },
        },
      }),
    ]);

    return this.obter(usuario, id);
  }

  /**
   * Muda o status validando a transição.
   *
   * O GLPI permite quase tudo e deixa a coerência para o operador. Aqui
   * a transição inválida é 409, não um chamado em estado impossível.
   */
  async mudarStatus(
    usuario: UsuarioAutenticado,
    id: string,
    destino: TicketStatus,
    corpo?: string,
  ): Promise<TicketDetail> {
    const chamado = await this.carregar(usuario, id);
    const origem = chamado.status as TicketStatus;

    if (origem === destino) return this.obter(usuario, id);

    if (!canTransition(origem, destino)) {
      throw new ConflictException(
        `Um chamado ${origem} não pode ir direto para ${destino}.` +
          (origem === 'FECHADO' ? ' Reabra o chamado primeiro.' : ''),
      );
    }

    const agora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.ticket.update({
        where: { id },
        data: {
          status: destino,
          solvedAt: destino === 'SOLUCIONADO' ? agora : chamado.solvedAt,
          closedAt: destino === 'FECHADO' ? agora : chamado.closedAt,
          // Reabrir zera as marcas de encerramento: o chamado voltou a
          // correr, e um relatório que somasse as duas datas mentiria.
          ...(destino === 'ATRIBUIDO' && origem === 'FECHADO'
            ? { solvedAt: null, closedAt: null }
            : {}),
        },
      });

      if (corpo) {
        await tx.ticketEvent.create({
          data: {
            ticketId: id,
            type: destino === 'SOLUCIONADO' ? 'SOLUCAO' : 'MENSAGEM',
            visibility: 'PUBLICA',
            authorId: usuario.userId,
            channel: chamado.originChannel,
            body: corpo,
            ...(destino === 'SOLUCIONADO'
              ? { payload: { type: 'SOLUCAO', accepted: false } }
              : {}),
          },
        });
      }

      await tx.ticketEvent.create({
        data: {
          ticketId: id,
          type: 'MUDANCA_STATUS',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: { type: 'MUDANCA_STATUS', from: origem, to: destino },
        },
      });
    });

    if (destino === 'SOLUCIONADO' || destino === 'FECHADO') {
      await this.sla.cumprir(id, 'TTR', agora);
    }

    // A pesquisa sai no fechamento, não na solução: entre "resolvido" e
    // "fechado" o cliente ainda pode reabrir, e perguntar como foi o
    // atendimento antes disso é perguntar cedo demais.
    const EVENTO_DO_STATUS: Partial<Record<TicketStatus, EventoDeWebhook>> = {
      SOLUCIONADO: 'ticket.resolvido',
      FECHADO: 'ticket.fechado',
      ATRIBUIDO: origem === 'FECHADO' ? 'ticket.reaberto' : 'ticket.atualizado',
    };

    await this.avisarAssinantes(
      chamado.organizationId,
      EVENTO_DO_STATUS[destino] ?? 'ticket.atualizado',
      id,
    );

    if (destino === 'FECHADO') {
      await this.satisfacao.enviarPara(id).catch((erro: Error) => {
        // Uma pesquisa que não saiu não pode impedir o fechamento do
        // chamado: o trabalho está feito, e o cliente espera a resposta.
        this.logger.warn(`Pesquisa do chamado ${id} não saiu: ${erro.message}`);
      });
    }

    // "Resolvido" com texto é resposta: o solicitante precisa saber
    // pelo canal dele, não abrindo o portal para descobrir.
    if (corpo) {
      const evento = await this.prisma.ticketEvent.findFirst({
        where: { ticketId: id, type: destino === 'SOLUCIONADO' ? 'SOLUCAO' : 'MENSAGEM' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (evento) await this.saida.enfileirarEventoDoChamado(evento.id);
    }

    return this.obter(usuario, id);
  }

  /** Pausa o relógio do SLA com um motivo. */
  async pausar(
    usuario: UsuarioAutenticado,
    id: string,
    pendingReasonId: string,
    corpo?: string,
  ): Promise<TicketDetail> {
    const chamado = await this.carregar(usuario, id);

    if (!canTransition(chamado.status as TicketStatus, 'PENDENTE')) {
      throw new ConflictException(`Um chamado ${chamado.status} não pode ir para PENDENTE.`);
    }

    const motivo = await this.prisma.pendingReason.findFirst({
      where: { id: pendingReasonId, organizationId: usuario.organizationId },
    });
    if (!motivo) throw new BadRequestException('Motivo de pendência não encontrado.');

    const agora = new Date();

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id },
        data: {
          status: 'PENDENTE',
          pendingReasonId,
          pendingSince: agora,
          pendingRemindersSent: 0,
        },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId: id,
          type: 'PAUSA_SLA',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          body: corpo,
          payload: { type: 'PAUSA_SLA', pendingReasonId },
        },
      }),
    ]);

    return this.obter(usuario, id);
  }

  /** Retoma e desconta dos compromissos o tempo parado, em expediente. */
  async retomar(usuario: UsuarioAutenticado, id: string): Promise<TicketDetail> {
    const chamado = await this.carregar(usuario, id);

    if (chamado.status !== 'PENDENTE' || !chamado.pendingSince) {
      throw new ConflictException('O chamado não está pendente.');
    }

    const agora = new Date();
    const descontado = await this.sla.retomarAposPendencia(id, chamado.pendingSince, agora);

    await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id },
        data: { status: 'ATRIBUIDO', pendingSince: null, pendingReasonId: null },
      }),
      this.prisma.ticketEvent.create({
        data: {
          ticketId: id,
          type: 'RETOMADA_SLA',
          visibility: 'PUBLICA',
          authorId: usuario.userId,
          channel: 'WEB',
          payload: { type: 'RETOMADA_SLA', pausedSeconds: descontado },
        },
      }),
    ]);

    return this.obter(usuario, id);
  }

  async vincular(usuario: UsuarioAutenticado, id: string, dto: VincularDto): Promise<TicketDetail> {
    await this.carregar(usuario, id);

    if (dto.targetTicketId === id) {
      throw new BadRequestException('Um chamado não se vincula a si mesmo.');
    }

    const alvo = await this.prisma.ticket.findFirst({
      where: { id: dto.targetTicketId, organizationId: usuario.organizationId },
      select: { id: true },
    });
    if (!alvo) throw new BadRequestException('Chamado de destino não encontrado.');

    await this.prisma.ticketLink.upsert({
      where: {
        sourceId_targetId_type: { sourceId: id, targetId: alvo.id, type: dto.type },
      },
      create: { sourceId: id, targetId: alvo.id, type: dto.type },
      update: {},
    });

    return this.obter(usuario, id);
  }
}
