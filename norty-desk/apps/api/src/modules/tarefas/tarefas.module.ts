import { Module } from '@nestjs/common';

import { TarefasController } from './tarefas.controller';
import { TarefasService } from './tarefas.service';

/**
 * Tarefa é um `TicketEvent`: o módulo só precisa do Prisma e do escopo
 * de leitura de chamado, e por isso não importa `TicketsModule`.
 */
@Module({
  controllers: [TarefasController],
  providers: [TarefasService],
  exports: [TarefasService],
})
export class TarefasModule {}
