import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  ConcessaoView,
  EstadoDoCofre,
  LeituraDoSegredoView,
  SegredoRevelado,
  SegredoView,
} from '@norty-desk/shared';
import type { Request } from 'express';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ipDaRequisicao } from '../../common/origem';
import { CofreService } from './cofre.service';
import { CompartilharDto, EscreverSegredoDto } from './dto';

/**
 * O cofre.
 *
 * `cofre:usar` abre a porta; quem decide o que cada um vê lá dentro é o
 * dono de cada segredo, no serviço. Esconder o botão é conveniência; o
 * guard é a proteção, e a cerca de verdade é `exigirAcesso`.
 */
@Controller('cofre')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CofreController {
  constructor(private readonly cofre: CofreService) {}

  /** A tela pergunta antes de oferecer: cofre sem chave não guarda. */
  @Get('disponivel')
  @RequirePermission('cofre:usar')
  disponivel(): EstadoDoCofre {
    return { disponivel: this.cofre.disponivel() };
  }

  @Get()
  @RequirePermission('cofre:usar')
  meus(@CurrentUser() usuario: UsuarioAutenticado): Promise<SegredoView[]> {
    return this.cofre.meus(usuario);
  }

  /** Tudo que existe, em metadado. Nunca a senha. */
  @Get('todos')
  @RequirePermission('cofre:administrar')
  todos(@CurrentUser() usuario: UsuarioAutenticado): Promise<SegredoView[]> {
    return this.cofre.todos(usuario);
  }

  @Post()
  @RequirePermission('cofre:usar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverSegredoDto,
  ): Promise<SegredoView> {
    return this.cofre.criar(usuario, dto);
  }

  @Patch(':id')
  @RequirePermission('cofre:usar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverSegredoDto,
  ): Promise<SegredoView> {
    return this.cofre.editar(usuario, id, dto);
  }

  @Delete(':id')
  @RequirePermission('cofre:usar')
  remover(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.cofre.remover(usuario, id);
  }

  /**
   * A senha, uma vez.
   *
   * `POST` e não `GET`, pela mesma razão do acesso remoto do ativo:
   * revelar é um **ato**, não uma leitura. `GET` entraria no histórico
   * do navegador, em log de proxy e num `prefetch` que ninguém pediu —
   * cada um uma cópia da senha fora daqui. Cada chamada fica
   * registrada, e o dono do segredo a vê.
   */
  @Post(':id/revelar')
  @RequirePermission('cofre:usar')
  revelar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() requisicao: Request,
  ): Promise<SegredoRevelado> {
    return this.cofre.revelar(usuario, id, ipDaRequisicao(requisicao));
  }

  @Get(':id/leituras')
  @RequirePermission('cofre:usar')
  leituras(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeituraDoSegredoView[]> {
    return this.cofre.leituras(usuario, id);
  }

  @Get(':id/compartilhamentos')
  @RequirePermission('cofre:usar')
  concessoes(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConcessaoView[]> {
    return this.cofre.concessoes(usuario, id);
  }

  @Post(':id/compartilhamentos')
  @RequirePermission('cofre:usar')
  compartilhar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompartilharDto,
  ): Promise<ConcessaoView[]> {
    return this.cofre.compartilhar(usuario, id, dto);
  }

  @Delete(':id/compartilhamentos/:grantId')
  @RequirePermission('cofre:usar')
  revogar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ): Promise<ConcessaoView[]> {
    return this.cofre.revogar(usuario, id, grantId);
  }

  /**
   * Assumir um segredo de outra pessoa.
   *
   * Para o dia em que alguém sai da empresa com o cofre dele. Não é
   * leitura — a senha continua fechada até ser aberta, e aí a leitura
   * gera o próprio registro. O ato fica na trilha.
   */
  @Post(':id/assumir')
  @RequirePermission('cofre:administrar')
  assumir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SegredoView> {
    return this.cofre.assumir(usuario, id);
  }
}
