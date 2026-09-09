import { Controller, Get } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  vivo() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Verifica as dependências do CT 102 antes de o Caddy liberar tráfego. */
  @Get('ready')
  async pronto() {
    const checagens: Record<string, 'ok' | 'falha'> = {};

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checagens.postgres = 'ok';
    } catch {
      checagens.postgres = 'falha';
    }

    const status = Object.values(checagens).every((c) => c === 'ok') ? 'ok' : 'degradado';
    return { status, checagens };
  }
}
