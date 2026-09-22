import { Module, forwardRef } from '@nestjs/common';

import { AprovacoesModule } from '../aprovacoes/aprovacoes.module';
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
    // A categoria pode exigir aval: quem cria o pedido na abertura é o
    // módulo de aprovações, dono da tabela. Ele não importa tickets de
    // volta, então entra sem `forwardRef`.
    AprovacoesModule,
    WebhooksModule,
    forwardRef(() => ChannelsModule),
    forwardRef(() => SatisfacaoModule),
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
