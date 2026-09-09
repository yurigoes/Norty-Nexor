import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    /**
     * `registerAsync`, não `register`.
     *
     * O decorador `@Module` é avaliado quando o arquivo é importado —
     * antes de o `ConfigModule` ter lido o `.env`. Com `register`, o
     * `process.env.JWT_SECRET` chega vazio e a aplicação sobe inteira
     * para só falhar no primeiro login, com "secretOrPrivateKey must
     * have a value". A fábrica assíncrona resolve depois da
     * configuração, que é quando o valor existe.
     */
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');

        // Falhar aqui é falhar na subida, com a causa escrita. Subir
        // sem segredo e assinar token vazio seria pior.
        if (!secret || secret.length < 32) {
          throw new Error(
            'JWT_SECRET ausente ou curto demais (mínimo 32 caracteres). ' +
              'Gere um com: openssl rand -hex 48',
          );
        }

        return {
          secret,
          signOptions: { expiresIn: config.get<string>('JWT_ACCESS_TTL') ?? '15m' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
