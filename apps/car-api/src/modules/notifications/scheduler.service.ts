import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { NotifyService } from '../../common/notify.service';
import { orgSettings } from '../../common/org-settings';
import { loadConfig } from '../../config/env';
import { SCHEDULED_JOBS } from './jobs.registry';
import { OutboxService } from './outbox.service';

/** Chave do advisory lock: só uma instância da API roda as rotinas por vez. */
const LOCK_KEY = 74_120_601;

export interface SchedulerRun {
  ran: boolean;
  organizations: number;
  created: number;
  failures: { organizationId: string; job: string; error: string }[];
}

/**
 * Agendador das rotinas. Com várias réplicas da API, todas tentam a cada
 * intervalo, mas só quem obtém o `pg_try_advisory_xact_lock` trabalha;
 * as outras pulam a rodada. O lock vive na transação externa e cai
 * sozinho se o processo morrer.
 *
 * Cada rotina de cada empresa roda na própria transação escopada (RLS):
 * a falha de uma não desfaz as outras, e fica registrada no log.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly config = loadConfig().jobs;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly outbox: OutboxService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.enabled) {
      this.logger.log('Rotinas agendadas desligadas (JOBS_ENABLED=false).');
      return;
    }
    const interval = Math.max(60, this.config.intervalSeconds) * 1000;
    // Primeira rodada um minuto após subir, para não competir com o boot.
    this.timer = setTimeout(() => this.tick(interval), 60_000);
    this.logger.log(`Rotinas agendadas a cada ${interval / 1000}s.`);
  }

  onApplicationShutdown(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private async tick(interval: number): Promise<void> {
    try {
      await this.runOnce();
      await this.outbox.processDue();
    } catch (error) {
      this.logger.error(`Falha na rodada de rotinas: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.timer = setTimeout(() => this.tick(interval), interval);
    }
  }

  async runOnce(now = new Date()): Promise<SchedulerRun> {
    if (this.running) return { ran: false, organizations: 0, created: 0, failures: [] };
    this.running = true;
    try {
      return await this.prisma.$transaction(async (lockTx) => {
        const [{ locked }] = await lockTx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
        if (!locked) return { ran: false, organizations: 0, created: 0, failures: [] };

        const orgs = await this.prisma.platform((tx) => tx.organization.findMany({
          where: { status: { in: ['ACTIVE', 'TRIAL'] } }, select: { id: true, settings: true },
        }));
        const result: SchedulerRun = { ran: true, organizations: orgs.length, created: 0, failures: [] };
        for (const org of orgs) {
          const deps = { notify: this.notify, now, settings: orgSettings(org.settings) };
          for (const job of SCHEDULED_JOBS) {
            try {
              const created = await this.prisma.tenant({ organizationId: org.id }, (tx) => job.run(tx, org.id, deps));
              result.created += Number(created ?? 0);
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              result.failures.push({ organizationId: org.id, job: job.key, error: message.slice(0, 300) });
              this.logger.warn(`Rotina ${job.key} falhou na empresa ${org.id}: ${message}`);
            }
          }
        }
        return result;
      }, { maxWait: 10_000, timeout: 30 * 60_000 });
    } finally {
      this.running = false;
    }
  }
}
