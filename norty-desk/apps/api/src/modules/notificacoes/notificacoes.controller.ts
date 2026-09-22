import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import type { EstadoDasNotificacoes } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { InscreverPushDto, SilenciarDto } from './dto';
import { InscricoesService } from './inscricoes.service';

/**
 * Os aparelhos da própria pessoa.
 *
 * Sem `@RequirePermission` de propósito: não existe papel que possa
 * mexer no aviso de outro, e não existe papel que não possa mexer no
 * seu. Quem pode entrar pode escolher onde quer ser avisado.
 */
@Controller('notificacoes')
@UseGuards(JwtAuthGuard)
export class NotificacoesController {
  constructor(private readonly inscricoes: InscricoesService) {}

  @Get()
  estado(
    @CurrentUser() usuario: UsuarioAutenticado,
    /** O endpoint deste aparelho, para a tela saber qual da lista é ele. */
    @Query('endpoint') endpoint?: string,
  ): Promise<EstadoDasNotificacoes> {
    return this.inscricoes.estado(usuario.userId, endpoint);
  }

  @Post('aparelhos')
  inscrever(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: InscreverPushDto,
  ): Promise<EstadoDasNotificacoes> {
    return this.inscricoes.inscrever(usuario, dto);
  }

  @Delete('aparelhos/:id')
  desinscrever(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('endpoint') endpoint?: string,
  ): Promise<EstadoDasNotificacoes> {
    return this.inscricoes.desinscrever(usuario.userId, id, endpoint);
  }

  @Put('preferencias')
  silenciar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: SilenciarDto,
  ): Promise<EstadoDasNotificacoes> {
    return this.inscricoes.silenciar(usuario.userId, dto.silenciados);
  }
}
