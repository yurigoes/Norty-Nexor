import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { Controller, Get } from '@nestjs/common';

import { PrismaService } from './common/prisma/prisma.service';
import { JwtAuthGuard } from './common/jwt-auth.guard';
import { Publica } from './common/decorators';
import { AuthModule } from './modules/auth/auth.module';
import { EmpresaController } from './modules/empresa/empresa.controller';
import { LicitacoesController } from './modules/licitacoes/licitacoes.controller';
import { FavoritosController } from './modules/favoritos/favoritos.controller';
import { MonitoramentosController } from './modules/monitoramentos/monitoramentos.controller';
import { ParticipacoesController } from './modules/participacoes/participacoes.controller';
import { IngestaoService } from './modules/ingestao/ingestao.service';
import { EmailService } from './modules/email/email.service';

@Controller('saude')
class SaudeController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * O healthcheck toca o banco de propósito. Uma API que responde
   * "ok" com o Postgres fora do ar faz o orquestrador manter de pé
   * um processo que não serve para nada.
   */
  @Get()
  @Publica()
  async saude() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, em: new Date().toISOString() };
  }
}

@Module({
  imports: [
    AuthModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [
    SaudeController,
    EmpresaController,
    LicitacoesController,
    FavoritosController,
    MonitoramentosController,
    ParticipacoesController,
  ],
  providers: [
    PrismaService,
    EmailService,
    IngestaoService,
    // Autenticação é o padrão: uma rota nova nasce protegida, e
    // abri-la exige o @Publica() explícito. O inverso — proteger
    // rota a rota — deixa buraco na primeira que alguém esquecer.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
