import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './common/prisma/prisma.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { AuditModule } from './modules/audit/audit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DirectoryModule } from './modules/directory/directory.module';
import { VisitorsModule } from './modules/visitors/visitors.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { TicketsModule } from './modules/tickets/tickets.module';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { loadConfig } from './config/env';

const config = loadConfig();

/**
 * A ordem dos guards globais importa: o throttler barra excesso antes de
 * qualquer trabalho, o JWT identifica quem é, e só então as permissões
 * decidem o que essa pessoa pode fazer.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: config.rateLimit.ttlSeconds * 1000, limit: config.rateLimit.limit },
    ]),
    PrismaModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    HealthModule,
    DirectoryModule,
    VisitorsModule,
    DeliveriesModule,
    ReservationsModule,
    TicketsModule,
    ProfessionalsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  ],
})
export class AppModule {}
