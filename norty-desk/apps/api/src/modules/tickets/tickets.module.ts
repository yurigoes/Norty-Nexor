import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { FormulariosModule } from '../formularios/formularios.module';
import { SatisfacaoModule } from '../satisfacao/satisfacao.module';
import { SlaModule } from '../sla/sla.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    SlaModule,
    // O formulário da categoria confere as respostas na abertura.
    // Módulo-folha: não importa ninguém de volta, e por isso entra sem
    // `forwardRef`.
    FormulariosModule,
    WebhooksModule,
    forwardRef(() => ChannelsModule),
    forwardRef(() => SatisfacaoModule),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
