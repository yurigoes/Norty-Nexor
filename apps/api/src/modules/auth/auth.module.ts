import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { loadConfig } from '../../config/env';

const config = loadConfig();

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: config.jwt.secret,
      // O tipo de `expiresIn` da biblioteca é uma união literal de
      // formatos ("15m", "1h"...). O valor vem do ambiente, então é
      // string comum e precisa ser afirmado aqui.
      signOptions: {
        expiresIn: config.jwt.accessTtl as `${number}m` | `${number}h`,
        issuer: 'myhome',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
