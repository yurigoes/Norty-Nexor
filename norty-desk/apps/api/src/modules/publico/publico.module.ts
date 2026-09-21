import { Module } from '@nestjs/common';

import { AttachmentsModule } from '../attachments/attachments.module';
import { FormulariosModule } from '../formularios/formularios.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AberturaService } from './abertura.service';
import { PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';

@Module({
  imports: [TicketsModule, FormulariosModule, AttachmentsModule],
  controllers: [PublicoController],
  providers: [PublicoService, AberturaService],
})
export class PublicoModule {}
