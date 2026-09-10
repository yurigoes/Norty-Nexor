import { Module } from '@nestjs/common';

import { ConsumiveisController } from './consumiveis.controller';
import { ConsumiveisService } from './consumiveis.service';

/** Consumíveis e cartuchos, com estoque por movimentação — Fase 6 (docs/10-roadmap.md). */
@Module({
  controllers: [ConsumiveisController],
  providers: [ConsumiveisService],
})
export class ConsumiveisModule {}
