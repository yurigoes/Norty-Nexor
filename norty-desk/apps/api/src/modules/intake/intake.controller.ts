import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Scale, TicketType } from '@norty-desk/shared';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { PrismaService } from '../../common/prisma/prisma.service';
import { RegrasService } from '../regras/regras.service';
import { TicketsService } from '../tickets/tickets.service';
import { ApiKeyGuard, type AplicacaoAutenticada } from './api-key.guard';

class RequerenteDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

export class IntakeChamadoDto {
  @IsString() @MinLength(3) @MaxLength(255) subject!: string;
  @IsString() @MinLength(1) description!: string;

  @IsOptional() @IsEnum(['INCIDENTE', 'REQUISICAO'] as const) type?: TicketType;
  @IsOptional() @IsInt() @Min(1) @Max(5) urgency?: number;
  @IsOptional() @IsInt() @Min(1) @Max(5) impact?: number;

  /** `Sistemas > Integração`. Criada se não existir. */
  @IsOptional() @IsString() @MaxLength(300) categoryPath?: string;

  @IsOptional() @ValidateNested() @Type(() => RequerenteDto) requester?: RequerenteDto;

  @IsOptional() @IsString() @MaxLength(200) externalRef?: string;
}

export class IntakeRespostaDto {
  @IsString() @MinLength(1) body!: string;
}

/**
 * A porta pública de abertura de chamado
 * (`docs/07-api.md`, seção 6).
 *
 * É por aqui que o monitoramento da Norty abre chamado sem ninguém
 * digitar. Autenticada por chave de aplicação, com escopos nomeados — o
 * mesmo vocabulário do RBAC de gente.
 */
@Controller('intake')
@UseGuards(ApiKeyGuard)
export class IntakeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly regras: RegrasService,
  ) {}

  private exigirEscopo(aplicacao: AplicacaoAutenticada, escopo: string): void {
    if (!aplicacao.scopes.includes(escopo)) {
      throw new ForbiddenException(`Esta chave não tem o escopo ${escopo}.`);
    }
  }

  @Post('tickets')
  async abrir(
    @Req() requisicao: { aplicacao: AplicacaoAutenticada },
    @Body() dto: IntakeChamadoDto,
    @Headers('idempotency-key') chaveDeIdempotencia?: string,
  ) {
    const aplicacao = requisicao.aplicacao;
    this.exigirEscopo(aplicacao, 'chamado:criar');

    // A referência do chamador vem do corpo ou do cabeçalho. Um
    // monitoramento em laço manda a mesma nas duas tentativas, e é isso
    // que impede mil chamados do mesmo incidente.
    const referencia = dto.externalRef ?? chaveDeIdempotencia;

    if (referencia) {
      const existente = await this.prisma.ticket.findFirst({
        where: { organizationId: aplicacao.organizationId, externalRef: referencia },
        select: { id: true, number: true, subject: true, status: true, createdAt: true },
      });

      // Repetir não é erro: devolve o chamado que já existe, com o
      // mesmo corpo da primeira resposta. Quem chamou não precisa saber
      // se foi a primeira ou a décima tentativa.
      if (existente) return { ...existente, repetido: true };
    }

    const contato = await this.resolverContato(aplicacao.organizationId, dto.requester);
    const categoriaId = dto.categoryPath
      ? await this.resolverCategoria(aplicacao.organizationId, dto.categoryPath)
      : undefined;

    const decisao = await this.regras.classificar(aplicacao.organizationId, {
      assunto: dto.subject,
      corpo: dto.description,
      remetente: dto.requester?.email ?? dto.requester?.phone ?? 'api',
      canal: 'API',
      categoriaId,
    });

    if (decisao.descartar) {
      // Descarte por regra devolve 200 com o motivo, não erro: o
      // chamador fez tudo certo, e a decisão foi da configuração.
      return { descartado: true, motivo: decisao.descartar };
    }

    try {
      const chamado = await this.tickets.abrirPorCanal({
        organizationId: aplicacao.organizationId,
        contactId: contato.id,
        channel: 'API',
        subject: dto.subject,
        description: dto.description,
        categoryId: decisao.categoriaId ?? categoriaId,
        urgency: (decisao.urgencia ?? dto.urgency) as Scale | undefined,
        impact: dto.impact as Scale | undefined,
        ticketType: decisao.tipo ?? dto.type,
        teamId: decisao.timeId,
        agreementIds: decisao.acordoIds,
        regrasAplicadas: decisao.regrasAplicadas,
      });

      if (referencia) {
        await this.prisma.ticket.update({
          where: { id: chamado.id },
          data: { externalRef: referencia },
        });
      }

      return { ...chamado, repetido: false };
    } catch (erro) {
      // Duas chamadas simultâneas com a mesma referência: a segunda
      // perde a corrida do índice único e recebe o chamado da primeira.
      if ((erro as { code?: string }).code === 'P2002' && referencia) {
        const vencedor = await this.prisma.ticket.findFirst({
          where: { organizationId: aplicacao.organizationId, externalRef: referencia },
          select: { id: true, number: true, subject: true, status: true, createdAt: true },
        });
        if (vencedor) return { ...vencedor, repetido: true };
      }
      throw erro;
    }
  }

  @Get('tickets/:referencia')
  async consultar(
    @Req() requisicao: { aplicacao: AplicacaoAutenticada },
    @Param('referencia') referencia: string,
  ) {
    const aplicacao = requisicao.aplicacao;
    this.exigirEscopo(aplicacao, 'chamado:ler:proprios');

    const numero = Number(referencia.replace('#', ''));

    const chamado = await this.prisma.ticket.findFirst({
      where: {
        organizationId: aplicacao.organizationId,
        OR: [
          ...(Number.isInteger(numero) && numero > 0 ? [{ number: numero }] : []),
          { externalRef: referencia },
        ],
      },
      select: {
        id: true,
        number: true,
        subject: true,
        status: true,
        priority: true,
        externalRef: true,
        createdAt: true,
        solvedAt: true,
        closedAt: true,
        commitments: {
          select: { kind: true, target: true, dueAt: true, achievedAt: true, breachedAt: true },
        },
      },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    return chamado;
  }

  @Post('tickets/:referencia/responder')
  async responder(
    @Req() requisicao: { aplicacao: AplicacaoAutenticada },
    @Param('referencia') referencia: string,
    @Body() dto: IntakeRespostaDto,
  ) {
    const aplicacao = requisicao.aplicacao;
    this.exigirEscopo(aplicacao, 'chamado:responder');

    const numero = Number(referencia.replace('#', ''));
    const chamado = await this.prisma.ticket.findFirst({
      where: {
        organizationId: aplicacao.organizationId,
        OR: [
          ...(Number.isInteger(numero) && numero > 0 ? [{ number: numero }] : []),
          { externalRef: referencia },
        ],
      },
      include: { actors: { where: { role: 'REQUERENTE' }, take: 1 } },
    });

    if (!chamado) throw new NotFoundException('Chamado não encontrado.');
    if (chamado.status === 'FECHADO') {
      throw new ConflictException('Chamado fechado. Abra um novo.');
    }

    const contactId = chamado.actors[0]?.contactId;
    if (!contactId) {
      throw new BadRequestException('Este chamado não tem contato para responder em nome de.');
    }

    return this.tickets.responderPorCanal({
      ticketId: chamado.id,
      contactId,
      channel: 'API',
      body: dto.body,
    });
  }

  private async resolverContato(organizationId: string, quem?: RequerenteDto) {
    const email = quem?.email?.toLowerCase().trim();
    const phone = quem?.phone?.trim();

    if (!email && !phone) {
      // Sem quem pediu, o chamado nasce órfão e ninguém recebe a
      // resposta. Um contato genérico por chave é melhor que isso.
      const generico = await this.prisma.contact.findFirst({
        where: { organizationId, email: 'integracao@sistema.local' },
      });

      return (
        generico ??
        this.prisma.contact.create({
          data: {
            organizationId,
            email: 'integracao@sistema.local',
            name: 'Integração',
          },
        })
      );
    }

    const existente = await this.prisma.contact.findFirst({
      where: { organizationId, ...(email ? { email } : { phone }) },
    });

    return (
      existente ??
      this.prisma.contact.create({ data: { organizationId, email, phone, name: quem?.name } })
    );
  }

  /**
   * `Sistemas > Integração` vira a árvore, criando o que faltar.
   *
   * Um monitoramento não sabe o id da categoria, e obrigá-lo a saber
   * transformaria cada mudança de catálogo numa mudança de deploy.
   */
  private async resolverCategoria(organizationId: string, caminho: string): Promise<string> {
    const partes = caminho
      .split('>')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (partes.length === 0) throw new BadRequestException('categoryPath vazio.');

    let paiId: string | null = null;

    for (const nome of partes) {
      const existente: { id: string } | null = await this.prisma.category.findFirst({
        where: { organizationId, parentId: paiId, name: nome },
        select: { id: true },
      });

      paiId = existente
        ? existente.id
        : (
            await this.prisma.category.create({
              data: { organizationId, parentId: paiId, name: nome },
              select: { id: true },
            })
          ).id;
    }

    return paiId!;
  }
}
