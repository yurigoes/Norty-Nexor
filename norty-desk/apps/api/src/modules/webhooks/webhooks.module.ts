import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { EntregaJob } from './entrega.job';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Módulo-folha de propósito: só depende do Prisma e da configuração.
 *
 * Quem emite evento (chamados, aprovações) importa este; ele não importa
 * ninguém de volta. É o que evita mais um `forwardRef` no grafo.
 */
@Module({
  imports: [ConfigModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, EntregaJob],
  exports: [WebhooksService, EntregaJob],
})
export class WebhooksModule {}
