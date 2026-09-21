import { Module } from '@nestjs/common';

import { SlaModule } from '../sla/sla.module';
import { AgendamentoController } from './agendamento.controller';
import { AgendamentoService } from './agendamento.service';

@Module({
  imports: [SlaModule],
  controllers: [AgendamentoController],
  providers: [AgendamentoService],
  exports: [AgendamentoService],
})
export class AgendamentoModule {}
