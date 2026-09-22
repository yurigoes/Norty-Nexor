import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CofreController } from './cofre.controller';
import { CofreService } from './cofre.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CofreController],
  providers: [CofreService],
  exports: [CofreService],
})
export class CofreModule {}
