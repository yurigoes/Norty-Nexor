import { Module } from '@nestjs/common';

import { DiretorioService } from './diretorio.service';
import { FontesController } from './fontes.controller';

/** Fontes de autenticação (LDAP/AD) por organização — ver docs/13. */
@Module({
  controllers: [FontesController],
  providers: [DiretorioService],
  exports: [DiretorioService],
})
export class DiretorioModule {}
