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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  AcessoRemotoView,
  AssetDetail,
  AssetView,
  ComponenteView,
  PosseView,
  SenhaRevelada,
} from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AcessoRemotoService } from './acesso-remoto.service';
import { AtivosService } from './ativos.service';
import { PosseService } from './posse.service';
import { EscreverAcessoRemotoDto } from './dto-acesso';
import {
  BuscarAtivosDto,
  DevolverAtivoDto,
  EditarAtivoDto,
  EditarComponenteDto,
  EntregarAtivoDto,
  EscreverAtivoDto,
  EscreverComponenteDto,
  VincularAtivoDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AtivosController {
  constructor(
    private readonly ativos: AtivosService,
    private readonly acesso: AcessoRemotoService,
    private readonly posse: PosseService,
  ) {}

  @Get('assets')
  @RequirePermission('ativo:ler')
  buscar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarAtivosDto,
  ): Promise<AssetView[]> {
    return this.ativos.buscar(usuario, filtro);
  }

  /**
   * O ativo com os componentes juntos.
   *
   * Vêm na mesma resposta porque a tela de detalhe mostra os dois e um
   * `GET` a mais só existiria para separar o que sempre se lê junto.
   */
  @Get('assets/:id')
  @RequirePermission('ativo:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetDetail> {
    return this.ativos.detalhe(usuario, id);
  }

  @Get('assets/:id/components')
  @RequirePermission('ativo:ler')
  componentes(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ComponenteView[]> {
    return this.ativos.componentes(usuario, id);
  }

  @Post('assets/:id/components')
  @RequirePermission('ativo:gerenciar')
  adicionarComponente(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverComponenteDto,
  ): Promise<ComponenteView[]> {
    return this.ativos.adicionarComponente(usuario, id, dto);
  }

  @Patch('assets/:id/components/:componentId')
  @RequirePermission('ativo:gerenciar')
  editarComponente(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
    @Body() dto: EditarComponenteDto,
  ): Promise<ComponenteView[]> {
    return this.ativos.editarComponente(usuario, id, componentId, dto);
  }

  @Delete('assets/:id/components/:componentId')
  @RequirePermission('ativo:gerenciar')
  removerComponente(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('componentId', ParseUUIDPipe) componentId: string,
  ): Promise<ComponenteView[]> {
    return this.ativos.removerComponente(usuario, id, componentId);
  }

  /** O histórico do equipamento — "essa máquina dá problema?". */
  @Get('assets/:id/chamados')
  @RequirePermission('ativo:ler')
  chamados(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ativos.chamadosDoAtivo(usuario, id);
  }

  @Post('assets')
  @RequirePermission('ativo:gerenciar')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverAtivoDto,
  ): Promise<AssetView> {
    return this.ativos.criar(usuario, dto);
  }

  @Patch('assets/:id')
  @RequirePermission('ativo:gerenciar')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarAtivoDto,
  ): Promise<AssetView> {
    return this.ativos.editar(usuario, id, dto);
  }

  // --- Posse: quem está com o equipamento ------------------------------

  /**
   * Por quantas mãos passou.
   *
   * `ativo:ler` e não `ativo:gerenciar`: quem atende precisa saber com
   * quem está a máquina antes de sair procurando por ela.
   */
  @Get('assets/:id/posses')
  @RequirePermission('ativo:ler')
  posses(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PosseView[]> {
    return this.posse.listar(usuario, id);
  }

  /**
   * Entrega a alguém, com o termo de compromisso assinado.
   *
   * É a única porta que muda quem está com o equipamento: o `PATCH` do
   * ativo perdeu o `userId`. Trocar de mão sem registrar era o que
   * apagava o histórico com um `UPDATE`.
   */
  @Post('assets/:id/posse')
  @RequirePermission('ativo:gerenciar')
  entregar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EntregarAtivoDto,
  ): Promise<PosseView[]> {
    return this.posse.entregar(usuario, id, dto);
  }

  @Post('assets/:id/devolver')
  @RequirePermission('ativo:gerenciar')
  devolver(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DevolverAtivoDto,
  ): Promise<PosseView[]> {
    return this.posse.devolver(usuario, id, dto);
  }

  /** O PNG do termo assinado, para conferir ou imprimir. */
  @Get('posses/:holdingId/termo')
  @RequirePermission('ativo:ler')
  async termo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('holdingId', ParseUUIDPipe) holdingId: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const png = await this.posse.assinatura(usuario, holdingId);
    resposta.setHeader('Content-Type', 'image/png');
    resposta.send(png);
  }

  // --- Como se chega na máquina ---------------------------------------

  /**
   * Tailscale, VPN e acesso remoto.
   *
   * `ativo:acesso-remoto` e não `ativo:ler`: "que máquina é essa" é
   * inventário, "como eu entro nela agora" é chave de casa. A senha
   * **não** vem aqui — só o aviso de que existe uma.
   */
  @Get('assets/:id/acesso-remoto')
  @RequirePermission('ativo:acesso-remoto')
  acessoRemoto(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AcessoRemotoView> {
    return this.acesso.obter(usuario, id);
  }

  @Patch('assets/:id/acesso-remoto')
  @RequirePermission('ativo:acesso-remoto')
  salvarAcessoRemoto(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EscreverAcessoRemotoDto,
  ): Promise<AcessoRemotoView> {
    return this.acesso.salvar(usuario, id, dto);
  }

  /**
   * A senha, uma vez.
   *
   * `POST` e não `GET` de propósito: revelar é um **ato**, não uma
   * leitura. `GET` entraria no histórico do navegador, em log de proxy
   * e num `prefetch` que ninguém pediu — e cada um desses seria uma
   * cópia da senha fora daqui. Cada chamada fica na auditoria.
   */
  @Post('assets/:id/acesso-remoto/revelar')
  @HttpCode(200)
  @RequirePermission('ativo:acesso-remoto')
  revelarSenha(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SenhaRevelada> {
    return this.acesso.revelar(usuario, id);
  }

  // --- Vínculo com o chamado ------------------------------------------

  @Get('tickets/:id/ativos')
  @RequirePermission('ativo:ler')
  doChamado(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AssetView[]> {
    return this.ativos.doChamado(usuario, id);
  }

  /**
   * Vincular é `ativo:ler`, não `ativo:gerenciar`.
   *
   * Quem atende precisa dizer qual máquina é; mudar o cadastro do
   * equipamento é outra conversa.
   */
  @Post('tickets/:id/ativos')
  @RequirePermission('ativo:ler')
  vincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VincularAtivoDto,
  ): Promise<AssetView[]> {
    return this.ativos.vincular(usuario, id, dto.assetId);
  }

  @Delete('tickets/:id/ativos/:assetId')
  @RequirePermission('ativo:ler')
  desvincular(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<AssetView[]> {
    return this.ativos.desvincular(usuario, id, assetId);
  }
}
