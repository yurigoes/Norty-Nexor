import { Module } from '@nestjs/common';

import { SoftwareController } from './software.controller';
import { SoftwareService } from './software.service';

/** Software, versões, instalações e licenças — Fase 6 (docs/10-roadmap.md). */
@Module({
  controllers: [SoftwareController],
  providers: [SoftwareService],
  exports: [SoftwareService],
})
export class SoftwareModule {}
