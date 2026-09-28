import { Module } from '@nestjs/common';

import { BuscasSalvasController } from './buscas.controller';
import { BuscasSalvasService } from './buscas.service';

@Module({
  controllers: [BuscasSalvasController],
  providers: [BuscasSalvasService],
})
export class BuscasSalvasModule {}
