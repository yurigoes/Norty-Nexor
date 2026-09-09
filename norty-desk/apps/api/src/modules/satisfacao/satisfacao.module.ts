import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ChannelsModule } from '../channels/channels.module';
import { SatisfacaoController } from './satisfacao.controller';
import { SatisfacaoService } from './satisfacao.service';

@Module({
  // A pesquisa sai pela mesma fila de saída das respostas: pelo canal
  // em que a pessoa falou, e com a mesma retentativa.
  imports: [ConfigModule, forwardRef(() => ChannelsModule)],
  controllers: [SatisfacaoController],
  providers: [SatisfacaoService],
  exports: [SatisfacaoService],
})
export class SatisfacaoModule {}
