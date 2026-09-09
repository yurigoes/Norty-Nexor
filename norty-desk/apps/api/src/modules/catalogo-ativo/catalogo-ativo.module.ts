import { Module } from '@nestjs/common';

import { CatalogoDoAtivoController } from './catalogo-ativo.controller';
import { CatalogoDoAtivoService } from './catalogo-ativo.service';

@Module({
  controllers: [CatalogoDoAtivoController],
  providers: [CatalogoDoAtivoService],
  exports: [CatalogoDoAtivoService],
})
export class CatalogoDoAtivoModule {}
