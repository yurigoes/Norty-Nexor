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

import { CurrentUser, type UsuarioAutenticado } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EditarWebhookDto, EscreverWebhookDto } from './dto';
import { EntregaJob } from './entrega.job';
import { EVENTOS_DE_WEBHOOK } from './eventos';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly entrega: EntregaJob,
  ) {}

  /** A lista de eventos assináveis, para a tela não repetir a constante. */
  @Get('eventos')
  @RequirePermission('config:webhooks')
  eventos(): readonly string[] {
    return EVENTOS_DE_WEBHOOK;
  }

  @Get()
  @RequirePermission('config:webhooks')
  listar(@CurrentUser() usuario: UsuarioAutenticado) {
    return this.webhooks.listar(usuario);
  }

  @Post()
  @RequirePermission('config:webhooks')
  criar(@CurrentUser() usuario: UsuarioAutenticado, @Body() dto: EscreverWebhookDto) {
    return this.webhooks.criar(usuario, dto);
  }

  @Patch(':id')
  @RequirePermission('config:webhooks')
  editar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditarWebhookDto,
  ) {
    return this.webhooks.editar(usuario, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('config:webhooks')
  desativar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.webhooks.desativar(usuario, id);
  }

  @Get(':id/entregas')
  @RequirePermission('config:webhooks')
  entregas(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
  ) {
    return this.webhooks.entregas(usuario, id, status);
  }

  @Post(':id/testar')
  @RequirePermission('config:webhooks')
  async testar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const entrega = await this.webhooks.testar(usuario, id);
    await this.entrega.entregarUma(entrega.id);
    return this.webhooks.entregas(usuario, id);
  }

  @Post('entregas/:deliveryId/reenviar')
  @RequirePermission('config:webhooks')
  async reenviar(
    @CurrentUser() usuario: UsuarioAutenticado,
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    const entrega = await this.webhooks.reenfileirar(usuario, deliveryId);
    await this.entrega.entregarUma(deliveryId);
    return this.webhooks.entregas(usuario, entrega.webhookId);
  }
}
