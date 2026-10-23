import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PRODUCT_FULL_NAME } from '@nortycar/shared';
import { Public } from '../../common/context';
import { PrismaService } from '../../common/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    const database = await this.prisma.isHealthy();
    const body = {
      status: database ? 'ok' : 'degraded',
      service: PRODUCT_FULL_NAME,
      version: process.env.APP_VERSION ?? '1.0.0',
      database,
      time: new Date().toISOString(),
    };
    if (!database) throw new HttpException(body, HttpStatus.SERVICE_UNAVAILABLE);
    return body;
  }
}
