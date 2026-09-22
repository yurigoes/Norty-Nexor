import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  ArticleDetail,
  ArticleListItem,
  ArticleRevisionView,
  VerificacaoSugerida,
} from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ConhecimentoService } from './conhecimento.service';
import {
  BuscarArtigosDto,
  EditarArtigoDto,
  EscreverArtigoDto,
  RegistrarResolucaoDto,
} from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConhecimentoController {
  constructor(private readonly conhecimento: ConhecimentoService) {}

  @Get('articles')
  @RequirePermission('artigo:ler')
  buscar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() filtro: BuscarArtigosDto,
  ): Promise<ArticleListItem[]> {
    return this.conhecimento.buscar(usuario, filtro);
  }

  @Get('articles/:id')
  @RequirePermission('artigo:ler')
  obter(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArticleDetail> {
    return this.conhecimento.obter(usuario, id);
  }

  @Get('articles/:id/revisoes')
  @RequirePermission('artigo:ler')
  revisoes(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArticleRevisionView[]> {
    return this.conhecimento.revisoes(usuario, id);
  }

  @Post('articles')
  @RequirePermission('artigo:escrever')
  criar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverArtigoDto,
  ): Promise<ArticleDetail> {
    return this.conhecimento.criar(usuario, dto);
  }

  @Patch('articles/:id')
  @RequirePermission('artigo:escrever')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarArtigoDto,
  ): Promise<ArticleDetail> {
    return this.conhecimento.editar(usuario, id, dto);
  }

  /**
   * O que já foi escrito sobre este chamado.
   *
   * `GET` e não `POST`: é leitura, e o `docs/07-api.md` dizia `POST`
   * por engano. Sem efeito colateral não há motivo para não ser
   * cacheável nem repetível.
   */
  @Get('tickets/:id/artigos-sugeridos')
  @RequirePermission('artigo:ler')
  sugeridos(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ArticleListItem[]> {
    return this.conhecimento.sugerirPara(usuario, id);
  }

  /**
   * As verificações que o sistema propõe neste chamado.
   *
   * O mesmo casamento de texto da rota acima, ordenado pelo que já
   * resolveu e sabendo o que já foi confirmado aqui.
   */
  @Get('tickets/:id/verificacoes')
  @RequirePermission('artigo:ler')
  verificacoes(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<VerificacaoSugerida[]> {
    return this.conhecimento.verificacoesPara(usuario, id);
  }

  /**
   * A resolução deste chamado, registrada no índice.
   *
   * Exige `artigo:escrever`: registrar resolução é escrever na base de
   * conhecimento, e quem só lê chamado não publica o que a casa vai
   * passar a recomendar.
   */
  @Post('tickets/:id/resolucao')
  @RequirePermission('artigo:escrever')
  registrarResolucao(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RegistrarResolucaoDto,
  ): Promise<ArticleDetail> {
    return this.conhecimento.registrarResolucao(usuario, id, dto);
  }

  /**
   * "Isto resolveu."
   *
   * Basta `chamado:responder`: quem atende o chamado é quem sabe se
   * resolveu, e exigir permissão de escrita na base afastaria
   * justamente quem tem a informação.
   */
  @Post('tickets/:id/verificacoes/:articleId')
  @RequirePermission('chamado:responder')
  confirmar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ): Promise<VerificacaoSugerida[]> {
    return this.conhecimento.confirmarResolucao(usuario, id, articleId);
  }

  @Delete('tickets/:id/verificacoes/:articleId')
  @RequirePermission('chamado:responder')
  desconfirmar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('articleId', ParseUUIDPipe) articleId: string,
  ): Promise<VerificacaoSugerida[]> {
    return this.conhecimento.desconfirmarResolucao(usuario, id, articleId);
  }
}
