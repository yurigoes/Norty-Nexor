import { Module, forwardRef } from '@nestjs/common';

import { TicketsModule } from '../tickets/tickets.module';
import { RecorrenciasController } from './recorrencias.controller';
import { RecorrenciasJob } from './recorrencias.job';
import { RecorrenciasService } from './recorrencias.service';

@Module({
  // A agenda decide *quando*; abrir o chamado continua sendo do serviço
  // de chamados — numeração, prioridade derivada e acordos da categoria
  // são os mesmos de qualquer outro.
  imports: [forwardRef(() => TicketsModule)],
  controllers: [RecorrenciasController],
  providers: [RecorrenciasService, RecorrenciasJob],
  exports: [RecorrenciasService],
})
export class RecorrenciasModule {}
