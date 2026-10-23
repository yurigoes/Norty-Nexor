import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '../generated/prisma';

/** Cliente de transação. Todo service recebe este tipo, nunca o cliente raiz. */
export type Tx = Prisma.TransactionClient;

export interface TenantScope {
  organizationId: string;
}

const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

/**
 * Acesso ao banco com o isolamento multiempresa embutido.
 *
 * `tenant()` abre uma transação e declara a empresa com SET LOCAL; a
 * política de RLS do PostgreSQL faz o resto. Um `where` esquecido não
 * vaza dados de outra locadora — devolve vazio.
 *
 * `platform()` liga o bypass de RLS. É o único lugar do código que faz
 * isso, e só deve ser usado por login, Master, rotinas agendadas e site
 * público (que resolve a empresa pelo domínio antes de consultar).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado ao PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  tenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!scope?.organizationId) throw new Error('Contexto de empresa ausente na transação.');
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.org_id', ${scope.organizationId}, true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  platform<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
      return fn(tx);
    }, TX_OPTIONS);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
