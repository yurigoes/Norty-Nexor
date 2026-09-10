import { Module } from '@nestjs/common';

import { DatacenterController } from './datacenter.controller';
import { DatacenterService } from './datacenter.service';

/** Salas, racks e posição no rack — Fase 7 (docs/10-roadmap.md). */
@Module({
  controllers: [DatacenterController],
  providers: [DatacenterService],
})
export class DatacenterModule {}
