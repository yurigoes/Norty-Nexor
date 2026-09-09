import { Module } from '@nestjs/common';

import { RegrasModule } from '../regras/regras.module';
import { TicketsModule } from '../tickets/tickets.module';
import { ApiKeyGuard } from './api-key.guard';
import { IntakeController } from './intake.controller';

/**
 * Endpoint público de abertura de chamado, autenticado por `ApiKey` com
 * escopos nomeados (`docs/07-api.md`, seção 6).
 *
 * `externalRef` mais `Idempotency-Key` garantem que um monitoramento em
 * laço não abra mil chamados do mesmo incidente.
 */
@Module({
  imports: [TicketsModule, RegrasModule],
  controllers: [IntakeController],
  providers: [ApiKeyGuard],
})
export class IntakeModule {}
