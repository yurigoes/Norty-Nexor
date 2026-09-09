import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { SatisfacaoResumo, SurveyPublicView, SurveyView } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
// `PainelDto` entra como valor, não como tipo: `import type` apaga a
// classe na compilação, o `ValidationPipe` fica sem metadado e
// `forbidNonWhitelisted` passa a recusar todo parâmetro da consulta.
import { PainelDto, inicioDoPeriodo } from '../paineis/dto';
import { ResponderPesquisaDto } from '../ativos/dto';
import { SatisfacaoService } from './satisfacao.service';

/**
 * O controller não tem guard de classe de propósito.
 *
 * As duas rotas da pesquisa são públicas; as de leitura interna trazem
 * o guard por método. Guard na classe com exceções seria mais fácil de
 * errar — e errar aqui é abrir a base ou fechar a pesquisa.
 */
@Controller()
export class SatisfacaoController {
  constructor(private readonly satisfacao: SatisfacaoService) {}

  // --- Página pública, sem sessão --------------------------------------

  /**
   * O link da pesquisa abre sem login.
   *
   * Exigir senha de quem só quer dar uma nota é o jeito mais eficiente
   * de não receber nota nenhuma. A autorização é o token: aleatório de
   * 24 bytes, único e com validade.
   */
  @Get('pesquisa/:token')
  publica(@Param('token') token: string): Promise<SurveyPublicView> {
    return this.satisfacao.porToken(token);
  }

  @Post('pesquisa/:token')
  responder(
    @Param('token') token: string,
    @Body() dto: ResponderPesquisaDto,
  ): Promise<SurveyPublicView> {
    return this.satisfacao.responder(token, dto.score, dto.comment);
  }

  // --- Leitura interna --------------------------------------------------

  @Get('surveys')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('satisfacao:ler')
  listar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query('respondidas') respondidas?: string,
  ): Promise<SurveyView[]> {
    return this.satisfacao.listar(usuario, respondidas === 'true');
  }

  @Get('reports/satisfacao')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('satisfacao:ler')
  resumo(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Query() dto: PainelDto,
  ): Promise<SatisfacaoResumo> {
    return this.satisfacao.resumo(usuario, inicioDoPeriodo(dto.periodo));
  }
}
