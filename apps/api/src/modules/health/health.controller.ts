import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@myhome/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Public } from '../../common/decorators';

/**
 * Endpoint de saúde consumido pelo healthcheck do contêiner e pelo Caddy.
 * Responde 200 mesmo degradado: quem decide o que fazer é o orquestrador,
 * a partir do campo `database`.
 */
@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const database = (await this.prisma.isHealthy()) ? 'up' : 'down';
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      version: process.env.APP_VERSION ?? '1.0.0',
      uptime: Math.round((Date.now() - this.startedAt) / 1000),
      database,
      time: new Date().toISOString(),
    };
  }
}
