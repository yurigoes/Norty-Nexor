import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AgendaItem } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AgendaService } from './agenda.service';
import { BuscarAgendaDto, EditarEventoDto, EventoDto } from './dto';

/** A agenda da equipe: compromissos, tarefas de chamado e de projeto com data. */
@Controller('agenda')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @RequirePermission('agenda:usar')
  listar(@CurrentUser() usuario: UsuarioAutenticado, @Query() filtro: BuscarAgendaDto): Promise<AgendaItem[]> {
    return this.agenda.listar(usuario, filtro);
  }

  @Post('events')
  @RequirePermission('agenda:usar')
  criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: EventoDto): Promise<AgendaItem> {
    return this.agenda.criar(usuario, dto);
  }

  @Patch('events/:id')
  @RequirePermission('agenda:usar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarEventoDto,
  ): Promise<AgendaItem> {
    return this.agenda.editar(usuario, id, dto);
  }

  @Delete('events/:id')
  @HttpCode(204)
  @RequirePermission('agenda:usar')
  remover(@CurrentUser() usuario: UsuarioAutenticado, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.agenda.remover(usuario, id);
  }
}
