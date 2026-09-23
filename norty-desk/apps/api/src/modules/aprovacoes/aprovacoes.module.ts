import { Module, forwardRef } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { SlaModule } from '../sla/sla.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { AprovacoesController } from './aprovacoes.controller';
import { AprovacoesService } from './aprovacoes.service';

@Module({
  // A aprovação avisa por e-mail quem tem de decidir: sem aviso,
  // ninguém sabe que foi chamado, e o chamado espera até alguém
  // reparar.
  //
  // `SlaModule` entra porque o relógio para enquanto o chamado espera
  // decisão: quem demora aqui é o gestor, e cobrar o prazo de quem
  // atende por isso seria cobrar a conta errada.
  imports: [WebhooksModule, forwardRef(() => ChannelsModule), SlaModule],
  controllers: [AprovacoesController],
  providers: [AprovacoesService],
  exports: [AprovacoesService],
})
export class AprovacoesModule {}
