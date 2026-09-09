import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AprovacoesController } from './aprovacoes.controller';
import { AprovacoesService } from './aprovacoes.service';

@Module({
  // A aprovação avisa por e-mail quem tem de decidir: sem aviso,
  // ninguém sabe que foi chamado, e o chamado espera até alguém
  // reparar.
  imports: [WebhooksModule, forwardRef(() => ChannelsModule)],
  controllers: [AprovacoesController],
  providers: [AprovacoesService],
  exports: [AprovacoesService],
})
export class AprovacoesModule {}
