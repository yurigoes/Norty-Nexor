import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import type { AiConfigView, CopilotResposta } from '@norty-desk/shared';

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { ConfigDoCopilotoService } from './config.service';
import { CopilotService } from './copilot.service';
import { EscreverAiConfigDto, PedirAoCopilotoDto } from './dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CopilotController {
  constructor(
    private readonly copilot: CopilotService,
    private readonly config: ConfigDoCopilotoService,
  ) {}

  /**
   * O Copilot está ligado?
   *
   * A tela pergunta antes de mostrar o botão: oferecer o que não
   * responde é pior que não oferecer. Basta `chamado:responder` — é
   * quem vai usar.
   */
  @Get('copilot/disponivel')
  @RequirePermission('chamado:responder')
  async disponivel(@CurrentUser() usuario: UsuarioAutenticado): Promise<{ disponivel: boolean }> {
    return { disponivel: await this.copilot.disponivel(usuario.organizationId) };
  }

  /**
   * Um rascunho, ou sugestões ao técnico.
   *
   * Com `rascunho`, o REDIGIR reescreve o que o técnico já digitou em
   * vez de partir do chamado — que é o pedido comum de quem sabe a
   * resposta e quer a forma.
   *
   * **Não escreve no chamado.** Devolve texto para a pessoa ler,
   * ajustar e decidir se envia — e é no envio que a resposta ganha a
   * marca de IA.
   */
  @Post('tickets/:id/copilot')
  @RequirePermission('chamado:responder')
  pedir(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PedirAoCopilotoDto,
  ): Promise<CopilotResposta> {
    return this.copilot.responder(usuario, id, dto.intencao, dto.rascunho);
  }

  @Get('config/copilot')
  @RequirePermission('config:copilot')
  ler(@CurrentUser() usuario: UsuarioAutenticado): Promise<AiConfigView | null> {
    return this.config.ler(usuario.organizationId);
  }

  @Put('config/copilot')
  @RequirePermission('config:copilot')
  escrever(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Body() dto: EscreverAiConfigDto,
  ): Promise<AiConfigView> {
    return this.config.escrever(usuario.organizationId, dto);
  }
}
