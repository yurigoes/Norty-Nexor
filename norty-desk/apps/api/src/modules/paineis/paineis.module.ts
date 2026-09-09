import { Module } from '@nestjs/common';

import { PaineisController } from './paineis.controller';
import { PaineisService } from './paineis.service';

@Module({
  controllers: [PaineisController],
  providers: [PaineisService],
  exports: [PaineisService],
})
export class PaineisModule {}
