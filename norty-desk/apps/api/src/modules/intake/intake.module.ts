import { Module } from '@nestjs/common';

/**
 * Endpoint público de abertura de chamado, autenticado por `ApiKey`
 * com escopos nomeados (`docs/07-api.md`, seção 6).
 *
 * `externalRef` mais `Idempotency-Key` garantem que um monitoramento em
 * laço não abra mil chamados do mesmo incidente.
 *
 * Implementação na Fase 2 (`docs/10-roadmap.md`).
 */
@Module({})
export class IntakeModule {}
