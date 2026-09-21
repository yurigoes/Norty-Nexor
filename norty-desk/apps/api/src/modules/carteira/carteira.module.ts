import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { CarteiraController } from './carteira.controller';
import { CarteiraService } from './carteira.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [CarteiraController],
  providers: [CarteiraService],
  exports: [CarteiraService],
})
export class CarteiraModule {}
