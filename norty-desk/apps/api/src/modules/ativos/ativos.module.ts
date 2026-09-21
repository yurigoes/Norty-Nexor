import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AcessoRemotoService } from './acesso-remoto.service';
import { AtivosController } from './ativos.controller';
import { AtivosService } from './ativos.service';

@Module({
  imports: [AuditoriaModule],
  controllers: [AtivosController],
  providers: [AtivosService, AcessoRemotoService],
  exports: [AtivosService, AcessoRemotoService],
})
export class AtivosModule {}
