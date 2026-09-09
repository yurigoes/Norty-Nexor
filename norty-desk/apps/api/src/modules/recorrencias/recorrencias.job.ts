import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RecorrenciasService } from './recorrencias.service';

/**
 * O ciclo que abre os chamados recorrentes.
 *
 * De cinco em cinco minutos, não de minuto em minuto: a granularidade
 * da agenda é o minuto configurado, e uma manutenção preventiva que
 * nasce às 8h03 em vez de 8h00 não muda nada — enquanto uma consulta
 * por minuto, para sempre, muda.
 */
@Injectable()
export class RecorrenciasJob {
  private readonly logger = new Logger(RecorrenciasJob.name);
  /** Um ciclo por vez: dois em paralelo disputariam as mesmas agendas. */
  private emCurso = false;

  constructor(private readonly recorrencias: RecorrenciasService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async abrirVencidas(): Promise<void> {
    if (this.emCurso) return;
    this.emCurso = true;

    try {
      const abertos = await this.recorrencias.materializarVencidas();
      if (abertos > 0) this.logger.log(`${abertos} chamado(s) recorrente(s) abertos.`);
    } catch (erro) {
      this.logger.error(`Ciclo de recorrência falhou: ${(erro as Error).message}`);
    } finally {
      this.emCurso = false;
    }
  }
}
