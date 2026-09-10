import { Module } from '@nestjs/common';

import { AgendaController } from './agenda.controller';
import { AgendaService } from './agenda.service';

/** Agenda da equipe — Fase 8 (docs/10-roadmap.md). */
@Module({
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
