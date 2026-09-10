import { Module } from '@nestjs/common';

import { RedeController } from './rede.controller';
import { RedeService } from './rede.service';

/** VLANs, sub-redes, IPs e portas — Fase 6 (docs/10-roadmap.md). */
@Module({
  controllers: [RedeController],
  providers: [RedeService],
})
export class RedeModule {}
