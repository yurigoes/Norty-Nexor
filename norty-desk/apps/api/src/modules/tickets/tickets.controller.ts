import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import {
  AtribuirDto,
  ClassificarDto,
  CriarChamadoDto,
  PausarDto,
  ReabrirDto,
  ResolverDto,
  ResponderDto,
  VincularDto,
} from './dto';
import { TicketsService } from './tickets.service';

/**
 * Rotas de chamado. A especificação está em `docs/07-api.md`, seção 3.
 *
 * Toda rota carrega a permissão nomeada que a protege; o escopo de
 * leitura é aplicado dentro do service, sempre.
 */
@Controller('tickets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @RequirePermission('chamado:ler:proprios')
  listar(@CurrentUser() usuario: UsuarioAutenticado, @Query('limit') limite?: string) {
    return this.tickets.listar(usuario, {}, limite ? Number(limite) : 50);
  }

  @Get(':id')
  @RequirePermission('chamado:ler:proprios')
  obter(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.obter(usuario, id);
  }

  @Post()
  @RequirePermission('chamado:criar')
  criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: CriarChamadoDto) {
    return this.tickets.abrir(usuario.organizationId, {
      subject: dto.subject,
      description: dto.description,
      type: dto.type ?? 'INCIDENTE',
      urgency: TicketsService.exigirEscala(dto.urgency ?? 3, 'urgency'),
      impact: TicketsService.exigirEscala(dto.impact ?? 3, 'impact'),
      categoryId: dto.categoryId,
      formId: dto.formId,
      originChannel: 'WEB',
      customFields: (dto.customFields as Prisma.InputJsonValue | undefined) ?? undefined,
    });
  }

  @Post(':id/responder')
  @RequirePermission('chamado:responder')
  responder(
    @CurrentUser() _usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) _id: string,
    @Body() _dto: ResponderDto,
  ): never {
    throw new Error('Não implementado — Fase 1 do roadmap (docs/10-roadmap.md).');
  }

  @Post(':id/atribuir')
  @RequirePermission('chamado:atribuir')
  atribuir(@Param('id', ParseUUIDPipe) _id: string, @Body() _dto: AtribuirDto): never {
    throw new Error('Não implementado — Fase 1 do roadmap (docs/10-roadmap.md).');
  }

  @Post(':id/classificar')
  @RequirePermission('chamado:classificar')
  classificar(@Param('id', ParseUUIDPipe) _id: string, @Body() _dto: ClassificarDto): never {
    throw new Error('Não implementado — Fase 1 do roadmap (docs/10-roadmap.md).');
  }

  @Post(':id/pausar')
  @RequirePermission('chamado:pausar')
  pausar(@Param('id', ParseUUIDPipe) _id: string, @Body() _dto: PausarDto): never {
    throw new Error('Não implementado — Fase 2 do roadmap (docs/10-roadmap.md).');
  }

  @Post(':id/resolver')
  @RequirePermission('chamado:resolver')
  resolver(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: ResolverDto,
  ) {
    return this.tickets.mudarStatus(usuario, id, 'SOLUCIONADO');
  }

  @Post(':id/fechar')
  @RequirePermission('chamado:fechar')
  fechar(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string) {
    return this.tickets.mudarStatus(usuario, id, 'FECHADO');
  }

  @Post(':id/reabrir')
  @RequirePermission('chamado:reabrir')
  reabrir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: ReabrirDto,
  ) {
    return this.tickets.mudarStatus(usuario, id, 'ATRIBUIDO');
  }

  @Post(':id/vincular')
  @RequirePermission('chamado:vincular')
  vincular(@Param('id', ParseUUIDPipe) _id: string, @Body() _dto: VincularDto): never {
    throw new Error('Não implementado — Fase 1 do roadmap (docs/10-roadmap.md).');
  }
}
