import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { ArticleDetail, ArticleListItem, ArticleRevisionView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ConhecimentoService } from './conhecimento.service';
import { BuscarArtigosDto, EditarArtigoDto, EscreverArtigoDto } from './dto';

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
}
