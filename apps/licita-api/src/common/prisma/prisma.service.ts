import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../../../gerado/prisma';

/**
 * Cliente do Prisma amarrado ao ciclo de vida do Nest: conecta na
 * subida e desconecta no encerramento. Sem o `onModuleDestroy`, um
 * deploy deixaria conexões penduradas no Postgres até o timeout.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Banco conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
