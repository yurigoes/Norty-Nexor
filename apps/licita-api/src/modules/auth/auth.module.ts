import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailService } from '../email/email.service';
import { carregarConfig } from '../../config/env';

const config = carregarConfig();

@Module({
  imports: [
    JwtModule.register({
      secret: config.jwt.segredo,
      signOptions: { expiresIn: config.jwt.accessTtlSegundos },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, EmailService],
  // O JwtModule sai daqui porque o guard global precisa verificar
  // token em toda rota, não só nas deste módulo.
  exports: [JwtModule, AuthService],
})
export class AuthModule {}
