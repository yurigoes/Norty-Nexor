import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TranscricaoService } from './transcricao.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [TranscricaoService],
  exports: [TranscricaoService],
})
export class TranscricaoModule {}
