import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AcessoRemotoService } from './acesso-remoto.service';
import { AtivosController } from './ativos.controller';
import { AtivosService } from './ativos.service';
import { PosseService } from './posse.service';
import { TermosService } from './termos.service';

@Module({
  // `AttachmentsModule` traz a porta de armazenamento, onde o PNG do
  // termo de compromisso é guardado — como na ordem de serviço.
  imports: [AuditoriaModule, AttachmentsModule],
  controllers: [AtivosController],
  providers: [AtivosService, AcessoRemotoService, PosseService, TermosService],
  exports: [AtivosService, AcessoRemotoService, PosseService, TermosService],
})
export class AtivosModule {}
