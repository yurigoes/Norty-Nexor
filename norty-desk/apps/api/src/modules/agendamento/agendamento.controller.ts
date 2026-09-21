import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AppointmentView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AgendamentoService } from './agendamento.service';
import { AgendarDto, CancelarAgendamentoDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgendamentoController {
  constructor(private readonly agendamentos: AgendamentoService) {}

  /**
   * Ler a agenda do chamado é de quem lê o chamado — inclusive do
   * cliente, que precisa saber quando o técnico vem.
   */
  @Get('tickets/:id/agendamentos')
  @RequirePermission('chamado:ler:proprios')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AppointmentView[]> {
    return this.agendamentos.listar(usuario, id);
  }

  @Post('tickets/:id/agendamentos')
  @RequirePermission('chamado:agendar')
  agendar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AgendarDto,
  ): Promise<AppointmentView> {
    return this.agendamentos.agendar(usuario, id, dto);
  }

  @Post('agendamentos/:id/cancelar')
  @RequirePermission('chamado:agendar')
  cancelar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelarAgendamentoDto,
  ): Promise<AppointmentView> {
    return this.agendamentos.cancelar(usuario, id, dto.reason);
  }

  @Post('agendamentos/:id/concluir')
  @RequirePermission('chamado:agendar')
  concluir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AppointmentView> {
    return this.agendamentos.concluir(usuario, id);
  }
}
