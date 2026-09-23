import { Global, Module } from '@nestjs/common';

import { ChannelsModule } from '../channels/channels.module';
import { AutomacaoController } from './automacao.controller';
import { AutomacaoService } from './automacao.service';
import { SenhaService } from './senha.service';

/**
 * Global pela mesma razão das notificações: a ação nasce na abertura do
 * chamado e de novo quando uma aprovação passa, e os dois módulos já
 * são importados por quem importaria este.
 */
@Global()
@Module({
  imports: [ChannelsModule],
  controllers: [AutomacaoController],
  providers: [AutomacaoService, SenhaService],
  exports: [AutomacaoService, SenhaService],
})
export class AutomacaoModule {}
