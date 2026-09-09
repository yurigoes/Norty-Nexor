import { Module } from '@nestjs/common';

import { ModelosController } from './modelos.controller';
import { ModelosService } from './modelos.service';

@Module({
  controllers: [ModelosController],
  providers: [ModelosService],
  exports: [ModelosService],
})
export class ModelosModule {}
