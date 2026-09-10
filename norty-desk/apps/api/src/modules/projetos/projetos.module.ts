import { Module } from '@nestjs/common';

import { ProjetosController } from './projetos.controller';
import { ProjetosService } from './projetos.service';

/** Projetos, tarefas de projeto e chamados vinculados — Fase 8 (docs/10-roadmap.md). */
@Module({
  controllers: [ProjetosController],
  providers: [ProjetosService],
})
export class ProjetosModule {}
