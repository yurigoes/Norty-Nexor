import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Allow } from 'class-validator';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ColetaJob } from './coleta.job';
import { DespachoJob } from './despacho.job';
import { EvolutionClient } from './evolution.client';
import { ProcessamentoService } from './processamento.service';
import { cifrarConfig, configParaExibicao, decifrarConfig } from './segredos';

const TIPOS = ['EMAIL_IMAP', 'EMAIL_SMTP', 'EMAIL_WEBHOOK', 'WHATSAPP_EVOLUTION'] as const;

export class CriarCanalDto {
  @IsEnum(TIPOS) kind!: (typeof TIPOS)[number];
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @Allow() config!: Record<string, unknown>;
  @IsOptional() @IsUUID() defaultTeamId?: string;
}

export class EditarCanalDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Allow() config?: Record<string, unknown>;
  @IsOptional() @IsUUID() defaultTeamId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * Configuração de canais e o diagnóstico.
 *
 * O diagnóstico é a tela que o GLPI não tem: quando um e-mail não vira
 * chamado, aqui se vê a mensagem original, o motivo do descarte e um
 * botão de reprocessar (`docs/07-api.md`, seção 5.3).
 */
@Controller('channels')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CanaisController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly coleta: ColetaJob,
    private readonly despacho: DespachoJob,
    private readonly processamento: ProcessamentoService,
    private readonly evolution: EvolutionClient,
  ) {}

  // --- Contas --------------------------------------------------------

  @Get('accounts')
  @RequirePermission('config:canais')
  async listar(@CurrentUser() usuario: UsuarioAutenticado) {
    const contas = await this.prisma.channelAccount.findMany({
      where: { organizationId: usuario.organizationId },
      orderBy: { name: 'asc' },
    });

    return contas.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      isActive: c.isActive,
      defaultTeamId: c.defaultTeamId,
      lastSyncAt: c.lastSyncAt,
      lastError: c.lastError,
      // A tela recebe se existe segredo, nunca qual é.
      config: configParaExibicao(c.config as Record<string, unknown>),
    }));
  }

  @Post('accounts')
  @RequirePermission('config:canais')
  async criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: CriarCanalDto,
    @Ip() ip: string,
  ) {
    const conta = await this.prisma.channelAccount.create({
      data: {
        organizationId: usuario.organizationId,
        kind: dto.kind,
        name: dto.name,
        config: cifrarConfig(dto.config ?? {}) as never,
        defaultTeamId: dto.defaultTeamId,
      },
    });

    await this.auditoria.registrar(usuario, {
      action: 'canal.criado',
      entity: 'ChannelAccount',
      entityId: conta.id,
      ip,
      depois: { kind: conta.kind, name: conta.name, defaultTeamId: conta.defaultTeamId },
    });

    return { id: conta.id, name: conta.name, kind: conta.kind };
  }

  @Patch('accounts/:id')
  @RequirePermission('config:canais')
  async editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarCanalDto,
    @Ip() ip: string,
  ) {
    const conta = await this.exigirConta(usuario, id);

    // A tela manda de volta o que recebeu, e o que recebeu tem `true`
    // no lugar do segredo. Mesclar preserva o segredo que já existe
    // quando ninguém digitou um novo.
    const atual = conta.config as Record<string, unknown>;

    // A tela recebeu `true`/`false` no lugar dos segredos e devolve o
    // mesmo. Um booleano onde havia segredo significa "não mexi nisso":
    // descartá-lo preserva a senha que já está lá. Sem isso, salvar o
    // nome do canal apagaria a senha do IMAP.
    const enviado = Object.fromEntries(
      Object.entries(dto.config ?? {}).filter(([, valor]) => typeof valor !== 'boolean'),
    );

    const booleanos = Object.fromEntries(
      Object.entries(dto.config ?? {}).filter(
        ([chave, valor]) => typeof valor === 'boolean' && !(chave in atual),
      ),
    );

    const novo = dto.config ? cifrarConfig({ ...atual, ...booleanos, ...enviado }) : atual;

    await this.prisma.channelAccount.update({
      where: { id },
      data: {
        name: dto.name,
        config: novo as never,
        defaultTeamId: dto.defaultTeamId,
        isActive: dto.isActive,
      },
    });

    // O diff registra que o segredo mudou, nunca o segredo.
    await this.auditoria.registrar(usuario, {
      action: 'canal.editado',
      entity: 'ChannelAccount',
      entityId: id,
      ip,
      antes: { name: conta.name, defaultTeamId: conta.defaultTeamId, isActive: conta.isActive, ...atual },
      depois: { name: dto.name ?? conta.name, defaultTeamId: dto.defaultTeamId ?? conta.defaultTeamId, isActive: dto.isActive ?? conta.isActive, ...novo },
    });

    return { ok: true };
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  @RequirePermission('config:canais')
  async desativar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Ip() ip: string,
  ): Promise<void> {
    await this.exigirConta(usuario, id);
    // Desativar, não excluir: as mensagens recebidas apontam para a
    // conta, e o histórico do diagnóstico precisa dela.
    await this.prisma.channelAccount.update({ where: { id }, data: { isActive: false } });

    await this.auditoria.registrar(usuario, {
      action: 'canal.desativado',
      entity: 'ChannelAccount',
      entityId: id,
      ip,
      antes: { isActive: true },
      depois: { isActive: false },
    });
  }

  /** Testa a configuração antes de o operador ir embora achando que deu certo. */
  @Post('accounts/:id/testar')
  @RequirePermission('config:canais')
  async testar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const conta = await this.exigirConta(usuario, id);
    const config = decifrarConfig(conta.config as Record<string, unknown>);

    if (conta.kind === 'WHATSAPP_EVOLUTION') {
      const estado = await this.evolution.estadoDaConexao({
        baseUrl: String(config.baseUrl ?? ''),
        instance: String(config.instance ?? ''),
        apiKey: String(config.apiKey ?? ''),
      });

      return {
        ok: estado.state === 'open',
        detalhe: estado.state ?? 'sem resposta da Evolution',
      };
    }

    if (conta.kind === 'EMAIL_IMAP') {
      try {
        const resultado = await this.coleta.coletar(conta.id);
        return { ok: true, detalhe: `${resultado.lidas} mensagem(ns) lida(s).` };
      } catch (erro) {
        return { ok: false, detalhe: (erro as Error).message };
      }
    }

    return { ok: true, detalhe: 'Canal por webhook: nada a testar daqui.' };
  }

  @Post('accounts/:id/coletar')
  @RequirePermission('config:canais')
  async coletarAgora(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.exigirConta(usuario, id);
    const resultado = await this.coleta.coletar(id);
    await this.processamento.processarPendentes();
    return resultado;
  }

  // --- Diagnóstico ---------------------------------------------------

  @Get('inbound')
  @RequirePermission('config:canais')
  async entradas(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query('processed') processado?: string,
    @Query('limit') limite?: string,
  ) {
    const mensagens = await this.prisma.inboundMessage.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(processado === 'false' ? { processedAt: null } : {}),
        ...(processado === 'descartadas' ? { discardedReason: { not: null } } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      take: Math.min(Number(limite ?? 50), 200),
      include: { event: { select: { ticketId: true } } },
    });

    const chamados = await this.prisma.ticket.findMany({
      where: { id: { in: mensagens.map((m) => m.event?.ticketId).filter(Boolean) as string[] } },
      select: { id: true, number: true },
    });
    const porId = new Map(chamados.map((c) => [c.id, c]));

    return mensagens.map((m) => ({
      id: m.id,
      channel: m.channel,
      externalId: m.externalId,
      fromAddress: m.fromAddress,
      subject: m.subject,
      receivedAt: m.receivedAt,
      processedAt: m.processedAt,
      discardedReason: m.discardedReason,
      ticket: m.event?.ticketId ? (porId.get(m.event.ticketId) ?? null) : null,
    }));
  }

  /** A mensagem original, íntegra. É o "ver original" da tela do evento. */
  @Get('inbound/:id')
  @RequirePermission('config:canais')
  async entrada(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const mensagem = await this.prisma.inboundMessage.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });

    if (!mensagem) throw new NotFoundException('Mensagem não encontrada.');
    return mensagem;
  }

  @Post('inbound/:id/reprocessar')
  @RequirePermission('config:canais')
  async reprocessar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const mensagem = await this.prisma.inboundMessage.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!mensagem) throw new NotFoundException('Mensagem não encontrada.');

    // Limpa a marca de descarte e roda de novo. É o que faz a tela ser
    // útil depois de o operador corrigir a regra que descartou errado.
    await this.prisma.inboundMessage.update({
      where: { id },
      data: { discardedReason: null, processedAt: null, eventId: null },
    });

    await this.processamento.processarUma(id);

    return this.prisma.inboundMessage.findUniqueOrThrow({ where: { id } });
  }

  @Get('outbound')
  @RequirePermission('config:canais')
  async saidas(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query('status') status?: string,
    @Query('limit') limite?: string,
  ) {
    return this.prisma.outboundMessage.findMany({
      where: {
        organizationId: usuario.organizationId,
        ...(status ? { status: status as 'PENDENTE' | 'ENVIADO' | 'FALHOU' } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limite ?? 50), 200),
    });
  }

  @Post('outbound/:id/reenviar')
  @RequirePermission('config:canais')
  async reenviar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const mensagem = await this.prisma.outboundMessage.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!mensagem) throw new NotFoundException('Mensagem não encontrada.');

    await this.prisma.outboundMessage.update({
      where: { id },
      data: { status: 'PENDENTE', attempts: 0, scheduledFor: new Date(), lastError: null },
    });

    await this.despacho.despacharUma(id);

    return this.prisma.outboundMessage.findUniqueOrThrow({ where: { id } });
  }

  private async exigirConta(usuario: UsuarioAutenticado, id: string) {
    const conta = await this.prisma.channelAccount.findFirst({
      where: { id, organizationId: usuario.organizationId },
    });
    if (!conta) throw new NotFoundException('Canal não encontrado.');
    return conta;
  }
}
