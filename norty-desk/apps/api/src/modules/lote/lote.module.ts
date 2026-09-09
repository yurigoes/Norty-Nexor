import { Module } from '@nestjs/common';

import { AuditoriaModule } from '../auditoria/auditoria.module';
import { TicketsModule } from '../tickets/tickets.module';
import { LoteController } from './lote.controller';
import { LoteService } from './lote.service';

@Module({
  // O lote chama o mesmo caso de uso da tela: nada de `updateMany`, que
  // pularia prioridade, linha do tempo, SLA e saída por canal.
  imports: [TicketsModule, AuditoriaModule],
  controllers: [LoteController],
  providers: [LoteService],
})
export class LoteModule {}
