import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AcessoRemotoService } from './acesso-remoto.service';
import { AtivosController } from './ativos.controller';
import { AtivosService } from './ativos.service';
import { PosseService } from './posse.service';

@Module({
  // `AttachmentsModule` traz a porta de armazenamento, onde o PNG do
  // termo de compromisso é guardado — como na ordem de serviço.
  imports: [AuditoriaModule, AttachmentsModule],
  controllers: [AtivosController],
  providers: [AtivosService, AcessoRemotoService, PosseService],
  exports: [AtivosService, AcessoRemotoService, PosseService],
})
export class AtivosModule {}
