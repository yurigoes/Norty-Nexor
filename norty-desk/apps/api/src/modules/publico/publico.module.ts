import { Module } from '@nestjs/common';

import { TicketsModule } from '../tickets/tickets.module';
import { AberturaService } from './abertura.service';
import { PublicoController } from './publico.controller';
import { PublicoService } from './publico.service';

@Module({
  imports: [TicketsModule],
  controllers: [PublicoController],
  providers: [PublicoService, AberturaService],
})
export class PublicoModule {}
