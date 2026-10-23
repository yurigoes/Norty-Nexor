import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CoreModule } from './common/core.module';
import { AuthGuard } from './common/auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { SerializeInterceptor } from './common/serialize.interceptor';
import { BUSINESS_MODULES } from './modules/registry';
import { loadConfig } from './config/env';

const config = loadConfig();

/**
 * A ordem dos guards globais importa: o throttler barra excesso antes de
 * qualquer trabalho, o AuthGuard identifica quem é e de qual empresa, e
 * só então as permissões decidem o que essa pessoa pode fazer.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: config.rateLimit.ttlSeconds * 1000, limit: config.rateLimit.limit }]),
    JwtModule.register({ global: true, secret: config.jwt.secret, signOptions: { issuer: 'nortycar' }, verifyOptions: { issuer: 'nortycar' } }),
    CoreModule,
    ...BUSINESS_MODULES,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
  ],
})
export class AppModule {}
