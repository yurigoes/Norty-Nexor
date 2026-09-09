import { Module } from '@nestjs/common';

import { AprovacoesModule } from '../aprovacoes/aprovacoes.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { MudancasController } from './mudancas.controller';
import { MudancasService } from './mudancas.service';

@Module({
  // A mudança usa a mesma máquina de quórum do chamado: aprovação em
  // etapas escrita duas vezes divergiria na primeira correção.
  imports: [AprovacoesModule, WebhooksModule],
  controllers: [MudancasController],
  providers: [MudancasService],
  exports: [MudancasService],
})
export class MudancasModule {}
