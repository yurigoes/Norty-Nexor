import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
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
  ModeloDeTermoView,
  PosseView,
  SenhaRevelada,
  TermKind,
  TrocaResponse,
} from '@norty-desk/shared';
import { TERM_KINDS } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { AcessoRemotoService } from './acesso-remoto.service';
import { AtivosService } from './ativos.service';
import { PosseService } from './posse.service';
import { TermosService } from './termos.service';
import { termoEmPdf } from './termo.pdf';
import { EscreverAcessoRemotoDto } from './dto-acesso';
import {
  BuscarAtivosDto,
  DevolverAtivoDto,
  EditarAtivoDto,
  EscreverModeloDeTermoDto,
  EditarComponenteDto,
  EntregarAtivoDto,
  EscreverAtivoDto,
  EscreverComponenteDto,
  TrocarAtivoDto,
  VincularAtivoDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AtivosController {
  constructor(
    private readonly ativos: AtivosService,
    private readonly acesso: AcessoRemotoService,
    private readonly posse: PosseService,
    private readonly termos: TermosService,
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

  /**
   * O termo em PDF, com o texto assinado e o traço.
   *
   * PDF e não só a imagem: o traço sozinho não prova nada — o que vale
   * é o texto que estava embaixo dele, e é esse texto que `AssetTerm`
   * congelou.
   */
  @Get('termos/:termId/pdf')
  @RequirePermission('ativo:ler')
  async baixarTermo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('termId', ParseUUIDPipe) termId: string,
    @Res() resposta: Response,
  ): Promise<void> {
    const termo = await this.posse.termo(usuario, termId);
    const pdf = await termoEmPdf(termo);

    resposta.setHeader('Content-Type', 'application/pdf');
    resposta.setHeader(
      'Content-Disposition',
      `inline; filename="termo-${termo.kind.toLowerCase()}.pdf"`,
    );
    resposta.send(pdf);
  }

  // --- O texto dos termos ----------------------------------------------

  /**
   * A redação que a casa usa.
   *
   * `config:modelos` e não `ativo:gerenciar`: a redação de um termo é
   * política da casa, como o modelo de resposta — e quem mexe nela é
   * quem responde por texto que vai para fora, não quem cadastra
   * equipamento.
   */
  @Get('config/termos')
  @RequirePermission('config:modelos')
  modelosDeTermo(@CurrentUser() usuario: UsuarioAutenticado): Promise<ModeloDeTermoView[]> {
    return this.termos.modelos(usuario);
  }

  @Put('config/termos/:kind')
  @RequirePermission('config:modelos')
  salvarModeloDeTermo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('kind') kind: string,
    @Body() dto: EscreverModeloDeTermoDto,
  ): Promise<ModeloDeTermoView[]> {
    return this.termos.salvarModelo(usuario, AtivosController.exigirTipoDeTermo(kind), dto.body);
  }

  /** Volta ao texto de fábrica. */
  @Delete('config/termos/:kind')
  @RequirePermission('config:modelos')
  restaurarModeloDeTermo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('kind') kind: string,
  ): Promise<ModeloDeTermoView[]> {
    return this.termos.restaurarModelo(usuario, AtivosController.exigirTipoDeTermo(kind));
  }

  /** O tipo vem da URL, e a URL aceita qualquer coisa. */
  private static exigirTipoDeTermo(kind: string): TermKind {
    if ((TERM_KINDS as readonly string[]).includes(kind)) return kind as TermKind;
    throw new BadRequestException(`Tipo de termo desconhecido: ${kind}.`);
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

  /**
   * Sai um equipamento, entra outro.
   *
   * `ativo:gerenciar`, e não `ativo:ler` como o vínculo: vincular
   * equipamento ao chamado é dizer sobre o que ele é; trocar muda o
   * parque e gera termo assinado.
   */
  @Post('tickets/:id/troca')
  @RequirePermission('ativo:gerenciar')
  trocar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrocarAtivoDto,
  ): Promise<TrocaResponse> {
    return this.posse.trocar(usuario, id, dto);
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
